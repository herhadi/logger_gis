'use client';

import { useRouter } from 'next/navigation';
import { apiFetch } from '../lib/api';
import { useAuth } from './auth-gate';

export default function AuthHeader({ user }) {
  user = user || useAuth();
  const router = useRouter();
  const logout = async () => {
    try { await apiFetch('/api/logout', { method: 'POST' }); } finally { router.replace('/login'); }
  };
  const lastLogin = user.last_login ? new Date(user.last_login).toLocaleString('id-ID') : '-';
  return <header className="auth-header">
    <span>Login sebagai: 👤 {user.username} | Last login: {lastLogin}</span>
    <button type="button" onClick={logout}>Keluar</button>
  </header>;
}
