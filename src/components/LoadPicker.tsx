import { useState } from 'react';
import { X, Plus, CalendarDays, Truck, Users, Tag, AlertCircle, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useStore } from '../store/useStore';
import Dropdown from './Dropdown';
import CatalogField from './CatalogField';
import DatePicker from './DatePicker';
import { validateVehicleNumber, formatVehicleNumber } from '../lib/vehicleValidation';
import type { Load, MovementType, CatalogFieldNumber } from '../types';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function LoadPicker({ onClose, onPick }: { onClose: () => void; onPick: (l: Load) => void }) {
  const { parties, addLoad, addParty, customLabel1, customLabel2, customLabel3 } = useStore();
  const [label, setLabel] = useState('');
  const [partyId, setPartyId] = useState('');
  const [customField1, setCustomField1] = useState('');
  const [customField2, setCustomField2] = useState('');
  const [customField3, setCustomField3] = useState('');
  const [date, setDate] = useState(todayISO());
  const [movementType, setMovementType] = useState<MovementType>('outward');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  // Linked Values — Category (field 1) is structurally Variety's (field 2)
  // parent whenever both labels are configured; Variety is Vakkal's (field
  // 3) parent likewise. CatalogField itself falls back to showing every
  // value when the selected parent has no links yet, so this wiring is safe
  // to leave on unconditionally.
  const parentFieldFor2: CatalogFieldNumber | null = customLabel1 ? 1 : null;
  const parentFieldFor3: CatalogFieldNumber | null = customLabel2 ? 2 : null;
  const changeField1 = (v: string) => {
    setCustomField1(v);
    if (parentFieldFor2 === 1) { setCustomField2(''); if (parentFieldFor3 === 2) setCustomField3(''); }
  };
  const changeField2 = (v: string) => {
    setCustomField2(v);
    if (parentFieldFor3 === 2) setCustomField3('');
  };

  const vehicleCheck = validateVehicleNumber(label);
  const vehicleMissing = !label.trim();
  const showVehicleError = touched && vehicleMissing && !vehicleCheck.valid && label.trim().length > 0;
  const partyMissing = !partyId;
  const showPartyError = touched && partyMissing;
  const label1Missing = !!customLabel1 && !customField1.trim();
  const showLabel1Error = touched && label1Missing;
  const canSubmit = !partyMissing && !label1Missing;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    // Party name and Label 1 (when configured) are required — weighing cannot start without them.
    if (!canSubmit) return;
    setBusy(true);
    const chosen = date ? new Date(`${date}T${new Date().toTimeString().slice(0, 8)}`) : new Date();
    const vehicle = label.trim() ? (vehicleCheck.normalized || formatVehicleNumber(label)) : 'NO-VEHICLE';
    const load = await addLoad({
      label: vehicle,
      party_id: partyId || null,
      movement_type: movementType,
      custom_field_1: customLabel1 ? customField1.trim() || null : null,
      custom_field_2: customLabel2 ? customField2.trim() || null : null,
      custom_field_3: customLabel3 ? customField3.trim() || null : null,
      created_at: chosen.toISOString(),
    });
    setBusy(false);
    onPick(load);
  };

  const lbl = 'text-[11px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5';
  const input = 'w-full bg-slate-800 border border-slate-700 rounded-xl px-3 h-11 text-white outline-none focus:border-lime-500';

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black">New Load</h2>
          <button aria-label="Close" onClick={onClose} className="p-1 text-slate-400 hover:text-white"><X size={22} /></button>
        </div>
        <form onSubmit={create} className="space-y-4">
          {/* Movement type toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMovementType('inward')}
              className={`flex items-center justify-center gap-2 h-11 rounded-xl font-bold text-sm border-2 transition ${movementType === 'inward' ? 'bg-lime-500 text-slate-950 border-transparent' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
              <ArrowDownLeft size={16} /> Inward
            </button>
            <button type="button" onClick={() => setMovementType('outward')}
              className={`flex items-center justify-center gap-2 h-11 rounded-xl font-bold text-sm border-2 transition ${movementType === 'outward' ? 'bg-lime-500 text-slate-950 border-transparent' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
              <ArrowUpRight size={16} /> Outward
            </button>
          </div>

          {/* Row 1: Vehicle Number + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}><Truck size={13} className="text-lime-500" /> Vehicle Number</label>
              <input
                placeholder="e.g. MH 12 AB 1234"
                value={label}
                onChange={(e) => setLabel(e.target.value.toUpperCase())}
                onBlur={() => setTouched(true)}
                className={`${input} uppercase ${showVehicleError ? 'border-red-500 focus:border-red-500' : ''}`}
              />
            </div>
            <div>
              <label className={lbl}><CalendarDays size={13} className="text-lime-500" /> Date</label>
              <DatePicker value={date} onChange={(v) => setDate(v || todayISO())} placeholder="Today" />
            </div>
          </div>
          {showVehicleError && (
            <p className="-mt-2 flex items-center gap-1.5 text-xs text-red-400 font-medium">
              <AlertCircle size={13} /> {vehicleCheck.error || 'Invalid vehicle number format.'}
            </p>
          )}

          {/* Row 2: Party */}
          <div>
            <label className={lbl}><Users size={13} className="text-lime-500" /> Party <span className="text-red-400">*</span></label>
            <Dropdown 
              value={partyId} 
              onChange={setPartyId} 
              placeholder="Select or add party"
              options={parties.map((p) => ({ value: p.id, label: p.name, sub: p.place || undefined }))}
              onCreate={async (name: string) => {
                const newParty = await addParty({ name: name.toUpperCase(), party_type: 'customer' });
                return newParty.id;
              }}
              createLabel={(text: string) => `Add party "${text}"`}
              uppercase
            />
            {showPartyError && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-red-400 font-medium">
                <AlertCircle size={13} /> Party is required.
              </p>
            )}
          </div>

          {/* Custom fields — configured per business in Manage > Business Configuration.
              A blank label hides its field entirely. Label 1 is required whenever
              it's configured; Labels 2/3 stay optional.
              Search existing catalog values or type a new one to create it on the fly. */}
          {customLabel1 && (
            <div>
              <label className={lbl}><Tag size={13} className="text-lime-500" /> {customLabel1} <span className="text-red-400">*</span></label>
              <CatalogField fieldNumber={1} value={customField1} onChange={changeField1} placeholder={`Search or add ${customLabel1}…`} uppercase />
              {showLabel1Error && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-red-400 font-medium">
                  <AlertCircle size={13} /> {customLabel1} is required.
                </p>
              )}
            </div>
          )}
          {customLabel2 && (
            <div>
              <label className={lbl}><Tag size={13} className="text-lime-500" /> {customLabel2}</label>
              <CatalogField fieldNumber={2} value={customField2} onChange={changeField2} placeholder={`Search or add ${customLabel2}…`}
                parentFieldNumber={parentFieldFor2 ?? undefined} parentValue={parentFieldFor2 === 1 ? customField1 : undefined} parentLabel={customLabel1 || undefined} uppercase />
            </div>
          )}
          {customLabel3 && (
            <div>
              <label className={lbl}><Tag size={13} className="text-lime-500" /> {customLabel3}</label>
              <CatalogField fieldNumber={3} value={customField3} onChange={setCustomField3} placeholder={`Search or add ${customLabel3}…`}
                parentFieldNumber={parentFieldFor3 ?? undefined} parentValue={parentFieldFor3 === 2 ? customField2 : undefined} parentLabel={customLabel2 || undefined} uppercase />
            </div>
          )}

          <button type="submit" disabled={busy || !canSubmit} className="w-full bg-lime-500 text-slate-950 font-black rounded-xl py-3.5 hover:bg-lime-400 active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-50">
            <Plus size={18} /> Create &amp; Start Weighing
          </button>
        </form>
      </div>
    </div>
  );
}
