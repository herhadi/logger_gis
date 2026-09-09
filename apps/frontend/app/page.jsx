'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../lib/api';

export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    apiFetch('/api/session').then(({ user }) => router.replace(user.role === 'admin' ? '/admin' : '/user')).catch(() => router.replace('/login'));
  }, [router]);
  return <div className="auth-loading">Memuat...</div>;
}
