import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';

// Floating "Ask" assistant, mounted once by AppShell so it is available on
// every page. It only ever talks to this site's own /lab/ask endpoint — the
// model API key lives on the backend and never reaches the browser.

const SUGGESTIONS = [
  'What ran recently and did anything fail?',
  'Summarise the latest Brand Concierge monitor run',
  'Which checks need review and why?',
  'What is failing on bacom-live-qa?',
];

const STORAGE_KEY = 'askAgentThread';

// Tiny inline-markdown renderer: the models answer with **bold**, `code` and
// dashed bullets, which is all we need. Anything else renders as plain text.
const renderInline = (text) => text
  .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  .filter(Boolean)
  .map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/15">{part.slice(1, -1)}</code>;
    }
    return <span key={i}>{part}</span>;
  });

const Markdown = ({ text }) => {
  const blocks = [];
  let bullets = [];
  const flush = () => {
    if (!bullets.length) return;
    blocks.push(<ul key={`u${blocks.length}`} className="ml-4 list-disc space-y-1">{bullets}</ul>);
    bullets = [];
  };
  text.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      bullets.push(<li key={i}>{renderInline(bullet[1])}</li>);
      return;
    }
    flush();
    if (line.trim()) blocks.push(<p key={i}>{renderInline(line)}</p>);
  });
  flush();
  return <div className="space-y-2">{blocks}</div>;
};

Markdown.propTypes = { text: PropTypes.string.isRequired };

const AskPanel = () => {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState(null);
  const [model, setModel] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const scroller = useRef(null);
  const field = useRef(null);

  useEffect(() => {
    fetch('/lab/config', { cache: 'no-store' })
      .then((r) => r.json())
      .then((c) => {
        setConfigured(Boolean(c.askAgentConfigured));
        setModel(c.askAgentModel || '');
      })
      .catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-20)));
  }, [messages]);

  useEffect(() => {
    if (open) scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open, busy]);

  // Focus on open, and again once a reply lands, so the panel is always ready
  // for the next question without a click.
  useEffect(() => {
    if (open && configured && !busy) field.current?.focus();
  }, [open, configured, busy]);

  const send = useCallback(async (text) => {
    const question = text.trim();
    if (!question || busy) return;
    const next = [...messages, { role: 'user', content: question }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/lab/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Only role/content go over the wire — `tools` is UI-only metadata.
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      const data = await res.json();
      if (data.configured === false) {
        setConfigured(false);
        setMessages([...next, { role: 'assistant', content: data.message, error: true }]);
      } else if (data.error) {
        setMessages([...next, { role: 'assistant', content: data.error, error: true }]);
      } else {
        setMessages([...next, {
          role: 'assistant',
          content: data.reply || 'The model returned an empty answer — try rephrasing.',
          tools: data.tools || [],
          followUps: data.followUps || [],
        }]);
      }
    } catch (e) {
      setMessages([...next, { role: 'assistant', content: String(e.message || e), error: true }]);
    } finally {
      setBusy(false);
    }
  }, [busy, messages]);

  if (configured === null) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-[65] flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-500"
        title="Ask about your runs and results"
      >
        <span aria-hidden>✦</span>
        {open ? 'Close' : 'Ask'}
      </button>

      {open && (
        <section className="fixed bottom-20 right-4 z-[64] flex h-[min(34rem,75vh)] w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950">
          <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Ask nala-auto</h2>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {configured ? `Reads your runs and results · ${model || 'AI Foundry'}` : 'Not configured'}
              </p>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setMessages([])}
                className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                Clear
              </button>
            )}
          </header>

          <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
            {!configured && (
              <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                The Ask agent needs an AI Foundry key. An admin must set <code className="font-mono">AI_FOUNDRY_API_KEY</code> on
                the backend and restart it. See README.md.
              </p>
            )}
            {configured && messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  I can read this console&apos;s recent runs, Brand Concierge monitor checks and screenshot-diff results. Try:
                </p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-xs text-gray-700 transition hover:border-indigo-400 hover:bg-indigo-50 dark:border-gray-800 dark:text-gray-300 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex flex-col items-start gap-1.5'}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                    m.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : m.error
                        ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                  }`}
                >
                  <Markdown text={m.content} />
                  {m.tools?.length > 0 && (
                    <p className="mt-1.5 text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      read: {[...new Set(m.tools)].join(', ')}
                    </p>
                  )}
                </div>
                {/* Only the newest answer offers follow-ups — older ones would
                    re-ask questions the thread has already moved past. */}
                {i === messages.length - 1 && !busy && m.followUps?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.followUps.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => send(q)}
                        className="rounded-full border border-gray-300 px-2.5 py-1 text-[11px] text-gray-600 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 dark:border-gray-700 dark:text-gray-400 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && <p className="text-xs text-gray-500 dark:text-gray-400">Thinking…</p>}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="flex gap-2 border-t border-gray-200 p-3 dark:border-gray-800"
          >
            <input
              ref={field}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!configured}
              placeholder={configured ? 'Ask about a run, dataset or BC check…' : 'Unavailable'}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
            <button
              type="submit"
              disabled={!configured || busy || !input.trim()}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </section>
      )}
    </>
  );
};

export default AskPanel;
