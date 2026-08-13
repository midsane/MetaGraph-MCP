import type { LlmMessage } from '../llm/types.js';
import type { Role } from '../rbac/redact.js';

interface SessionRecord {
  messages: LlmMessage[];
  role: Role;
  provider: string;
  createdAt: number;
  updatedAt: number;
}

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours of inactivity
const MAX_SESSIONS = 500;
// Retained as user-message boundaries, not raw message count, so a trim
// never separates an assistant tool-call from its 'tool' result messages -
// splitting that pairing would break provider-side history replay.
const MAX_HISTORY_TURNS = 12;

const sessions = new Map<string, SessionRecord>();

function isExpired(record: SessionRecord): boolean {
  return Date.now() - record.updatedAt > SESSION_TTL_MS;
}

function evictExpired() {
  for (const [id, record] of sessions) {
    if (isExpired(record)) sessions.delete(id);
  }
}

function evictOldestIfOverCapacity() {
  if (sessions.size <= MAX_SESSIONS) return;
  let oldestId: string | null = null;
  let oldestAt = Infinity;
  for (const [id, record] of sessions) {
    if (record.updatedAt < oldestAt) {
      oldestAt = record.updatedAt;
      oldestId = id;
    }
  }
  if (oldestId) sessions.delete(oldestId);
}

function trimHistory(messages: LlmMessage[]): LlmMessage[] {
  const userStartIndices: number[] = [];
  messages.forEach((m, i) => {
    if (m.role === 'user') userStartIndices.push(i);
  });
  if (userStartIndices.length <= MAX_HISTORY_TURNS) return messages;
  const cutIndex = userStartIndices[userStartIndices.length - MAX_HISTORY_TURNS];
  return messages.slice(cutIndex);
}

export interface LoadedSession {
  sessionId: string;
  history: LlmMessage[];
  /** True when a prior session existed but its history was discarded because role or provider changed - callers should surface this to the user. */
  wasReset: boolean;
}

/**
 * Loads (or creates) a session's history, scoped to the caller's current
 * role and the currently active LLM provider. A session whose stored role
 * or provider doesn't match the current request has its history discarded
 * rather than replayed:
 *  - role change: an earlier turn may have exposed unredacted PII to an
 *    ADMIN caller; replaying that turn into a lower-privileged follow-up
 *    would hand the model (and thus the user) that content regardless of
 *    what the current tool call redacts, since it's already in context.
 *  - provider change: tool-call id and thoughtSignature semantics are
 *    provider-specific (see gemini-provider.ts / openrouter-provider.ts)
 *    and are not portable between providers.
 */
export function loadSession(sessionId: string | undefined | null, role: Role, provider: string): LoadedSession {
  evictExpired();

  if (sessionId) {
    const existing = sessions.get(sessionId);
    if (existing) {
      if (existing.role === role && existing.provider === provider) {
        return { sessionId, history: existing.messages, wasReset: false };
      }
      return { sessionId, history: [], wasReset: true };
    }
    return { sessionId, history: [], wasReset: false };
  }

  return { sessionId: crypto.randomUUID(), history: [], wasReset: false };
}

export function saveSession(sessionId: string, messages: LlmMessage[], role: Role, provider: string) {
  const existing = sessions.get(sessionId);
  const now = Date.now();
  sessions.set(sessionId, {
    messages: trimHistory(messages),
    role,
    provider,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
  evictOldestIfOverCapacity();
}
