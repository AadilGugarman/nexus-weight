import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Check, Activity, Building2, Phone, MapPin, Tag, Save, Settings2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useToast } from '../components/toastContext';
import CatalogTree from '../components/CatalogTree';
import { useSettings } from '../lib/settings';
import type { CatalogFieldNumber } from '../types';

type Tab = 'company' | 'configuration' | 'catalogs';

function Card({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3.5">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-xl bg-lime-500/15 flex items-center justify-center shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="font-black text-white leading-tight text-sm">{title}</p>
          <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider mb-1 flex items-center gap-1.5">{icon} {label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full bg-slate-800 border border-slate-700 rounded-xl px-3 h-11 text-white outline-none focus:border-lime-500';

export default function Manage() {
  const { companyName, customLabel1, customLabel2, customLabel3, updateBusinessConfig } = useStore();
  const { show } = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('company');
  const [versionTaps, setVersionTaps] = useState(0);
  const [diagUnlocked, setDiagUnlocked] = useState(false);

  // Business Configuration form (Company Name + up to 3 custom labels) —
  // edited locally and committed together via the Save button.
  const [bizName, setBizName] = useState(companyName || '');
  const [bizLabel1, setBizLabel1] = useState(customLabel1 ?? 'Category');
  const [bizLabel2, setBizLabel2] = useState(customLabel2 ?? 'Variety');
  const [bizLabel3, setBizLabel3] = useState(customLabel3 ?? 'Vakkal');
  const [savingBiz, setSavingBiz] = useState(false);

  const saveBusinessConfig = async (okMsg: string) => {
    setSavingBiz(true);
    try {
      await updateBusinessConfig({ companyName: bizName.trim(), customLabel1: bizLabel1.trim(), customLabel2: bizLabel2.trim(), customLabel3: bizLabel3.trim() });
      show(okMsg);
    } finally {
      setSavingBiz(false);
    }
  };

  const { companyPhone, companyAddress, setProfile } = useSettings();

  const catalogFields: Array<{ n: CatalogFieldNumber; label: string | null }> = [
    { n: 1, label: customLabel1 },
    { n: 2, label: customLabel2 },
    { n: 3, label: customLabel3 },
  ];
  const activeCatalogFields = catalogFields.filter((f): f is { n: CatalogFieldNumber; label: string } => !!f.label);

  const tabs: Array<{ id: Tab; label: string; icon: typeof Building2 }> = [
    { id: 'company', label: 'Company', icon: Building2 },
    { id: 'configuration', label: 'Configuration', icon: Settings2 },
    { id: 'catalogs', label: 'Catalogs', icon: Layers },
  ];

  return (
    <div>
      <h1 className="text-xl font-black mb-3">Manage</h1>
      <div className="flex gap-1 mb-3 bg-slate-900 border border-slate-800 rounded-xl p-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 py-1.5 rounded-lg font-bold text-xs transition ${tab === t.id ? 'bg-lime-500 text-slate-950' : 'text-slate-400'}`}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {/* COMPANY DETAILS — name (synced) + phone/address (this device only) */}
      {tab === 'company' && (
        <div className="space-y-2.5">
          <Card icon={<Building2 className="text-lime-400" size={18} />} title="Company Details"
            subtitle="Shown on receipts, PDF, WhatsApp & print">
            <div className="space-y-2.5">
              <Field icon={<Building2 size={13} className="text-lime-500" />} label="Company Name">
                <input value={bizName} onChange={(e) => setBizName(e.target.value.toUpperCase())}
                  placeholder="YOUR COMPANY NAME" maxLength={60} className={`${inputCls} uppercase`} />
              </Field>
              <Field icon={<Phone size={13} className="text-lime-500" />} label="Phone">
                <input value={companyPhone} inputMode="numeric" maxLength={15} onChange={(e) => setProfile({ companyPhone: e.target.value.replace(/[^\d+\- ]/g, '') })}
                  placeholder="Phone (optional)" className={`${inputCls} tabular-nums`} />
              </Field>
              <Field icon={<MapPin size={13} className="text-lime-500" />} label="Address">
                <input value={companyAddress} onChange={(e) => setProfile({ companyAddress: e.target.value })}
                  placeholder="Market / address (optional)" maxLength={100} className={inputCls} />
              </Field>
              <button onClick={() => void saveBusinessConfig('Company details saved')} disabled={savingBiz}
                className="w-full bg-lime-500 text-slate-950 font-black rounded-xl py-2.5 flex items-center justify-center gap-2 disabled:opacity-50">
                <Save size={16} /> {savingBiz ? 'Saving…' : 'Save'}
              </button>
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5"><Check size={13} className="text-lime-500 shrink-0" /> Company Name syncs across your devices; phone &amp; address are saved on this device only.</p>
            </div>
          </Card>
        </div>
      )}

      {/* CONFIGURATION — business field labels (synced) */}
      {tab === 'configuration' && (
        <div className="space-y-2.5">
          <Card icon={<Tag className="text-lime-400" size={18} />} title="Business Configuration"
            subtitle="Field names for your trade — fruit, supari, grain, etc.">
            <div className="space-y-2.5">
              <Field icon={<Tag size={13} className="text-lime-500" />} label="Label 1">
                <input value={bizLabel1} onChange={(e) => setBizLabel1(e.target.value)}
                  placeholder="e.g. Category (leave blank to hide)" maxLength={30} className={inputCls} />
              </Field>
              <Field icon={<Tag size={13} className="text-lime-500" />} label="Label 2">
                <input value={bizLabel2} onChange={(e) => setBizLabel2(e.target.value)}
                  placeholder="e.g. Variety (leave blank to hide)" maxLength={30} className={inputCls} />
              </Field>
              <Field icon={<Tag size={13} className="text-lime-500" />} label="Label 3">
                <input value={bizLabel3} onChange={(e) => setBizLabel3(e.target.value)}
                  placeholder="e.g. Vakkal (leave blank to hide)" maxLength={30} className={inputCls} />
              </Field>
              <button onClick={() => void saveBusinessConfig('Business configuration saved')} disabled={savingBiz}
                className="w-full bg-lime-500 text-slate-950 font-black rounded-xl py-2.5 flex items-center justify-center gap-2 disabled:opacity-50">
                <Save size={16} /> {savingBiz ? 'Saving…' : 'Save'}
              </button>
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5"><Check size={13} className="text-lime-500 shrink-0" /> Blank labels are hidden everywhere — Load Entry, receipts, PDF &amp; exports. Syncs across your devices.</p>
            </div>
          </Card>

          {/* Hidden diagnostics entry — revealed by tapping the version 5 times */}
          <div className="pt-2 text-center select-none">
            <button
              onClick={() => {
                const n = versionTaps + 1;
                setVersionTaps(n);
                if (n >= 5) { setDiagUnlocked(true); }
              }}
              className="text-[11px] text-slate-600 tracking-wide"
            >
              Nexus Weight · v1.0.0
            </button>
            {diagUnlocked && (
              <button
                onClick={() => navigate('/diagnostics')}
                className="mt-3 mx-auto flex items-center justify-center gap-2 text-sm font-bold text-lime-400 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5"
              >
                <Activity size={15} /> Open Production Diagnostics
              </button>
            )}
          </div>
        </div>
      )}

      {/* CATALOGS — hierarchical tree per configured business label chain
          (Label1 -> Label2 -> Label3, wherever those are contiguously
          configured). See CatalogTree for the tree/search/actions logic. */}
      {tab === 'catalogs' && (
        activeCatalogFields.length === 0 ? (
          <Empty text="No catalog fields configured yet. Set Label 1/2/3 under Configuration first." />
        ) : (
          <CatalogTree catalogFields={activeCatalogFields} />
        )
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-center py-16 text-slate-600 text-sm">{text}</div>;
}
