const DEFAULT_BACKEND_URL = "http://localhost:3000";

/**
 * The backend location can be changed per deployment with VITE_BACKEND_URL.
 * Keep API callers path-based so they do not need to know the host or port.
 */
export const backendBaseUrl = (
  import.meta.env.VITE_BACKEND_URL || DEFAULT_BACKEND_URL
).replace(/\/+$/, "");

export function getBackendUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return new URL(path.replace(/^\//, ""), `${backendBaseUrl}/`).toString();
}

export async function request(path: string, options?: RequestInit) {
    const response = await fetch(getBackendUrl(path), options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || `Request failed (${response.status})`);
    }

    return data;
}
