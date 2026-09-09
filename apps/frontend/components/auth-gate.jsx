'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../lib/api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export default function AuthGate({ allowedRoles, children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/session')
      .then(({ user: sessionUser }) => {
        if (allowedRoles && !allowedRoles.includes(sessionUser.role)) {
          router.replace(sessionUser.role === 'admin' ? '/admin' : '/user');
          return;
        }
        setUser(sessionUser);
      })
      .catch(() => router.replace('/login'))
      .finally(() => setLoading(false));
  }, [allowedRoles, router]);

  if (loading || !user) return <div className="auth-loading">Memeriksa session...</div>;
  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>;
}
