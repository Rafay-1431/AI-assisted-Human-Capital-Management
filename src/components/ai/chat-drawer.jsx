'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setChatPanelOpen } from '@/store/slices/uiSlice';

/**
 * Floating AI Assistant widget (M8, checklist 19): a bottom-right avatar with
 * a one-time greeting bubble that toggles a compact chat card. Messages live
 * client-side; the server route enforces role-scoped tools, rate limits, the
 * 15 s timeout and ai_logs. Answers carry an 'AI-generated' label.
 */

const SUGGESTIONS = {
  admin: ['How many active employees do we have?', 'What is the payroll cost so far?', 'Who came late most often this month?'],
  hr: ['What is this month\'s attendance rate?', 'Who came late most often this month?', 'How many pending corrections are there?'],
  employee: ['How many hours did I work this week?', 'What is my attendance summary?', 'What is the office timing and grace period?'],
};

export default function ChatDrawer({ role = 'employee', userName = '' }) {
  const dispatch = useAppDispatch();
  const open = useAppSelector((s) => s.ui.chatPanelOpen);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [greetingVisible, setGreetingVisible] = useState(false);
  const scrollRef = useRef(null);

  // One-time greeting bubble, auto-dismissed; never shown again after opening.
  useEffect(() => {
    const show = setTimeout(() => setGreetingVisible(true), 1500);
    const hide = setTimeout(() => setGreetingVisible(false), 14000);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, []);

  useEffect(() => {
    if (open) setGreetingVisible(false);
  }, [open]);

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

  const firstName = userName ? userName.split(' ')[0] : '';

  return (
    <>
      {/* Compact floating chat card — anchored above the avatar */}
      {open ? (
        <div className="page-enter fixed bottom-24 right-6 z-40 flex h-[28rem] max-h-[75vh] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl sm:w-96">
          <div className="flex items-center justify-between bg-gradient-to-br from-teal-600 to-teal-700 px-4 py-3 text-white">
            <div>
              <p className="font-semibold">HCM Lite Assistant</p>
              <p className="text-xs text-teal-100">Real data · role-scoped · AI-generated</p>
            </div>
            <div className="flex items-center gap-2">
              {messages.length > 0 ? (
                <button className="text-xs text-teal-100 hover:text-white" onClick={() => setMessages([])}>Clear</button>
              ) : null}
              <button
                className="flex h-8 w-8 items-center justify-center rounded-full text-teal-100 hover:bg-white/10"
                onClick={() => dispatch(setChatPanelOpen(false))}
                aria-label="Close chat"
              >
                ✕
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">
                  Hi{firstName ? ` ${firstName}` : ''}! Ask about attendance, payroll or policy — I only see what your role allows, and I never change data.
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
                <div className="flex items-center gap-1.5 rounded-2xl bg-gray-100 px-3 py-2.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
                </div>
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

      {/* Greeting bubble */}
      {greetingVisible && !open ? (
        <div className="page-enter fixed bottom-24 right-6 z-30 max-w-60 rounded-2xl rounded-br-md bg-white p-3 pr-5 text-xs leading-relaxed text-gray-600 shadow-xl ring-1 ring-gray-200">
          Hi{firstName ? `, ${firstName}` : ''}! 👋 I'm your HR assistant — ask me about attendance, payroll or company policy.
          <button
            onClick={() => setGreetingVisible(false)}
            aria-label="Dismiss greeting"
            className="absolute right-1.5 top-1.5 text-gray-300 hover:text-gray-500"
          >
            ✕
          </button>
        </div>
      ) : null}

      {/* Floating avatar button */}
      <button
        onClick={() => dispatch(setChatPanelOpen(!open))}
        aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-teal-700 text-2xl text-white shadow-lg shadow-teal-600/40 ring-4 ring-white transition-transform hover:scale-105 active:scale-95"
      >
        {open ? '✕' : '✦'}
      </button>
    </>
  );
}
