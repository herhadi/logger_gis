'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault(); setError(''); setSubmitting(true);
    try {
      await apiFetch('/api/login', { method: 'POST', body: JSON.stringify(form) });
      const { user } = await apiFetch('/api/session');
      router.replace(user.role === 'admin' ? '/admin' : '/user');
    } catch (err) { setError(err.message || 'Login gagal'); }
    finally { setSubmitting(false); }
  }

  return <main className="login-page"><form className="login-card" onSubmit={submit}>
    <h1>GIS Watermeter</h1><p>Masuk untuk melihat peta.</p>
    <label>Username<input required value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} /></label>
    <label>Password<input required type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></label>
    {error && <div className="login-error">{error}</div>}
    <button disabled={submitting}>{submitting ? 'Memproses...' : 'Masuk'}</button>
  </form></main>;
}
