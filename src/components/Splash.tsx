import { motion } from 'framer-motion';
import { Scale } from 'lucide-react';

export default function Splash() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950 overflow-hidden">
      {/* ambient glows */}
      <motion.div
        className="absolute -top-32 -right-24 w-96 h-96 rounded-full blur-3xl"
        style={{ background: 'var(--accent-soft)' }}
        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-32 -left-24 w-96 h-96 rounded-full blur-3xl"
        style={{ background: 'var(--accent-soft)' }}
        animate={{ scale: [1.1, 1, 1.1], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* logo */}
      <motion.div
        initial={{ scale: 0.4, opacity: 0, rotate: -20 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 14 }}
        className="relative"
      >
        <motion.div
          className="w-24 h-24 rounded-[28px] flex items-center justify-center shadow-2xl"
          style={{ background: 'linear-gradient(135deg, var(--accent-deep), var(--accent))' }}
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Scale size={52} className="text-white" strokeWidth={2.2} />
        </motion.div>
        {/* pulse ring */}
        <motion.div
          className="absolute inset-0 rounded-[28px] border-2"
          style={{ borderColor: 'var(--accent)' }}
          animate={{ scale: [1, 1.35], opacity: [0.6, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
        />
      </motion.div>

      {/* title */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.25, duration: 0.5 }}
        className="mt-7 text-center"
      >
        <h1 className="text-3xl font-black text-white tracking-tight">
          Nexus <span style={{ color: 'var(--accent)' }}>Weight</span>
        </h1>
        <p className="text-slate-500 text-sm mt-1.5 tracking-wide">Fast digital weight register</p>
      </motion.div>

      {/* loading bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-10 w-44 h-1.5 rounded-full bg-slate-800 overflow-hidden"
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'var(--accent)' }}
          animate={{ x: ['-100%', '250%'] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>

      {/* credit */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="absolute bottom-8 text-[11px] text-slate-600"
      >
        by <span className="font-bold text-slate-500">ASZ Nexus</span>
      </motion.p>
    </div>
  );
}
