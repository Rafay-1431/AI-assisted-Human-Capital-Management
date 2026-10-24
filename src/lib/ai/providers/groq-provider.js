import { registerProvider } from '../ai-provider.js';
import { openaiProvider } from './openai-provider.js';

/**
 * Groq adapter — Groq exposes an OpenAI-compatible API, so this is the
 * OpenAI adapter pinned to Groq's endpoint and model default.
 *
 * Env: AI_PROVIDER=groq, AI_API_KEY=<gsk_...>, AI_MODEL=e.g. llama-3.3-70b-versatile
 */
export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

registerProvider('groq', (opts = {}) =>
  openaiProvider({
    model: 'openai/gpt-oss-120b',
    baseUrl: GROQ_BASE_URL,
    // drop undefined keys so they cannot override the defaults above
    ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)),
  }),
);
