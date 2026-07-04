import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  /** Cap the sheet's height and let its content scroll — for longer forms (e.g. Finalize). */
  scrollable?: boolean;
}

/** Native iOS/Android-style bottom sheet shell: backdrop + a panel that
 * slides up from the bottom edge with a drag handle and rounded top
 * corners. Purely presentational — callers supply the content. */
export default function BottomSheet({ open, onClose, title, subtitle, children, scrollable }: Props) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[70]"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            className={`fixed left-0 right-0 bottom-0 z-[71] mx-auto w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl sm:mb-4 ${scrollable ? 'max-h-[88vh] flex flex-col' : ''}`}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderBottom: 'none' }}
          >
            <div className="pt-3 pb-1 flex justify-center shrink-0">
              <div className="w-10 h-1.5 rounded-full" style={{ background: 'var(--border-2)' }} />
            </div>
            {(title || subtitle) && (
              <div className="px-5 pb-3 shrink-0">
                {title && <h2 className="text-lg font-black" style={{ color: 'var(--text)' }}>{title}</h2>}
                {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>{subtitle}</p>}
              </div>
            )}
            <div className={scrollable ? 'overflow-y-auto px-5 pb-5' : 'px-5 pb-5'}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
