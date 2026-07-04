import { useState } from 'react';
import { ChevronLeft, Pencil, Link2, Move as MoveIcon, Search, Check, AlertTriangle } from 'lucide-react';
import BottomSheet from './BottomSheet';
import CatalogField from './CatalogField';
import { useStore } from '../store/useStore';
import { useToast } from './toastContext';
import { parentOf, countNodes } from '../lib/catalogLinks';
import type { NodeActionContext } from './CatalogTreeNode';

export type Screen = 'menu' | 'edit' | 'addChild' | 'link' | 'move' | 'delete';

interface Props {
  open: boolean;
  onClose: () => void;
  context: NodeActionContext | null;
}

/** Single bottom sheet for every catalog-tree node action. Edit, Add Child
 * and Delete are opened directly from their own row icon (initialScreen
 * skips straight past "menu"); Link Existing Value and Move are the only
 * two that still go through the "menu" screen, reached via the row's
 * overflow button. */
export default function CatalogNodeSheet({ open, onClose, context }: Props) {
  const { catalogValues, catalogValueLinks, updateCatalogValue, deleteCatalogValue, setValueParent } = useStore();
  const { show } = useToast();

  const [screen, setScreen] = useState<Screen>('menu');
  const [editText, setEditText] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  // Keep showing the last non-null context while the sheet's `open` prop
  // flips to false, so the close animation slides down real content instead
  // of going blank mid-fade (same reasoning as LinkValuesSheet's `value` prop).
  const [lastCtx, setLastCtx] = useState<NodeActionContext | null>(null);
  if (context && context !== lastCtx) setLastCtx(context);
  const ctx = context ?? lastCtx;

  // Reset all per-node state whenever a new open request comes in — keyed on
  // the context object's identity (not just node id) since re-tapping a
  // different action icon on the *same* node creates a fresh context object
  // with a different initialScreen and must still reset/jump there.
  // Adjusted during render (React's documented pattern) rather than an Effect.
  const [seededCtx, setSeededCtx] = useState<NodeActionContext | null>(null);
  if (ctx && ctx !== seededCtx) {
    setSeededCtx(ctx);
    setScreen(ctx.initialScreen);
    setEditText(ctx.node.value.value);
    setQuery('');
    setSelectedId(undefined);
  }

  const node = ctx?.node ?? null;
  const childField = ctx?.childField ?? null;
  const childLabel = ctx?.childLabel ?? null;
  const parentField = ctx?.parentField ?? null;
  const parentLabel = ctx?.parentLabel ?? null;

  const descendantCount = node ? countNodes([node]) - 1 : 0;

  const saveEdit = async () => {
    const trimmed = editText.trim();
    if (!trimmed || !node) return;
    setSaving(true);
    try {
      await updateCatalogValue({ ...node.value, value: trimmed });
      show('Value updated');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!node) return;
    setSaving(true);
    try {
      await deleteCatalogValue(node.value.id);
      show(descendantCount > 0 ? 'Value and its linked children deleted' : 'Value deleted');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const confirmLink = async () => {
    if (!selectedId || !node) return;
    setSaving(true);
    try {
      await setValueParent(selectedId, node.value.id);
      show('Linked');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const confirmMove = async () => {
    if (selectedId === undefined || !node) return;
    setSaving(true);
    try {
      await setValueParent(node.value.id, selectedId);
      show(selectedId ? 'Moved' : 'Unlinked — now independent');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  // Link Existing Value: any active value of the child field not already a
  // child of this node, with a hint if it currently belongs elsewhere.
  const linkOptions = childField == null || !node ? [] : catalogValues
    .filter((v) => !v.is_deleted && v.field_number === childField && parentOf(catalogValueLinks, v.id) !== node.value.id)
    .filter((v) => !query.trim() || v.value.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.value.localeCompare(b.value));

  // Move: every active value of the parent field, filtered by search.
  const moveOptions = parentField == null ? [] : catalogValues
    .filter((v) => !v.is_deleted && v.field_number === parentField)
    .filter((v) => !query.trim() || v.value.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.value.localeCompare(b.value));

  const nodeValueText = node?.value.value ?? '';
  const titles: Record<Screen, { title: string; subtitle?: string }> = {
    menu: { title: nodeValueText },
    edit: { title: 'Edit value' },
    addChild: { title: `Add ${childLabel ?? ''}`, subtitle: `Under "${nodeValueText}"` },
    link: { title: `Link existing ${childLabel ?? ''}`, subtitle: `Under "${nodeValueText}"` },
    move: { title: 'Move', subtitle: `Choose a new ${parentLabel ?? ''} for "${nodeValueText}"` },
    delete: { title: 'Delete value' },
  };

  // The "menu" screen is now only a picker between Link/Move (Edit, Add
  // Child and Delete are reached directly from their own row icons and never
  // pass through here) — so Back only makes sense from screens reached
  // *through* that picker.
  const cameFromMenu = screen === 'link' || screen === 'move';

  return (
    <BottomSheet open={open} onClose={onClose} title={titles[screen].title} subtitle={titles[screen].subtitle} scrollable>
      {cameFromMenu && (
        <button type="button" onClick={() => setScreen('menu')} className="flex items-center gap-1 text-xs font-bold mb-3" style={{ color: 'var(--text-faint)' }}>
          <ChevronLeft size={14} /> Back
        </button>
      )}

      {screen === 'menu' && (
        <div className="space-y-1.5">
          {childField != null && <MenuRow icon={Link2} label="Link Existing Value" onClick={() => setScreen('link')} />}
          {parentField != null && <MenuRow icon={MoveIcon} label="Move" onClick={() => setScreen('move')} />}
        </div>
      )}

      {screen === 'edit' && (
        <div className="space-y-3">
          <input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)}
            className="w-full rounded-xl px-3 h-11 outline-none" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          <button onClick={() => void saveEdit()} disabled={saving || !editText.trim()}
            className="w-full rounded-xl py-3 font-black disabled:opacity-40" style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      {screen === 'addChild' && childField != null && node && (
        <div className="space-y-3">
          <CatalogField
            fieldNumber={childField}
            value=""
            onChange={() => {}}
            parentFieldNumber={node.field}
            parentValue={node.value.value}
            parentLabel={parentLabel ?? undefined}
            placeholder={`Search or add a ${(childLabel ?? '').toLowerCase()} value…`}
            uppercase
          />
          <button onClick={onClose} className="w-full rounded-xl py-3 font-black" style={{ background: 'var(--surface-2)', color: 'var(--text)' }}>Done</button>
        </div>
      )}

      {(screen === 'link' || screen === 'move') && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={16} style={{ color: 'var(--text-faint)' }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${((screen === 'link' ? childLabel : parentLabel) ?? '').toLowerCase()} values…`}
              className="w-full rounded-xl pl-9 pr-3 h-11 outline-none" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>

          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {screen === 'move' && (
              <PickerRow label="No parent (unlink)" muted checked={selectedId === null} onClick={() => setSelectedId(null)} />
            )}
            {(screen === 'link' ? linkOptions : moveOptions).map((v) => {
              const currentParentId = parentOf(catalogValueLinks, v.id);
              const currentParent = currentParentId ? catalogValues.find((p) => p.id === currentParentId) : undefined;
              return (
                <PickerRow key={v.id} label={v.value} hint={currentParent ? `currently under ${currentParent.value}` : undefined}
                  checked={selectedId === v.id} onClick={() => setSelectedId(v.id)} />
              );
            })}
            {(screen === 'link' ? linkOptions : moveOptions).length === 0 && screen === 'link' && (
              <p className="text-sm py-6 text-center" style={{ color: 'var(--text-faint)' }}>No other {(childLabel ?? '').toLowerCase()} values to link.</p>
            )}
          </div>

          <button
            onClick={() => void (screen === 'link' ? confirmLink() : confirmMove())}
            disabled={saving || (screen === 'link' ? !selectedId : selectedId === undefined)}
            className="w-full rounded-xl py-3 font-black disabled:opacity-40" style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
          >
            {saving ? 'Saving…' : screen === 'link' ? 'Link' : 'Move'}
          </button>
        </div>
      )}

      {screen === 'delete' && (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-xl p-3" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <AlertTriangle size={18} className="shrink-0 mt-0.5 text-red-400" />
            <p className="text-sm font-semibold text-red-400">
              {descendantCount > 0
                ? 'Deleting this item will also delete all linked child items. This action cannot be undone.'
                : 'Delete this value? This action cannot be undone.'}
            </p>
          </div>
          <button onClick={() => void confirmDelete()} disabled={saving}
            className="w-full rounded-xl py-3 font-black text-white disabled:opacity-40" style={{ background: '#ef4444' }}>
            {saving ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}

function MenuRow({ icon: Icon, label, onClick, danger }: { icon: typeof Pencil; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition active:scale-[0.99]"
      style={{ background: 'var(--surface-2)' }}>
      <Icon size={17} style={{ color: danger ? '#ef4444' : 'var(--accent)' }} />
      <span className="text-sm font-bold" style={{ color: danger ? '#ef4444' : 'var(--text)' }}>{label}</span>
    </button>
  );
}

function PickerRow({ label, hint, muted, checked, onClick }: { label: string; hint?: string; muted?: boolean; checked: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition active:scale-[0.99]"
      style={{ background: checked ? 'var(--accent-soft)' : 'var(--surface)', border: '1px solid var(--border)' }}>
      <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={checked ? { background: 'var(--accent)' } : { border: '1.5px solid var(--border-2)' }}>
        {checked && <Check size={12} style={{ color: 'var(--accent-fg)' }} />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold truncate" style={{ color: muted ? 'var(--text-faint)' : 'var(--text)' }}>{label}</span>
        {hint && <span className="block text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>{hint}</span>}
      </span>
    </button>
  );
}
