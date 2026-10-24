'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setChatPanelOpen } from '@/store/slices/uiSlice';

/**
 * AI chat panel (M8, checklist 19): a right-side drawer available to every
 * role. Messages live client-side; the server route enforces role-scoped
 * tools, rate limits, the 15 s timeout and ai_logs. Answers carry an
 * 'AI-generated' label; degraded replies show the friendly fallback.
 */

const SUGGESTIONS = {
  admin: ['How many active employees do we have?', 'What is the payroll cost so far?', 'Who came late most often this month?'],
  hr: ['What is this month\'s attendance rate?', 'Who came late most often this month?', 'How many pending corrections are there?'],
  employee: ['How many hours did I work this week?', 'What is my attendance summary?', 'What is the office timing and grace period?'],
};

export default function ChatDrawer({ role = 'employee' }) {
  const dispatch = useAppDispatch();
  const open = useAppSelector((s) => s.ui.chatPanelOpen);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending]);

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || pending) return;
    const next = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setPending(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.slice(-12) }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: data.reply ?? data.error ?? 'No response.', degraded: Boolean(data.degraded) },
      ]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'I could not reach the AI service. Please try again shortly.', degraded: true }]);
    }
    setPending(false);
  }

  return (
    <>
      <button
        onClick={() => dispatch(setChatPanelOpen(!open))}
        className="rounded-lg bg-teal-50 px-3 py-1.5 text-sm font-semibold text-teal-700 ring-1 ring-teal-200 hover:bg-teal-100"
      >
        ✦ AI Assistant
      </button>

      {open ? (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <div>
              <p className="font-semibold text-gray-900">HCM Lite Assistant</p>
              <p className="text-xs text-gray-400">Answers from real data · role-scoped · AI-generated</p>
            </div>
            <div className="flex items-center gap-2">
              {messages.length > 0 ? (
                <button className="text-xs text-gray-400 hover:text-gray-600" onClick={() => setMessages([])}>Clear</button>
              ) : null}
              <button className="text-gray-400 hover:text-gray-600" onClick={() => dispatch(setChatPanelOpen(false))} aria-label="Close">✕</button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">
                  Ask about attendance, payroll or company policy. I only see what your role allows — and I never touch data.
                </p>
                <div className="flex flex-wrap gap-2">
                  {(SUGGESTIONS[role] ?? SUGGESTIONS.employee).map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-full bg-gray-100 px-3 py-1.5 text-xs text-gray-600 hover:bg-teal-50 hover:text-teal-700"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                    m.role === 'user' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {m.content}
                  {m.role === 'assistant' ? (
                    <span className="mt-1 block text-[10px] uppercase tracking-wide text-gray-400">
                      {m.degraded ? 'unavailable' : 'AI-generated'}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}

            {pending ? (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-gray-100 px-3 py-2 text-sm text-gray-400">Thinking…</div>
              </div>
            ) : null}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex items-end gap-2 border-t border-gray-200 p-3"
          >
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder="Ask anything about your HR data…"
              className="max-h-32 flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
