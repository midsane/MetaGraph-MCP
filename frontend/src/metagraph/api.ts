const DEFAULT_BACKEND_URL = "http://localhost:3000";

/**
 * The backend location can be changed per deployment with VITE_BACKEND_URL.
 * Keep API callers path-based so they do not need to know the host or port.
 */
export const backendBaseUrl = (
  import.meta.env.VITE_BACKEND_URL || DEFAULT_BACKEND_URL
).replace(/\/+$/, "");

/** Resolves a relative API path to a full backend URL; passes absolute URLs through unchanged. */
export function getBackendUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return new URL(path.replace(/^\//, ""), `${backendBaseUrl}/`).toString();
}

/** Fetches JSON from the backend and throws with the server's error message on a non-OK response. */
export async function request(path: string, options?: RequestInit) {
    const response = await fetch(getBackendUrl(path), options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || `Request failed (${response.status})`);
    }

    return data;
}
