import { createContext, useContext } from 'react';

export interface ToastMsg { id: number; text: string; action?: { label: string; onClick: () => void }; }
export interface ToastCtx { show: (text: string, action?: ToastMsg['action']) => void; }

export const ToastContext = createContext<ToastCtx>({ show: () => {} });

export const useToast = () => useContext(ToastContext);
