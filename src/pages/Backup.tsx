import { useEffect, useRef, useState } from 'react';
import { CloudUpload, CloudDownload, ShieldCheck, RefreshCw, Loader2, Check, AlertTriangle, Clock, Database, HardDriveDownload, CalendarClock, FileDown, FileUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { backupToDrive, restoreFromDrive, driveBackupMeta, fetchSnapshot, downloadBackupFile, restoreFromFile, getSchedule, setSchedule, nextRunLabel, type Snapshot, type BackupSchedule } from '../lib/backup';
import { useToast } from '../components/toastContext';
import SyncDiagnostics from '../components/SyncDiagnostics';
import type { BackupMeta } from '../lib/drive';

function fmtBytes(n: number) {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
function fmtTime(iso?: string | null) {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const SCHEDULES: { id: BackupSchedule; title: string; desc: string }[] = [
  { id: 'daily', title: 'Daily', desc: 'Every day at 5:00 AM' },
  { id: 'weekly', title: 'Weekly', desc: 'Once a week at 5:00 AM' },
  { id: 'off', title: 'Off', desc: 'Manual backups only' },
];

export default function Backup() {
  const { show } = useToast();
  const [busy, setBusy] = useState<'' | 'backup' | 'restore' | 'refresh' | 'download' | 'restoreFile'>('');
  const [schedule, setSched] = useState<BackupSchedule>(getSchedule());
  const [meta, setMeta] = useState<BackupMeta | null>(null);
  const [connected, setConnected] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [localCount, setLocalCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastAt = localStorage.getItem('lastBackupAt');
  const lastCount = localStorage.getItem('lastBackupCount');

  useEffect(() => {
    fetchSnapshot().then((s: Snapshot) => setLocalCount(s.recordCount)).catch(() => {});
  }, []);

  const connectAndCheck = async () => {
    setBusy('refresh');
    try {
      const m = await driveBackupMeta(true);
      setMeta(m); setConnected(true);
      show(m ? 'Connected · backup found' : 'Connected · no backup yet');
    } catch (e) { console.error(e); show('Could not connect to Google Drive'); }
    finally { setBusy(''); }
  };

  const doBackup = async () => {
    setBusy('backup');
    try {
      const { recordCount } = await backupToDrive(true);
      setConnected(true);
      setMeta(await driveBackupMeta(false));
      show(`Backed up ${recordCount} records`);
    } catch (e) { console.error(e); show('Backup failed — allow Drive access'); }
    finally { setBusy(''); }
  };

  const doRestore = async () => {
    setConfirmRestore(false);
    setBusy('restore');
    try {
      const { restored } = await restoreFromDrive();
      show(`Restored ${restored} records`);
    } catch (e) { console.error(e); show((e as Error).message || 'Restore failed'); }
    finally { setBusy(''); }
  };

  // Manual fallback — works even when Google Drive / OAuth is misconfigured
  // or unreachable, since it never talks to Google at all.
  const doDownloadFile = async () => {
    setBusy('download');
    try {
      const { recordCount } = await downloadBackupFile();
      show(`Saved backup file · ${recordCount} records`);
    } catch (e) { console.error(e); show((e as Error).message || 'Download failed'); }
    finally { setBusy(''); }
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) setPendingFile(file);
  };

  const doRestoreFile = async () => {
    const file = pendingFile;
    setPendingFile(null);
    if (!file) return;
    setBusy('restoreFile');
    try {
      const { restored } = await restoreFromFile(file);
      show(`Restored ${restored} records`);
    } catch (e) { console.error(e); show((e as Error).message || 'Restore failed'); }
    finally { setBusy(''); }
  };

  const pickSchedule = (s: BackupSchedule) => {
    setSched(s);
    setSchedule(s);
    show(s === 'off' ? 'Auto-backup turned off' : `Auto-backup set to ${s}`);
    if (s !== 'off') void doBackup();
  };

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-black mb-1">Backup &amp; Restore</h1>
      <p className="text-slate-500 text-sm mb-5">Stored in your own Google Drive (free 15 GB) in a private app folder. A single backup file is kept and updated each time.</p>

      {/* Drive card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-slate-800 overflow-hidden mb-4">
        <div className="p-5" style={{ background: 'linear-gradient(135deg,var(--surface),var(--surface-2))' }}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--accent-soft)' }}>
              <ShieldCheck style={{ color: 'var(--accent)' }} size={26} />
            </div>
            <div className="flex-1">
              <p className="font-black text-white text-lg leading-tight">Google Drive</p>
              <p className={`text-xs font-semibold ${connected ? 'text-lime-400' : 'text-slate-500'}`}>{connected ? 'Connected' : 'Not connected'}</p>
            </div>
            <button onClick={connectAndCheck} disabled={!!busy} className="p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white disabled:opacity-50">
              {busy === 'refresh' ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            </button>
          </div>
        </div>
        <div className="bg-slate-900 p-4 grid grid-cols-2 gap-3">
          <Stat icon={<Clock size={15} />} label="Last backup" value={fmtTime(lastAt || meta?.modifiedTime)} />
          <Stat icon={<Database size={15} />} label="Backup size" value={fmtBytes(meta?.size || 0)} />
          <Stat icon={<HardDriveDownload size={15} />} label="Records backed up" value={lastCount || '—'} />
          <Stat icon={<Check size={15} />} label="Records now" value={localCount != null ? String(localCount) : '—'} />
        </div>
      </motion.div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <button onClick={doBackup} disabled={!!busy} className="flex flex-col items-center gap-2 bg-lime-500 text-slate-950 font-black rounded-2xl py-5 active:scale-95 transition disabled:opacity-60">
          {busy === 'backup' ? <Loader2 size={26} className="animate-spin" /> : <CloudUpload size={26} />} Backup Now
        </button>
        <button onClick={() => setConfirmRestore(true)} disabled={!!busy} className="flex flex-col items-center gap-2 bg-slate-800 border border-slate-700 text-white font-black rounded-2xl py-5 active:scale-95 transition disabled:opacity-60">
          {busy === 'restore' ? <Loader2 size={26} className="animate-spin" /> : <CloudDownload size={26} />} Restore
        </button>
      </div>

      {/* Schedule selector */}
      <div className="flex items-center gap-2 mb-2">
        <CalendarClock size={16} className="text-lime-400" />
        <p className="font-bold text-white">Auto-backup schedule</p>
        <span className="ml-auto text-xs text-slate-500">Next: {nextRunLabel()}</span>
      </div>
      <div className="space-y-2 mb-4">
        {SCHEDULES.map((s) => (
          <button key={s.id} onClick={() => pickSchedule(s.id)}
            className={`w-full flex items-center gap-3 rounded-2xl p-4 border-2 transition text-left ${schedule === s.id ? 'border-lime-500 bg-lime-500/10' : 'border-slate-800 bg-slate-900'}`}>
            <div className="flex-1">
              <p className="font-bold text-white">{s.title}</p>
              <p className="text-xs text-slate-500">{s.desc}</p>
            </div>
            <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${schedule === s.id ? 'border-lime-500 bg-lime-500' : 'border-slate-600'}`}>
              {schedule === s.id && <Check size={14} className="text-slate-950" />}
            </span>
          </button>
        ))}
      </div>

      <p className="text-[11px] text-slate-500 mt-4 flex items-start gap-1.5">
        <ShieldCheck size={14} className="text-lime-500 shrink-0 mt-0.5" />
        Nexus Weight only accesses its private app folder in your Drive — it cannot see any of your other files. Auto-backup runs while the app is open near the scheduled time.
      </p>

      {/* Manual fallback — a plain file on your device, no Google account
          needed. Use this if Drive backup/restore above isn't working. */}
      <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <p className="font-bold text-white mb-1">Manual Backup File</p>
        <p className="text-xs text-slate-500 mb-3">Works without Google Drive — saves/reads a plain file on this device. Use this if the Drive backup above fails.</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={doDownloadFile} disabled={!!busy}
            className="flex flex-col items-center gap-2 bg-slate-800 border border-slate-700 text-white font-black rounded-2xl py-4 active:scale-95 transition disabled:opacity-60">
            {busy === 'download' ? <Loader2 size={22} className="animate-spin" /> : <FileDown size={22} />} Download File
          </button>
          <button onClick={() => fileInputRef.current?.click()} disabled={!!busy}
            className="flex flex-col items-center gap-2 bg-slate-800 border border-slate-700 text-white font-black rounded-2xl py-4 active:scale-95 transition disabled:opacity-60">
            {busy === 'restoreFile' ? <Loader2 size={22} className="animate-spin" /> : <FileUp size={22} />} Restore from File
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={onFileSelected} className="hidden" />
      </div>

      <div className="mt-6">
        <SyncDiagnostics />
      </div>

      {confirmRestore && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-5">
            <div className="flex items-center gap-2 mb-2 text-amber-400"><AlertTriangle size={20} /><h2 className="text-lg font-black">Restore from Drive?</h2></div>
            <p className="text-sm text-slate-400 mb-5">This recovers your complete database from the cloud backup. Records with the same ID are overwritten. This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmRestore(false)} className="flex-1 bg-slate-800 text-white font-bold rounded-xl py-3">Cancel</button>
              <button onClick={doRestore} className="flex-1 bg-lime-500 text-slate-950 font-black rounded-xl py-3">Restore</button>
            </div>
          </div>
        </div>
      )}

      {pendingFile && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-5">
            <div className="flex items-center gap-2 mb-2 text-amber-400"><AlertTriangle size={20} /><h2 className="text-lg font-black">Restore from file?</h2></div>
            <p className="text-sm text-slate-400 mb-1 truncate">{pendingFile.name}</p>
            <p className="text-sm text-slate-400 mb-5">This recovers your complete database from this file. Records with the same ID are overwritten. This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setPendingFile(null)} className="flex-1 bg-slate-800 text-white font-bold rounded-xl py-3">Cancel</button>
              <button onClick={doRestoreFile} className="flex-1 bg-lime-500 text-slate-950 font-black rounded-xl py-3">Restore</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1">{icon} {label}</p>
      <p className="text-sm font-bold text-white mt-0.5 truncate">{value}</p>
    </div>
  );
}
