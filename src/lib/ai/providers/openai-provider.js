import { registerProvider } from '../ai-provider.js';

/**
 * OpenAI adapter (Chat Completions + function tools) — zero SDK, plain fetch.
 * Any OpenAI-compatible endpoint (Azure OpenAI, Groq, Together, OpenRouter)
 * can reuse this adapter by overriding the base URL via AI_BASE_URL.
 */

function safeParse(raw) {
  try {
    return JSON.parse(raw ?? '{}');
  } catch {
    return {};
  }
}

/** normalized → OpenAI message format */
function toOpenAiMessage(message) {
  if (message.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: message.toolCallId,
      content: JSON.stringify(message.content ?? {}),
    };
  }
  if (message.role === 'assistant' && message.toolCalls?.length) {
    return {
      role: 'assistant',
      content: message.content ?? null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
      })),
    };
  }
  return { role: message.role, content: message.content };
}

export const openaiProvider = ({ apiKey, model = 'gpt-4o-mini', baseUrl = 'https://api.openai.com/v1' }) => ({
  id: 'openai',

  /**
   * @param {{ system: string, messages: object[], tools: object[], signal: AbortSignal }} opts
   * @returns {Promise<{ content: string, toolCalls: { id: string, name: string, args: object }[] }>}
   */
  async chat({ system, messages, tools, signal }) {
    const body = {
      model,
      messages: [{ role: 'system', content: system }, ...messages.map(toOpenAiMessage)],
      ...(tools.length
        ? {
            tools: tools.map((tool) => ({
              type: 'function',
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
              },
            })),
            tool_choice: 'auto',
          }
        : {}),
    };

    // One retry for transient failures (rate limits, 5xx, and Groq's
    // occasional tool-call decoding hiccup). Auth/model errors are terminal.
    let response;
    for (let attempt = 0; attempt < 2; attempt++) {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      });
      if (response.ok) break;
      const retryable =
        response.status === 429 ||
        response.status >= 500 ||
        (response.status === 400 && (await response.clone().text()).includes('tool_use_failed'));
      if (!retryable || attempt === 1) break;
      await new Promise((r) => setTimeout(r, 600));
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`OpenAI API error ${response.status}: ${detail.slice(0, 200)}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message ?? {};

    return {
      content: message.content ?? '',
      toolCalls: (message.tool_calls ?? []).map((call) => ({
        id: call.id,
        name: call.function?.name,
        args: safeParse(call.function?.arguments),
      })),
    };
  },
});

registerProvider('openai', openaiProvider);
