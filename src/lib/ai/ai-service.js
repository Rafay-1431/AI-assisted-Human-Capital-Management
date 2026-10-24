import 'server-only';
import { createProvider } from './ai-provider';
import './providers/openai-provider';
import './providers/anthropic-provider';
import './providers/groq-provider';
import { toolsForRole, getTool } from './tools';
import { buildSystemPrompt } from './prompts/system-prompt';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * AI orchestration (M8) — implements every guardrail from the brief:
 *   - API key only in a backend env var; the browser never calls the provider.
 *   - The model never queries the database directly: tools reuse the same
 *     user-scoped client + permission model as the actions layer.
 *   - The AI never writes data (all tools are read-only).
 *   - 15 s timeout, friendly fallback, ~20 requests/user/hour,
 *     every call logged in ai_logs, answers carry an 'AI-generated' label.
 */

const MAX_TOOL_ROUNDS = 4;
const TIMEOUT_MS = 15_000;
const HOURLY_LIMIT = 20;

export const FALLBACK_MESSAGE =
  'I could not reach the AI service right now. Your data is safe — please try again in a moment, or use the dashboards.';

/** @typedef {{ userId: string, role: string, employeeId?: string, supabase: object, companyName?: string }} AssistantContext */

function getProvider() {
  const apiKey = process.env.AI_API_KEY?.trim();
  // Default to Groq for gsk_... keys, OpenAI otherwise; AI_PROVIDER overrides.
  const providerId =
    (process.env.AI_PROVIDER ?? '').trim() || (apiKey?.startsWith('gsk_') ? 'groq' : 'openai');
  const opts = { apiKey };
  const model = (process.env.AI_MODEL ?? '').trim();
  if (model) opts.model = model;
  const baseUrl = (process.env.AI_BASE_URL ?? '').trim();
  if (baseUrl) opts.baseUrl = baseUrl;
  return createProvider(providerId, opts);
}

/** ai_logs is infrastructure — written with the service-role key, server-side. */
function logAiCall(profile, { tool = null, success, latencyMs, error = null, meta = null }) {
  const admin = getSupabaseAdminClient();
  admin
    .from('ai_logs')
    .insert({
      user_id: profile.id,
      role: profile.role,
      tool_name: tool,
      success,
      latency_ms: latencyMs ?? null,
      error,
      meta,
    })
    .then(); // fire-and-forget; failures must not break the chat
}

async function checkRateLimit(profile) {
  const admin = getSupabaseAdminClient();
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await admin
    .from('ai_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', profile.id)
    .gte('created_at', since);
  return (count ?? 0) >= HOURLY_LIMIT;
}

/**
 * Chat with tools.
 * @param {{ profile: object, history: object[], companyName?: string }} opts
 *   history: normalized messages [{ role: 'user'|'assistant', content }, ...]
 * @returns {Promise<{ reply: string, label: 'AI-generated', degraded?: boolean }>}
 */
export async function runAssistantChat({ profile, history, companyName }) {
  if (await checkRateLimit(profile)) {
    return {
      reply: 'You have reached the hourly limit of 20 AI requests. Please try again later.',
      label: 'AI-generated',
      degraded: true,
    };
  }

  let provider;
  try {
    provider = getProvider();
  } catch (error) {
    console.error('[ai] provider config error:', error.message);
    return { reply: FALLBACK_MESSAGE, label: 'AI-generated', degraded: true };
  }

  const supabase = await getSupabaseServerClient();
  const ctx = {
    userId: profile.id,
    role: profile.role,
    employeeId: profile.employeeId ?? null,
    supabase,
    companyName,
  };

  const allowed = toolsForRole(profile.role);
  const messages = history.slice(-12); // keep context bounded

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response;
    try {
      response = await provider.chat({
        system: buildSystemPrompt({ role: profile.role, companyName }),
        messages,
        tools: allowed,
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      logAiCall(profile, {
        success: false,
        latencyMs: Date.now() - started,
        error: error?.name === 'AbortError' ? 'timeout' : String(error?.message ?? error),
      });
      return { reply: FALLBACK_MESSAGE, label: 'AI-generated', degraded: true };
    }
    clearTimeout(timer);

    if (!response.toolCalls?.length) {
      logAiCall(profile, { success: true, latencyMs: Date.now() - started });
      return { reply: response.content, label: 'AI-generated' };
    }

    // Execute tool calls with the user's scope, then feed results back.
    messages.push({ role: 'assistant', content: response.content ?? '', toolCalls: response.toolCalls });

    for (const call of response.toolCalls) {
      const tool = getTool(call.name);
      let result;
      if (!tool || !allowed.some((t) => t.name === call.name)) {
        result = { error: 'Permission denied for this operation.' };
      } else {
        try {
          result = await tool.execute(ctx, call.args ?? {});
        } catch (error) {
          result = { error: 'The tool failed. Answer only from other data or say you do not know.' };
        }
      }
      messages.push({
        role: 'tool',
        toolCallId: call.id,
        toolName: call.name,
        content: result,
      });
      logAiCall(profile, {
        tool: call.name,
        success: !result.error,
        latencyMs: Date.now() - started,
        meta: { args: call.args ?? null },
      });
    }
  }

  return {
    reply: 'I could not complete that request with the available data. Please rephrase, or check the dashboards.',
    label: 'AI-generated',
    degraded: true,
  };
}

/**
 * Dashboard "Summarize" (Admin/HR): send the KPI JSON for the CURRENT filters,
 * get back 3–5 insight bullets that use only those numbers. JSON output is
 * validated; on failure it retries once, then the caller shows the normal
 * dashboard (per the brief's guardrail).
 *
 * @param {{ profile: object, kpis: object, filters: object }} opts
 * @returns {Promise<{ bullets: string[] } | { bullets: null }>}
 */
export async function summarizeDashboard({ profile, kpis, filters }) {
  const instruction = [
    'You are summarizing an HR dashboard. Here is the KPI JSON for the current filters:',
    JSON.stringify({ filters, kpis }),
    '',
    'Return STRICT JSON only: {"bullets": ["...", "...", ...]} with 3 to 5 short bullets.',
    'Use ONLY the numbers provided — never invent or estimate. Write plain, useful insights',
    '(trends, outliers, things HR should look at). No markdown, no extra keys.',
  ].join('\n');

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const provider = getProvider();
      const response = await provider.chat({
        system: buildSystemPrompt({ role: profile.role }),
        messages: [{ role: 'user', content: instruction }],
        tools: [],
        signal: controller.signal,
      });
      clearTimeout(timer);

      const jsonText = (response.content ?? '').match(/\{[\s\S]*\}/)?.[0];
      const parsed = jsonText ? JSON.parse(jsonText) : null;
      const bullets = parsed?.bullets;
      if (Array.isArray(bullets) && bullets.length >= 3 && bullets.every((b) => typeof b === 'string')) {
        return { bullets: bullets.slice(0, 5) };
      }
    } catch {
      clearTimeout(timer);
    }
  }
  return { bullets: null }; // caller falls back to the normal dashboard
}
