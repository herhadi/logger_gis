const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include'
  });
  let data = null;
  try { data = await response.json(); } catch { /* response tanpa JSON */ }
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || `Request gagal (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export { API_URL };
