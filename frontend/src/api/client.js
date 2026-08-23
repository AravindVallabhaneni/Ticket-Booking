const API = import.meta.env.VITE_API_URL || '/api/v1';

function getTokens() {
  try {
    return JSON.parse(localStorage.getItem('marquee.auth') || 'null');
  } catch {
    return null;
  }
}

export function setAuth(data) {
  if (!data) localStorage.removeItem('marquee.auth');
  else localStorage.setItem('marquee.auth', JSON.stringify(data));
}

async function request(path, { method = 'GET', body, token, headers } = {}, retry = true) {
  const auth = getTokens();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token || auth?.accessToken ? { Authorization: `Bearer ${token || auth.accessToken}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && retry && auth?.refreshToken) {
    const refreshed = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
    });
    if (refreshed.ok) {
      const data = await refreshed.json();
      setAuth(data);
      return request(path, { method, body, token: data.accessToken, headers }, false);
    }
    setAuth(null);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error?.message || 'Request failed');
    err.status = res.status;
    err.code = data.error?.code;
    err.payload = data;
    throw err;
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  del: (path) => request(path, { method: 'DELETE' }),
};
