'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast harus digunakan di dalam ToastProvider');
  return context;
}

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const showToast = useCallback((message, type = 'info', duration = 3500) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(current => [...current, { id, message, type }]);
    window.setTimeout(() => setToasts(current => current.filter(toast => toast.id !== id)), duration);
  }, []);
  const value = useMemo(() => ({ showToast }), [showToast]);
  return <ToastContext.Provider value={value}>
    {children}
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map(toast => <div key={toast.id} className={`app-toast app-toast-${toast.type}`}>
        <span>{toast.message}</span><button type="button" onClick={() => setToasts(current => current.filter(item => item.id !== toast.id))} aria-label="Tutup">×</button>
      </div>)}
    </div>
  </ToastContext.Provider>;
}
