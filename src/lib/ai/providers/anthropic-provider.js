import { registerProvider } from '../ai-provider.js';

/**
 * Anthropic adapter (Messages API + tool_use blocks) — zero SDK, plain fetch.
 */

function toAnthropicMessage(message) {
  if (message.role === 'tool') {
    return {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: message.toolCallId,
          content: JSON.stringify(message.content ?? {}),
        },
      ],
    };
  }
  if (message.role === 'assistant' && message.toolCalls?.length) {
    const blocks = [];
    if (message.content) blocks.push({ type: 'text', text: message.content });
    for (const call of message.toolCalls) {
      blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.args ?? {} });
    }
    return { role: 'assistant', content: blocks };
  }
  return { role: message.role, content: message.content };
}

export const anthropicProvider = ({ apiKey, model = 'claude-sonnet-4-5' }) => ({
  id: 'anthropic',

  async chat({ system, messages, tools, signal }) {
    const body = {
      model,
      max_tokens: 1024,
      ...(system ? { system } : {}),
      messages: messages.filter((m) => m.role !== 'system').map(toAnthropicMessage),
      ...(tools.length
        ? {
            tools: tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              input_schema: tool.parameters,
            })),
          }
        : {}),
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Anthropic API error ${response.status}: ${detail.slice(0, 200)}`);
    }

    const data = await response.json();
    const blocks = data.content ?? [];

    return {
      content: blocks
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n'),
      toolCalls: blocks
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({ id: b.id, name: b.name, args: b.input ?? {} })),
    };
  },
});

registerProvider('anthropic', anthropicProvider);
