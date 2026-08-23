import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, setAuth } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('marquee.auth') || 'null');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    setAuth(session);
  }, [session]);

  const value = useMemo(
    () => ({
      user: session?.user || null,
      login: async (email, password) => {
        const data = await api.post('/auth/login', { email, password });
        setSession(data);
        return data;
      },
      register: async (payload) => {
        const data = await api.post('/auth/register', payload);
        setSession(data);
        return data;
      },
      logout: () => setSession(null),
      refreshUser: (user) => setSession((s) => (s ? { ...s, user } : s)),
    }),
    [session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
