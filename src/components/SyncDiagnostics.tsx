import { useEffect, useState } from 'react';
import { Activity, RefreshCw, Trash2, RotateCcw, AlertTriangle, CheckCircle2, Loader2, Clock } from 'lucide-react';
import {
  subscribeDiagnostics, getDiagnostics, flushQueue,
  listDeadTasks, retryDeadTask, discardDeadTask, retryAllDeadTasks, clearDeadLetter, MAX_ATTEMPTS,
} from '../lib/sync';
import { useStore } from '../store/useStore';
import { useToast } from './toastContext';
import type { SyncDiagnostics as Diag, DeadTask } from '../types';

function ago(ts: number | null) {
  if (!ts) return 'never';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

export default function SyncDiagnostics() {
  const { show } = useToast();
  const refreshPending = useStore((s) => s.refreshPending);
  const [diag, setDiag] = useState<Diag | null>(null);
  const [dead, setDead] = useState<DeadTask[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    setDiag(await getDiagnostics());
    setDead(await listDeadTasks());
    await refreshPending();
  };

  useEffect(() => {
    let ignore = false;
    const unsub = subscribeDiagnostics((d) => {
      if (ignore) return;
      setDiag(d);
      void listDeadTasks().then((dl) => { if (!ignore) setDead(dl); });
    });
    void refreshPending();
    const t = window.setInterval(() => void reload(), 4000);
    return () => { ignore = true; unsub(); window.clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doFlush = async () => { setBusy(true); try { await flushQueue(); await reload(); show('Sync triggered'); } finally { setBusy(false); } };
  const doRetryAll = async () => { setBusy(true); try { const n = await retryAllDeadTasks(); await reload(); show(`Requeued ${n} task${n === 1 ? '' : 's'}`); } finally { setBusy(false); } };
  const doClear = async () => { setBusy(true); try { await clearDeadLetter(); await reload(); show('Dead-letter queue cleared'); } finally { setBusy(false); } };

  const stat = (label: string, value: string | number, tone: 'ok' | 'warn' | 'bad' | 'muted' = 'muted', icon?: React.ReactNode) => (
    <div className="bg-slate-800 rounded-xl p-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1">{icon}{label}</p>
      <p className={`text-lg font-black mt-0.5 ${tone === 'ok' ? 'text-lime-400' : tone === 'warn' ? 'text-amber-400' : tone === 'bad' ? 'text-red-400' : 'text-white'}`}>{value}</p>
    </div>
  );

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900 overflow-hidden">
      <div className="flex items-center gap-2 px-5 pt-5">
        <Activity size={18} className="text-lime-400" />
        <h2 className="font-black text-white">Sync Health</h2>
        <button onClick={doFlush} disabled={busy} className="ml-auto p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white disabled:opacity-50">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        </button>
      </div>

      {/* live stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-5 pt-3">
        {stat('Pending', diag?.pending ?? '—', (diag?.pending ?? 0) > 0 ? 'warn' : 'ok', <CloudIcon />)}
        {stat('Retry queued', diag?.scheduledRetries ?? '—', (diag?.scheduledRetries ?? 0) > 0 ? 'warn' : 'muted', <Clock size={11} />)}
        {stat('Failed', diag?.dead ?? '—', (diag?.dead ?? 0) > 0 ? 'bad' : 'ok', <AlertTriangle size={11} />)}
        {stat('Last sync', ago(diag?.lastFlushAt ?? null), diag?.inFlight ? 'warn' : 'muted', diag?.inFlight ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />)}
      </div>

      {diag?.lastError && (
        <p className="mx-5 mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 break-words">
          Last error: {diag.lastError}
        </p>
      )}

      {/* dead-letter queue */}
      {dead.length > 0 && (
        <div className="border-t border-slate-800 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-red-400" />
            <h3 className="font-bold text-white text-sm">Dead-letter queue ({dead.length})</h3>
            <div className="ml-auto flex gap-2">
              <button onClick={doRetryAll} disabled={busy} className="text-xs font-bold text-lime-400 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-1"><RotateCcw size={13} /> Retry all</button>
              <button onClick={doClear} disabled={busy} className="text-xs font-bold text-slate-400 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-1"><Trash2 size={13} /> Clear</button>
            </div>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {dead.map((t) => (
              <div key={t.id} className="bg-slate-800 rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-slate-700 text-slate-300">{t.op}</span>
                  <span className="text-sm font-bold text-white">{t.resource}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${t.reason === 'permanent' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
                    {t.reason === 'permanent' ? 'permanent' : `${t.attempts}/${MAX_ATTEMPTS} tries`}
                  </span>
                  <div className="ml-auto flex gap-1">
                    <button onClick={() => t.id != null && retryDeadTask(t.id).then(reload)} title="Retry" className="p-1.5 rounded-lg text-lime-400 hover:bg-slate-700"><RotateCcw size={14} /></button>
                    <button onClick={() => t.id != null && discardDeadTask(t.id).then(reload)} title="Discard" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-1.5 break-words">{t.lastError}</p>
                <p className="text-[10px] text-slate-600 mt-0.5">failed {ago(t.failedAt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {dead.length === 0 && (
        <p className="px-5 pb-5 text-xs text-slate-500 flex items-center gap-1.5"><CheckCircle2 size={14} className="text-lime-500" /> No failed tasks. All changes syncing normally.</p>
      )}
    </div>
  );
}

function CloudIcon() {
  return <CloudUploadMini />;
}
function CloudUploadMini() {
  // tiny inline glyph to avoid another import
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 13v8" /><path d="m8 17 4-4 4 4" /><path d="M20 16.6A5 5 0 0 0 18 7h-1.3A8 8 0 1 0 4 15.2" /></svg>;
}
