import { useEffect, useRef } from 'react';
import { Lock, Plus, Search, Sparkles } from 'lucide-react';
import { Pill } from '../components/Pill.tsx';

// Splits into fenced-code vs plain-text blocks first, since the write-sql-query
// skill's output (and any SQL the agent drafts) always arrives as a ```sql fence
// that needs its own rendering pass rather than being treated as plain lines.
function splitIntoBlocks(answer) {
  const lines = answer.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const fenceMatch = lines[i].trim().match(/^```(\w*)$/);
    if (fenceMatch) {
      const codeLines = [];
      i += 1;
      while (i < lines.length && lines[i].trim() !== '```') {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence
      blocks.push({ type: 'code', lang: fenceMatch[1], content: codeLines.join('\n') });
    } else {
      blocks.push({ type: 'line', content: lines[i] });
      i += 1;
    }
  }

  return blocks;
}

function renderAnswer(answer) {
  if (!answer) return null;

  return splitIntoBlocks(answer).map((block, index) => {
    if (block.type === 'code') {
      return (
        <pre key={index} className="mg-mono mg-scroll my-2 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-xs leading-5 text-[var(--teal)]">
          <code>{block.content}</code>
        </pre>
      );
    }

    const trimmed = block.content.trim();

    if (!trimmed) {
      return <div key={index} className="h-2" />;
    }

    if (trimmed === '---') {
      return <hr key={index} className="border-[var(--border)]" />;
    }

    if (trimmed.startsWith('### ')) {
      return (
        <h3 key={index} className="mt-4 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--violet)]">
          {trimmed.replace(/^###\s+/, '').replace(/\*\*/g, '')}
        </h3>
      );
    }

    if (trimmed.startsWith('## ')) {
      return (
        <h4 key={index} className="mt-4 text-sm font-semibold text-[var(--text)]">
          {trimmed.replace(/^##\s+/, '').replace(/\*\*/g, '')}
        </h4>
      );
    }

    if (trimmed.startsWith('* ')) {
      return (
        <li key={index} className="ml-5 list-disc text-sm leading-6 text-[var(--text-dim)]">
          {trimmed.replace(/^\*\s+/, '').replace(/\*\*/g, '')}
        </li>
      );
    }

    return (
      <p key={index} className="text-sm leading-6 text-[var(--text-dim)]">
        {trimmed.replace(/\*\*/g, '')}
      </p>
    );
  });
}

function ChatBubble({ message }) {
  if (message.role === 'system') {
    return (
      <div className="flex justify-center py-1">
        <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-[11px] text-[var(--text-faint)]">
          {message.content}
        </span>
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--violet)] px-4 py-2.5 text-sm text-[#100B24]">
          {message.content}
        </div>
      </div>
    );
  }

  const matchedTables = message.matchedTables || [];

  return (
    <div className="flex justify-start">
      <div
        className={`max-w-[90%] rounded-2xl rounded-bl-sm border px-4 py-3 ${
          message.isError
            ? 'border-[var(--rose-soft)] bg-[var(--rose-soft)]'
            : 'border-[var(--border)] bg-[var(--surface)]'
        }`}
      >
        {message.pending ? (
          <div className="flex items-center gap-1.5 py-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--text-faint)] [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--text-faint)] [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--text-faint)]" />
          </div>
        ) : (
          <>
            <div className="space-y-1">{renderAnswer(message.content)}</div>
            {(matchedTables.length > 0 || message.skillsLoaded?.length > 0) && (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[var(--border)] pt-2.5">
                {matchedTables.map(tableName => (
                  <Pill key={tableName} tone="brand">{tableName}</Pill>
                ))}
                {message.skillsLoaded?.map(skillId => (
                  <Pill key={skillId} tone="warn">skill: {skillId}</Pill>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function AskSection({ chatMessages, isSearching, onNewChat, onQueryChange, onSendMessage, ragQuery, setUserRole, suggestions, userRole }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatMessages]);

  const hasMessages = chatMessages.length > 0;

  return (
    <section className="flex h-[calc(100vh-11rem)] min-h-[520px] flex-col space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] p-5" style={{ background: 'linear-gradient(150deg, var(--violet-soft), transparent 65%), var(--surface)' }}>
        <div className="mg-graph-texture pointer-events-none absolute inset-0 opacity-[0.06]" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--violet-soft)]"><Sparkles size={19} className="text-[var(--violet)]" /></span>
            <div>
              <h2 className="mg-display text-lg font-semibold">Ask a question</h2>
              <p className="text-xs text-[var(--text-dim)]">Chat with the agent over the live metadata catalog.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1">
              <button type="button" onClick={() => setUserRole('ADMIN')} className={`rounded-md px-3 py-1 text-xs font-medium transition ${userRole === 'ADMIN' ? 'bg-[var(--amber-soft)] text-[var(--amber)]' : 'text-[var(--text-dim)]'}`}>Admin</button>
              <button type="button" onClick={() => setUserRole('ANALYST')} className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition ${userRole === 'ANALYST' ? 'bg-[var(--rose-soft)] text-[var(--rose)]' : 'text-[var(--text-dim)]'}`}><Lock size={12} />Analyst</button>
            </div>
            <button
              type="button"
              onClick={onNewChat}
              disabled={!hasMessages}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-xs font-medium text-[var(--text-dim)] transition hover:bg-[var(--hover-strong)] hover:text-[var(--text)] disabled:opacity-40"
            >
              <Plus size={13} />New chat
            </button>
          </div>
        </div>
      </div>

      {hasMessages ? (
        <div ref={scrollRef} className="mg-scroll flex-1 space-y-3 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
          {chatMessages.map(message => (
            <ChatBubble key={message.id} message={message} />
          ))}
        </div>
      ) : (
        <div className="flex-1 rounded-2xl border border-dashed border-[var(--border-strong)] p-8">
          <p className="text-center text-sm text-[var(--text-faint)]">Ask about tables, columns, PII, lineage, or request a SQL query.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {suggestions.map(suggestion => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onSendMessage(null, suggestion)}
                className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs text-[var(--text-dim)] transition hover:bg-[var(--hover-strong)] hover:text-[var(--text)]"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={onSendMessage} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
          <input
            value={ragQuery}
            onChange={event => onQueryChange(event.target.value)}
            placeholder="e.g. Which table contains customer contact details?"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] py-3 pl-10 pr-4 text-sm text-[var(--text)] outline-none focus:border-[var(--violet)]/50"
          />
        </div>
        <button disabled={isSearching || !ragQuery.trim()} className="rounded-xl bg-[var(--violet)] px-5 py-3 text-sm font-semibold text-[#100B24] transition hover:brightness-110 disabled:opacity-60">
          {isSearching ? 'Thinking…' : 'Send'}
        </button>
      </form>
    </section>
  );
}
