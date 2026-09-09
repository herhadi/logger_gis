'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [background, setBackground] = useState('');
  const [backgroundLoaded, setBackgroundLoaded] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('theme');
    const useDark = savedTheme ? savedTheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDarkMode(useDark);
    const url = `https://picsum.photos/seed/${Date.now()}/1200/800`;
    const image = new Image();
    image.onload = () => { setBackground(url); setBackgroundLoaded(true); };
    image.onerror = () => setBackgroundLoaded(true);
    image.src = url;
  }, []);

  function toggleDarkMode() {
    setDarkMode(value => {
      const next = !value;
      window.localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  }

  async function submit(event) {
    event.preventDefault(); setError(''); setSubmitting(true);
    try {
      await apiFetch('/api/login', { method: 'POST', body: JSON.stringify(form) });
      const { user } = await apiFetch('/api/session');
      router.replace(user.role === 'admin' ? '/admin' : '/user');
    } catch (err) { setError(err.message || 'Login gagal'); }
    finally { setSubmitting(false); }
  }

  const pageStyle = background ? { backgroundImage: `url(${background})` } : undefined;
  return <main className={`login-page ${darkMode ? 'dark-mode' : ''}`} style={pageStyle}>
    {!backgroundLoaded && <div className="loading-overlay"><div className="spinner" /></div>}
    <form className="login-box" onSubmit={submit}>
      <div className="login-heading"><h4>Login</h4><button className="theme-button" type="button" onClick={toggleDarkMode} aria-label="Ubah tema">{darkMode ? '☀' : '☾'}</button></div>
      <label htmlFor="username">Username</label>
      <input id="username" type="text" required autoFocus autoComplete="username" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
      <label className="password-label" htmlFor="password"><span>Password</span><button className="password-toggle" type="button" onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide' : 'Show'}</button></label>
      <input id="password" type={showPassword ? 'text' : 'password'} required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
      {error && <div className="login-error">{error}</div>}
      <button className="login-submit" disabled={submitting}>{submitting ? 'Loading...' : 'Login'}</button>
    </form>
  </main>;
}
