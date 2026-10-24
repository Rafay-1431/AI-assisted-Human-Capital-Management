/**
 * AI provider abstraction (M8).
 *
 * Everything above this file speaks ONE normalized format; everything below
 * it is a thin adapter per LLM vendor. Swapping providers = changing
 * AI_PROVIDER/AI_MODEL env vars, or registering a new adapter — zero changes
 * to tools, prompts, or the orchestration loop.
 *
 * ── Normalized message ──────────────────────────────────────────────────────
 *   { role: 'system'|'user'|'assistant'|'tool',
 *     content: string,
 *     toolCalls?: [{ id, name, args }],   // assistant messages that invoke tools
 *     toolCallId?: string, toolName?: string }  // 'tool' role = a tool result
 *
 * ── Tool definition (see tools/) ────────────────────────────────────────────
 *   { name, description, permission: 'staff'|'all',
 *     parameters: <JSON Schema>, execute(ctx, args) => object }
 *
 * ── Provider adapter contract ───────────────────────────────────────────────
 *   { id, chat({ system, messages, tools, signal })
 *       => Promise<{ content: string, toolCalls: [{ id, name, args }] }> }
 *   The adapter owns ALL vendor-specific mapping, headers and endpoints.
 */

const registry = new Map();

/**
 * Register a provider factory under an id (e.g. 'openai', 'anthropic').
 * Provider modules self-register on import (see providers/openai-provider.js).
 * @param {string} id
 * @param {(opts: { apiKey: string, model: string }) => object} factory
 */
export function registerProvider(id, factory) {
  registry.set(id, factory);
}

/**
 * Build a provider instance from env configuration.
 * @param {string} id AI_PROVIDER env value
 * @param {{ apiKey?: string, model?: string }} opts
 */
export function createProvider(id, { apiKey, model } = {}) {
  const factory = registry.get(id);
  if (!factory) {
    throw new Error(
      `Unknown AI provider "${id}". Available: ${[...registry.keys()].join(', ')}.`,
    );
  }
  if (!apiKey) {
    throw new Error('AI_API_KEY is not set. The browser never calls the AI provider — set the key in server env only.');
  }
  return factory({ apiKey, model });
}

/** @returns {string[]} ids available for diagnostics / admin UI */
export function listProviders() {
  return [...registry.keys()];
}
