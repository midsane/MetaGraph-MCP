import { config } from '../config/env.js';

// What actually went wrong, one level up from a raw provider exception - this
// is what lets a caller (a route, the CLI, a log line) tell "your API key is
// wrong" apart from "you're rate-limited" apart from "the network is down",
// instead of every failure collapsing into the same opaque message.
export type LlmErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'invalid_request'
  | 'server'
  | 'network'
  | 'timeout'
  | 'unknown';

function statusToKind(status: number): LlmErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  if (status >= 400) return 'invalid_request';
  return 'unknown';
}

// Short, human-actionable hint per kind - appended to every message so the
// error is useful standalone, without having to know this taxonomy already.
const ADVICE: Record<LlmErrorKind, string> = {
  auth: 'check that the configured API key is set and valid for this provider.',
  rate_limit: 'the provider rate limit or quota was hit - back off and retry, or check your plan/usage.',
  invalid_request: 'the request was rejected as malformed - check the configured model name and request payload.',
  server: 'the provider is reporting an internal error or outage - retry shortly.',
  network: 'the request never reached the provider - check network/DNS/proxy connectivity from this machine.',
  timeout: `the provider did not respond within ${config.llmTimeoutMs}ms - it may be overloaded, or a proxy/firewall is silently dropping the request.`,
  unknown: 'see the underlying cause below.',
};

/**
 * Thrown by every LLM/embedding provider call in this codebase instead of a
 * raw SDK/fetch exception, so every catch site downstream (agent runtime,
 * routes, CLI) can branch on `.kind`/`.status` instead of string-matching
 * `.message`, and every log line carries provider+operation+cause instead of
 * just "fetch failed".
 */
export class LlmProviderError extends Error {
  readonly kind: LlmErrorKind;
  readonly provider: string;
  readonly operation: string;
  readonly status?: number;
  override readonly cause?: unknown;
  /** Set by callers that maintain a per-request trace id (e.g. runAgent), so a client-visible error can be matched back to server logs. */
  traceId?: string;

  constructor(opts: {
    kind: LlmErrorKind;
    provider: string;
    operation: string;
    message: string;
    status?: number;
    cause?: unknown;
  }) {
    super(opts.message);
    this.name = 'LlmProviderError';
    this.kind = opts.kind;
    this.provider = opts.provider;
    this.operation = opts.operation;
    this.status = opts.status;
    this.cause = opts.cause;
    Object.setPrototypeOf(this, LlmProviderError.prototype);
  }
}

/** Builds an LlmProviderError from a known HTTP status (e.g. a non-OK fetch response) - the precise, no-guessing case. */
export function llmErrorFromStatus(
  provider: string,
  operation: string,
  status: number,
  body: string
): LlmProviderError {
  const kind = statusToKind(status);
  return new LlmProviderError({
    kind,
    provider,
    operation,
    status,
    message: `${provider} ${operation} failed (${status}): ${ADVICE[kind]} Response: ${body}`,
  });
}

/**
 * Classifies an arbitrary thrown value from a provider SDK/fetch call into an
 * LlmProviderError. Handles the three shapes actually seen in this codebase:
 * AbortSignal.timeout() rejections (timeout), @google/genai's ApiError which
 * carries a numeric `.status` (auth/rate_limit/invalid_request/server), and
 * undici's `TypeError: fetch failed` with the real cause nested in `.cause`
 * (network) - that last one is what previously surfaced to users as a bare
 * "fetch failed" with no indication it was DNS/connection/TLS.
 */
export function classifyLlmError(err: unknown, provider: string, operation: string): LlmProviderError {
  if (err instanceof LlmProviderError) return err;

  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return new LlmProviderError({
      kind: 'timeout',
      provider,
      operation,
      message: `${provider} ${operation} timed out after ${config.llmTimeoutMs}ms: ${ADVICE.timeout}`,
      cause: err,
    });
  }

  const status = (err as { status?: unknown })?.status;
  if (err instanceof Error && typeof status === 'number') {
    const kind = statusToKind(status);
    return new LlmProviderError({
      kind,
      provider,
      operation,
      status,
      message: `${provider} ${operation} failed (${status}): ${ADVICE[kind]} ${err.message}`,
      cause: err,
    });
  }

  if (err instanceof TypeError && err.message === 'fetch failed') {
    const cause = (err as { cause?: unknown }).cause;
    const causeDetail = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause ?? 'unknown cause');
    return new LlmProviderError({
      kind: 'network',
      provider,
      operation,
      message: `${provider} ${operation}: network request failed (${causeDetail}) - ${ADVICE.network}`,
      cause: err,
    });
  }

  return new LlmProviderError({
    kind: 'unknown',
    provider,
    operation,
    message: err instanceof Error ? err.message : String(err),
    cause: err,
  });
}

/** Logs a classified LLM error with full diagnostic detail (kind, status, cause chain, stack) - the one place these are ever printed, so failures are never silent. */
export function logLlmError(err: LlmProviderError, context: Record<string, unknown> = {}): void {
  const causeStack = err.cause instanceof Error ? err.cause.stack : undefined;
  console.error(
    `[LLM ERROR] provider=${err.provider} operation=${err.operation} kind=${err.kind}` +
      (err.status ? ` status=${err.status}` : '') +
      (err.traceId ? ` traceId=${err.traceId}` : '') +
      (Object.keys(context).length ? ` context=${JSON.stringify(context)}` : '') +
      `\n  message: ${err.message}` +
      (causeStack ? `\n  cause stack:\n${causeStack}` : '') +
      (err.stack ? `\n  stack:\n${err.stack}` : '')
  );
}

/** Maps an LlmProviderError to an HTTP status code for an API response - distinguishes "you're rate-limited" (429) from "we're misconfigured/down" (5xx) instead of always answering 500. */
export function httpStatusForLlmError(err: LlmProviderError): number {
  switch (err.kind) {
    case 'rate_limit': return 429;
    case 'timeout': return 504;
    case 'network': return 503;
    case 'server': return 502;
    case 'auth':
    case 'invalid_request':
    case 'unknown':
    default:
      return 500;
  }
}

/** Shapes an LlmProviderError into a client-safe JSON body: enough to self-diagnose (kind/status/provider/traceId), no stack traces. */
export function llmErrorToPayload(err: LlmProviderError) {
  return {
    error: err.message,
    provider: err.provider,
    operation: err.operation,
    kind: err.kind,
    ...(err.status ? { status: err.status } : {}),
    ...(err.traceId ? { traceId: err.traceId } : {}),
  };
}
