import { useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ToastContext, type ToastMsg } from './toastContext';

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const show = useCallback((text: string, action?: ToastMsg['action']) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[92%] max-w-md">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
              className="flex items-center justify-between gap-3 bg-slate-800 border border-slate-700 text-slate-100 rounded-xl px-4 py-3 shadow-2xl">
              <span className="text-sm">{t.text}</span>
              {t.action && (
                <button onClick={() => { t.action!.onClick(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}
                  className="text-lime-400 font-bold text-sm px-2 py-1 rounded-lg hover:bg-slate-700">{t.action.label}</button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
