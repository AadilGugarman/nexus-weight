import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Wifi, WifiOff, RefreshCw, CloudUpload, Clock, Database,
  HardDrive, Radio, ShieldCheck, Activity, Copy, Check,
} from 'lucide-react';
import { getDiagnostics } from '../lib/sync';
import { getRealtimeStatus } from '../lib/realtime';
import { DB_VERSION } from '../lib/db';
import supabase from '../lib/supabase';
import { hasDriveScope } from '../lib/drive';
import { useStore } from '../store/useStore';
import { useToast } from '../components/toastContext';
import { copyText } from '../lib/clipboard';

const APP_VERSION = 'v1.0.0';

interface Row {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'bad' | 'neutral';
}

function fmtBytes(n: number) {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
function fmtTime(v: string | number | null) {
  if (!v) return 'Never';
  const d = typeof v === 'number' ? new Date(v) : new Date(v);
  if (isNaN(d.getTime())) return 'Never';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function Diagnostics() {
  const navigate = useNavigate();
  const { show } = useToast();
  const online = useStore((s) => s.online);
  const [rows, setRows] = useState<Row[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manualText, setManualText] = useState('');

  const build = useCallback(async () => {
    setRefreshing(true);
    const diag = await getDiagnostics();
    const rt = getRealtimeStatus();
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    const provider = user?.app_metadata?.provider || (user ? 'email' : null);
    const drive = hasDriveScope();

    const lastBackupAt = localStorage.getItem('lastBackupAt');
    const lastBackupSize = Number(localStorage.getItem('lastBackupSize') || 0);

    const next: Row[] = [
      {
        icon: online ? <Wifi size={17} /> : <WifiOff size={17} />,
        label: 'Network', value: online ? 'Online' : 'Offline', tone: online ? 'ok' : 'bad',
      },
      {
        icon: <CloudUpload size={17} />,
        label: 'Pending sync queue', value: String(diag.pending),
        tone: diag.pending === 0 ? 'ok' : 'warn',
      },
      {
        icon: <Activity size={17} />,
        label: 'Failed (dead-letter)', value: String(diag.dead),
        tone: diag.dead === 0 ? 'ok' : 'bad',
      },
      {
        icon: <Clock size={17} />,
        label: 'Last sync time', value: fmtTime(diag.lastFlushAt), tone: 'neutral',
      },
      {
        icon: <HardDrive size={17} />,
        label: 'Last backup time', value: fmtTime(lastBackupAt),
        tone: lastBackupAt ? 'ok' : 'warn',
      },
      {
        icon: <Database size={17} />,
        label: 'Backup size', value: fmtBytes(lastBackupSize), tone: 'neutral',
      },
      {
        icon: <Radio size={17} />,
        label: 'Realtime status', value: rt.charAt(0).toUpperCase() + rt.slice(1),
        tone: rt === 'connected' ? 'ok' : rt === 'error' ? 'bad' : 'warn',
      },
      {
        icon: <ShieldCheck size={17} />,
        label: 'Google Drive auth', value: drive ? 'Authorized' : 'Not authorized',
        tone: drive ? 'ok' : 'warn',
      },
      {
        icon: <ShieldCheck size={17} />,
        label: 'Signed in as', value: user ? `${user.email || 'user'} (${provider})` : 'Signed out',
        tone: user ? 'ok' : 'bad',
      },
      {
        icon: <Database size={17} />,
        label: 'Database version', value: `Dexie v${DB_VERSION}`, tone: 'neutral',
      },
      {
        icon: <Activity size={17} />,
        label: 'App version', value: APP_VERSION, tone: 'neutral',
      },
    ];
    if (diag.lastError) {
      next.push({ icon: <Activity size={17} />, label: 'Last sync error', value: diag.lastError, tone: 'bad' });
    }
    setRows(next);
    setRefreshing(false);
  }, [online]);

  useEffect(() => {
    const t = window.setInterval(() => void build(), 5000);
    const t0 = window.setTimeout(() => void build(), 0);
    return () => { window.clearInterval(t); window.clearTimeout(t0); };
  }, [build]);

  const copyReport = async () => {
    const text = rows.map((r) => `${r.label}: ${r.value}`).join('\n');
    const report = `Nexus Weight — Diagnostics\n${new Date().toISOString()}\n\n${text}`;
    const ok = await copyText(report);
    if (ok) {
      setCopied(true);
      show('Diagnostics copied');
      setTimeout(() => setCopied(false), 1500);
    } else {
      show('Copy blocked — report shown below to copy manually');
      setManualText(report);
    }
  };

  const toneColor = (t?: Row['tone']) =>
    t === 'ok' ? 'text-emerald-400' : t === 'warn' ? 'text-amber-400' : t === 'bad' ? 'text-red-400' : 'text-slate-300';

  return (
    <div className="max-w-lg mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-400 mb-4 hover:text-white transition"><ArrowLeft size={18} /> Back</button>

      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-black flex items-center gap-2"><Activity size={22} className="text-lime-500" /> Diagnostics</h1>
        <button onClick={build} className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white">
          <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>
      <p className="text-slate-500 text-sm mb-5">Live system health. Auto-refreshes every 5 seconds.</p>

      <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-900 divide-y divide-slate-800">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <span className={`shrink-0 ${toneColor(r.tone)}`}>{r.icon}</span>
            <span className="flex-1 text-sm text-slate-400">{r.label}</span>
            <span className={`text-sm font-bold text-right ${toneColor(r.tone)} max-w-[55%] truncate`}>{r.value}</span>
          </div>
        ))}
      </div>

      <button onClick={copyReport} className="mt-4 w-full flex items-center justify-center gap-2 bg-slate-800 border border-slate-700 text-white font-bold rounded-2xl py-3.5 hover:bg-slate-700 transition">
        {copied ? <Check size={18} className="text-lime-400" /> : <Copy size={18} />} Copy Diagnostics Report
      </button>

      {manualText && (
        <div className="mt-3">
          <p className="text-xs text-slate-500 mb-1.5">Automatic copy was blocked in this environment. Select all &amp; copy manually:</p>
          <textarea
            readOnly
            value={manualText}
            onFocus={(e) => e.currentTarget.select()}
            rows={8}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 font-mono outline-none focus:border-lime-500 resize-none"
          />
        </div>
      )}

      <p className="text-[11px] text-slate-600 mt-4 text-center">Production Diagnostics · Nexus Weight {APP_VERSION}</p>
    </div>
  );
}
