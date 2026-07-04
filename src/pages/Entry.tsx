import { useEffect, useRef, useState, useMemo } from "react";
import {
  Package,
  Trash2,
  Pencil,
  Check,
  Plus,
  ChevronRight,
  ShieldCheck,
  PartyPopper,
  Share2,
  MessageCircle,
  Printer,
  Download,
  Eye,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store/useStore";
import { useToast } from "../components/toastContext";
import LoadPicker from "../components/LoadPicker";
import Dropdown from "../components/Dropdown";
import ActiveTagBar from "../components/ActiveTagBar";
import FinalizeSheet from "../components/FinalizeSheet";
import ShareSheet, { type ShareAction } from "../components/ShareSheet";
import {
  shareWhatsAppImage,
  exportPDF,
  downloadPDF,
  printReceipt,
  type ShareCtx,
} from "../lib/share";
import { computeLoadStats } from "../lib/loadStats";
import type { Entry, Load, CatalogFieldNumber } from "../types";

// keep only digits and a single decimal point (blocks alphabets on mobile)
function sanitizeWeight(s: string): string {
  let out = s.replace(/[^0-9.]/g, "");
  const firstDot = out.indexOf(".");
  if (firstDot !== -1) {
    out =
      out.slice(0, firstDot + 1) + out.slice(firstDot + 1).replace(/\./g, "");
  }
  // max 2 decimals
  if (firstDot !== -1) out = out.slice(0, firstDot + 3);
  return out;
}

export default function EntryPage() {
  const {
    loads,
    entries,
    activeLoadId,
    setActiveLoad,
    loadEntries,
    addEntry,
    deleteEntry,
    updateEntry,
    restoreEntry,
    recentWeights,
    parties,
    customLabel1,
    customLabel2,
    customLabel3,
    updateLoad,
  } = useStore();
  const { show } = useToast();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [val, setVal] = useState("");
  const [picker, setPicker] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [finalizeSheetOpen, setFinalizeSheetOpen] = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [busy, setBusy] = useState("");
  // Transient "just finalized" confirmation screen — set explicitly right
  // after a successful finalize, cleared by "Create New Load" or by leaving
  // the page (fresh mount never restores it, matching "if the user exits
  // after finalization, Entry screen should show No Active Load").
  const [justFinalizedLoad, setJustFinalizedLoad] = useState<Load | null>(null);
  const [justFinalizedEntries, setJustFinalizedEntries] = useState<Entry[]>([]);

  // Group Entry Mode — the "currently active" label values new entries
  // inherit. Seeded from the load's own custom_field_1/2/3 whenever the
  // active load changes, so a load with no group switching behaves exactly
  // like the old single-value-per-load model.
  const [groupLabel1, setGroupLabel1] = useState("");
  const [groupLabel2, setGroupLabel2] = useState("");
  const [groupLabel3, setGroupLabel3] = useState("");

  // Entry is a Draft-only workflow screen — a finalized load is never
  // resumed here automatically, it's only ever reached via Loads/History.
  const rawActiveLoad = useMemo(
    () => loads.find((l) => l.id === activeLoadId) || null,
    [loads, activeLoadId],
  );
  const activeLoad =
    rawActiveLoad && rawActiveLoad.status !== "finalized"
      ? rawActiveLoad
      : null;
  const party = parties.find((p) => p.id === activeLoad?.party_id);

  // Linked Values — Category (field 1) is structurally Variety's (field 2)
  // parent whenever both labels are configured; Variety is Vakkal's (field
  // 3) parent likewise. Filtering itself gracefully falls back to "show all"
  // when a value has no links yet, so this wiring is safe to leave on
  // unconditionally.
  const parentFieldFor2: CatalogFieldNumber | null = customLabel1 ? 1 : null;
  const parentFieldFor3: CatalogFieldNumber | null = customLabel2 ? 2 : null;
  const setGroupLabel1Cascade = (v: string) => {
    setGroupLabel1(v);
    if (parentFieldFor2 === 1) {
      setGroupLabel2("");
      if (parentFieldFor3 === 2) setGroupLabel3("");
    }
  };
  const setGroupLabel2Cascade = (v: string) => {
    setGroupLabel2(v);
    if (parentFieldFor3 === 2) setGroupLabel3("");
  };

  const groupFields: Array<{
    n: CatalogFieldNumber;
    label: string | null;
    value: string;
    set: (v: string) => void;
    parentFieldNumber?: CatalogFieldNumber;
    parentValue?: string;
    parentLabel?: string;
  }> = [
    {
      n: 1,
      label: customLabel1,
      value: groupLabel1,
      set: setGroupLabel1Cascade,
    },
    {
      n: 2,
      label: customLabel2,
      value: groupLabel2,
      set: setGroupLabel2Cascade,
      parentFieldNumber: parentFieldFor2 ?? undefined,
      parentValue: parentFieldFor2 === 1 ? groupLabel1 : undefined,
      parentLabel: customLabel1 || undefined,
    },
    {
      n: 3,
      label: customLabel3,
      value: groupLabel3,
      set: setGroupLabel3,
      parentFieldNumber: parentFieldFor3 ?? undefined,
      parentValue: parentFieldFor3 === 2 ? groupLabel2 : undefined,
      parentLabel: customLabel2 || undefined,
    },
  ];
  const activeGroupFields = groupFields.filter(
    (f): f is typeof f & { label: string } => !!f.label,
  );

  useEffect(() => {
    if (activeLoadId) void loadEntries(activeLoadId);
  }, [activeLoadId, loadEntries]);
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeLoadId]);

  // Re-seed the active group whenever the selected load changes — adjusted
  // during render (React's documented pattern) instead of an Effect.
  const [seededForLoadId, setSeededForLoadId] = useState<string | null>(null);
  if (activeLoadId !== seededForLoadId) {
    setSeededForLoadId(activeLoadId);
    setGroupLabel1(activeLoad?.custom_field_1 || "");
    setGroupLabel2(activeLoad?.custom_field_2 || "");
    setGroupLabel3(activeLoad?.custom_field_3 || "");
  }

  const total = useMemo(
    () => entries.reduce((s, e) => s + Number(e.weight), 0),
    [entries],
  );
  const currentLabels = {
    custom_field_1: groupLabel1 || null,
    custom_field_2: groupLabel2 || null,
    custom_field_3: groupLabel3 || null,
  };

  const save = async () => {
    const w = parseFloat(val);
    if (!activeLoadId || !activeLoad || isNaN(w) || w <= 0) {
      setVal("");
      return;
    }
    await addEntry(
      activeLoadId,
      Math.round(w * 100) / 100,
      activeLoad.party_id,
      currentLabels,
    );
    setVal("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const quickAdd = async (w: number) => {
    if (!activeLoadId || !activeLoad) return;
    await addEntry(activeLoadId, w, activeLoad.party_id, currentLabels);
    inputRef.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void save();
    }
  };

  const remove = async (entry: Entry) => {
    if (!activeLoad) return;
    await deleteEntry(entry.id);
    show("Entry deleted", {
      label: "Undo",
      onClick: () => void restoreEntry(entry),
    });
    inputRef.current?.focus();
  };

  const commitEdit = async (id: string) => {
    if (!activeLoad) {
      setEditId(null);
      return;
    }
    const w = parseFloat(editVal);
    if (!isNaN(w) && w > 0) await updateEntry(id, Math.round(w * 100) / 100);
    setEditId(null);
    setEditVal("");
    inputRef.current?.focus();
  };

  const handleFinalize = async (
    containerCount: number,
    weightPerContainer: number,
  ) => {
    if (!activeLoad) return;
    await updateLoad({
      id: activeLoad.id,
      status: "finalized",
      container_count: containerCount,
      weight_per_container: weightPerContainer,
    });
    setJustFinalizedLoad({
      ...activeLoad,
      status: "finalized",
      container_count: containerCount,
      weight_per_container: weightPerContainer,
    });
    setJustFinalizedEntries(entries);
    setActiveLoad(null);
    show("Load finalized — entries are now locked");
  };

  const startNewLoad = () => {
    setJustFinalizedLoad(null);
    setJustFinalizedEntries([]);
    setPicker(true);
  };

  // ===================== "Load Finalized" confirmation screen =====================
  if (justFinalizedLoad) {
    const stats = computeLoadStats(justFinalizedLoad, justFinalizedEntries);
    const ctx: ShareCtx = {
      load: justFinalizedLoad,
      entries: justFinalizedEntries,
      party: parties.find((p) => p.id === justFinalizedLoad.party_id),
    };
    const run = async (
      key: string,
      fn: () => Promise<void> | void,
      okMsg?: string,
    ) => {
      setBusy(key);
      try {
        await fn();
        if (okMsg) show(okMsg);
        setShareSheetOpen(false);
      } catch (e) {
        console.error(e);
        show((e as Error).message || "Action failed");
      } finally {
        setBusy("");
      }
    };
    const shareActions: ShareAction[] = [
      {
        key: "whatsapp",
        label: "WhatsApp",
        icon: <MessageCircle size={18} />,
        tint: "#128C4B",
        bg: "rgba(37,211,102,0.16)",
        busy: busy === "whatsapp",
        onClick: () => void run("whatsapp", () => shareWhatsAppImage(ctx)),
      },
      {
        key: "share",
        label: "Share",
        icon: <Share2 size={18} />,
        tint: "#dc2626",
        bg: "rgba(220,38,38,0.12)",
        busy: busy === "share",
        onClick: () => void run("share", () => exportPDF(ctx)),
      },
      {
        key: "print",
        label: "Print",
        icon: <Printer size={18} />,
        tint: "var(--accent-deep)",
        bg: "var(--accent-soft)",
        busy: busy === "print",
        onClick: () => void run("print", () => printReceipt(ctx)),
      },
      {
        key: "download-pdf",
        label: "Download PDF",
        icon: <Download size={18} />,
        tint: "#2563eb",
        bg: "rgba(37,99,235,0.12)",
        busy: busy === "download-pdf",
        onClick: () =>
          void run("download-pdf", () => downloadPDF(ctx), "Saved to device"),
      },
    ];
    return (
      <div className="py-6 text-center">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: "var(--accent-soft)" }}
        >
          <PartyPopper size={36} style={{ color: "var(--accent)" }} />
        </div>
        <h2
          className="text-2xl font-black mb-1"
          style={{ color: "var(--text)" }}
        >
          Load Finalized
        </h2>
        <p className="text-sm mb-6" style={{ color: "var(--text-faint)" }}>
          {justFinalizedLoad.label || "Load"} is locked and ready to share.
        </p>

        <div
          className="rounded-2xl p-4 mb-6 grid grid-cols-3 gap-2"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div>
            <p
              className="text-[10px] uppercase tracking-wider font-bold"
              style={{ color: "var(--text-faint)" }}
            >
              Gross
            </p>
            <p
              className="text-lg font-black tabular-nums"
              style={{ color: "var(--text)" }}
            >
              {stats.gross.toFixed(2)}
            </p>
          </div>
          <div>
            <p
              className="text-[10px] uppercase tracking-wider font-bold"
              style={{ color: "var(--text-faint)" }}
            >
              Tare
            </p>
            <p
              className="text-lg font-black tabular-nums"
              style={{ color: "var(--text)" }}
            >
              {stats.tare.toFixed(2)}
            </p>
          </div>
          <div>
            <p
              className="text-[10px] uppercase tracking-wider font-bold"
              style={{ color: "var(--text-faint)" }}
            >
              Net
            </p>
            <p
              className="text-lg font-black tabular-nums"
              style={{ color: "var(--accent-deep)" }}
            >
              {stats.net.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          <button
            onClick={() => navigate(`/loads/${justFinalizedLoad.id}`)}
            className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-base font-black transition active:scale-95"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            <Eye size={20} /> View Load
          </button>
          <button
            onClick={() => setShareSheetOpen(true)}
            className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-base font-black transition active:scale-95"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
          >
            <Share2 size={20} /> Share Load
          </button>
          <button
            onClick={startNewLoad}
            className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-base font-black transition active:scale-95"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
          >
            <Plus size={20} /> Create New Load
          </button>
        </div>

        <ShareSheet
          open={shareSheetOpen}
          onClose={() => setShareSheetOpen(false)}
          actions={shareActions}
        />
        {picker && (
          <LoadPicker
            onClose={() => setPicker(false)}
            onPick={(l: Load) => {
              setActiveLoad(l.id);
              setPicker(false);
            }}
          />
        )}
      </div>
    );
  }

  // ===================== "No Active Load" — draft-resume or browse ===================
  if (!activeLoad) {
    return (
      <div className="py-6">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-lime-500/15 flex items-center justify-center mx-auto mb-3">
            <Package size={32} className="text-lime-400" />
          </div>
          <h2 className="text-xl font-black mb-1">No Active Load</h2>
          <p className="text-slate-500 text-sm">
            Pick a draft load below or create a new one.
          </p>
        </div>

        <button
          onClick={() => setPicker(true)}
          className="w-full bg-lime-500 text-slate-950 font-black rounded-2xl py-4 mb-5 flex items-center justify-center gap-2 active:scale-95 transition"
        >
          <Plus size={20} /> New Load
        </button>

        {loads.length > 0 && (
          <>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">
              Recent loads
            </p>
            <div className="space-y-2">
              {loads.slice(0, 10).map((l) => {
                const p = parties.find((x) => x.id === l.party_id);
                const fv = [
                  l.custom_field_1,
                  l.custom_field_2,
                  l.custom_field_3,
                ]
                  .filter(Boolean)
                  .join(" · ");
                const finalized = l.status === "finalized";
                return (
                  <button
                    key={l.id}
                    onClick={() =>
                      finalized
                        ? navigate(`/loads/${l.id}`)
                        : setActiveLoad(l.id)
                    }
                    className="w-full flex items-center gap-3 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-3.5 text-left transition active:scale-[0.98]"
                  >
                    <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
                      <Package size={18} className="text-lime-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white truncate">
                        {l.label}
                        {fv ? (
                          <span className="text-lime-400 font-semibold">
                            {" "}
                            · {fv}
                          </span>
                        ) : (
                          ""
                        )}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {p ? p.name : "No party"} ·{" "}
                        {new Date(l.created_at || "").toLocaleDateString(
                          "en-IN",
                        )}{" "}
                        · {finalized ? "Finalized" : "Draft"}
                      </p>
                    </div>
                    <ChevronRight
                      size={18}
                      className="text-slate-600 shrink-0"
                    />
                  </button>
                );
              })}
            </div>
          </>
        )}
        {picker && (
          <LoadPicker
            onClose={() => setPicker(false)}
            onPick={(l: Load) => {
              setActiveLoad(l.id);
              setPicker(false);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Load selector + totals */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <Dropdown
            value={activeLoadId || ""}
            onChange={(v) => setActiveLoad(v)}
            options={loads
              .filter((l) => l.status !== "finalized")
              .map((l) => ({
                value: l.id,
                label: l.label,
                sub:
                  [l.custom_field_1, l.custom_field_2, l.custom_field_3]
                    .filter(Boolean)
                    .join(" · ") || undefined,
              }))}
            placeholder="Select load"
          />
        </div>
        <button
          onClick={() => setPicker(true)}
          className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-lime-400 font-bold shrink-0"
        >
          + Load
        </button>
      </div>

      {/* Summary Cards - Entries and Total Weight */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div
          className="rounded-xl p-3 min-w-0"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <p
            className="text-xs uppercase tracking-wide font-bold"
            style={{ color: "var(--text-faint)" }}
          >
            Entries
          </p>
          <p
            className="text-3xl font-black tabular-nums truncate"
            style={{ color: "var(--text)" }}
          >
            {entries.length}
          </p>
        </div>
        <div
          className="rounded-xl p-3 min-w-0"
          style={{
            background: "linear-gradient(180deg, var(--surface) 0%, var(--surface-2) 100%)",
            border: "1px solid var(--accent-deep)",
          }}
        >
          <p
            className="text-xs uppercase tracking-wide font-bold"
            style={{ color: "var(--text-faint)" }}
          >
            Total Weight
          </p>
          <p
            className="text-2xl sm:text-3xl font-black tabular-nums truncate"
            style={{ color: "var(--accent-deep)" }}
          >
            {total.toFixed(2)}
            <span
              className="text-sm sm:text-base font-bold ml-1"
              style={{ color: "var(--text-muted)" }}
            >
              kg
            </span>
          </p>
        </div>
      </div>
      {party && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span
            className="text-[11px] font-bold rounded-full px-2.5 py-1"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-muted)",
            }}
          >
            {party.name}
          </span>
        </div>
      )}

      {/* Active Tag Mode — pick a label value once, every new entry inherits
          it until changed. Existing single-classification loads work
          unchanged: the bar just starts seeded from the load's own value and
          nothing here needs to be touched. Remounts on load switch (key)
          so its internal focus/add-mode state doesn't leak between loads. */}
      {activeGroupFields.length > 0 && (
        <ActiveTagBar key={activeLoadId} fields={activeGroupFields} />
      )}

      {/* Big input */}
      <div className="mb-3">
        <div className="relative">
          <input
            ref={inputRef}
            value={val}
            onChange={(e) => setVal(sanitizeWeight(e.target.value))}
            onKeyDown={onKey}
            inputMode="decimal"
            type="text"
            pattern="[0-9]*[.]?[0-9]*"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="done"
            placeholder="0.00"
            autoFocus
            className="w-full bg-slate-900 border-2 border-slate-700 focus:border-lime-500 rounded-2xl px-5 py-5 text-5xl font-black text-white tabular-nums outline-none text-center placeholder-slate-700 disabled:opacity-50"
          />
          <button
            onClick={() => void save()}
            disabled={!val}
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-lime-500 text-slate-950 font-black rounded-xl px-5 py-3 disabled:opacity-40"
          >
            SAVE
          </button>
        </div>
        <p className="text-center text-xs text-slate-600 mt-1">
          Type weight and press Enter
        </p>
      </div>

      {/* Recent weights — 5 per row */}
      {recentWeights.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-slate-500 mb-1.5 font-semibold uppercase tracking-wider">
            Recent weights
          </p>
          <div className="grid grid-cols-5 gap-2">
            {recentWeights.slice(0, 10).map((w) => (
              <button
                key={w}
                onClick={() => void quickAdd(w)}
                className="font-bold rounded-xl py-3 tabular-nums transition text-sm"
                style={{
                  background: "var(--accent-soft)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                }}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Weight Entries - Grouped by Label 2 (Variety) */}
      {entries.length > 0 && (
        <div
          className="rounded-2xl p-4 mb-4"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <p
            className="text-[9px] font-black uppercase tracking-[0.15em] mb-3"
            style={{ color: "var(--text-faint)" }}
          >
            Weight Entries ({entries.length})
          </p>

          {customLabel2 ? (
            // Group by label 2 (variety) and show sections with total weight
            (() => {
              const sections: Array<{
                label: string;
                entries: Array<{ entry: Entry; index: number }>;
                totalWeight: number;
              }> = [];
              entries.forEach((e, i) => {
                const label =
                  e.custom_field_2 || activeLoad?.custom_field_2 || "Others";
                let section = sections.find((s) => s.label === label);
                if (!section) {
                  section = { label, entries: [], totalWeight: 0 };
                  sections.push(section);
                }
                section.entries.push({ entry: e, index: i });
                section.totalWeight += Number(e.weight);
              });

              return sections.map((section) => (
                <div key={section.label} className="mb-4 last:mb-0">
                  {/* Section Header with Total Weight */}
                  <div
                    className="flex items-center justify-between px-3 py-2 rounded-lg mb-2"
                    style={{
                      background: "var(--accent-soft)",
                      border: "1px solid var(--accent-deep)",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="text-sm font-black"
                        style={{ color: "var(--accent-deep)" }}
                      >
                        {section.label}
                      </span>
                      <span
                        className="text-xs font-bold"
                        style={{ color: "var(--accent-deep)" }}
                      >
                        · {section.entries.length}{" "}
                        {section.entries.length === 1 ? "entry" : "entries"}
                      </span>
                    </div>
                    <span
                      className="text-sm font-black tabular-nums"
                      style={{ color: "var(--accent-deep)" }}
                    >
                      {section.totalWeight.toFixed(2)} kg
                    </span>
                  </div>

                  {/* Weight Grid for this section */}
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {section.entries.map(({ entry: e, index }) => (
                      <div
                        key={e.id}
                        className="relative group rounded-xl p-2 text-center"
                        style={{
                          background: "var(--surface-2)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        <span
                          className="absolute top-1 left-1.5 text-[10px] tabular-nums"
                          style={{ color: "var(--text-faint)" }}
                        >
                          {entries.length - index}
                        </span>
                        {editId === e.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              autoFocus
                              value={editVal}
                              onChange={(ev) =>
                                setEditVal(sanitizeWeight(ev.target.value))
                              }
                              inputMode="decimal"
                              type="text"
                              pattern="[0-9]*[.]?[0-9]*"
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck={false}
                              enterKeyHint="done"
                              onKeyDown={(ev) =>
                                ev.key === "Enter" && commitEdit(e.id)
                              }
                              className="w-full rounded-lg px-1 py-1 text-lg font-bold text-center outline-none"
                              style={{
                                background: "var(--surface)",
                                color: "var(--text)",
                              }}
                            />
                            <button
                              aria-label="Save weight"
                              onClick={() => commitEdit(e.id)}
                              style={{ color: "var(--accent)" }}
                            >
                              <Check size={16} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <p
                              className="text-xl font-black tabular-nums pt-1"
                              style={{ color: "var(--text)" }}
                            >
                              {Number(e.weight).toFixed(2)}
                            </p>
                            <div className="flex justify-center gap-3 mt-1 opacity-60">
                              <button
                                aria-label="Edit weight"
                                onClick={() => {
                                  setEditId(e.id);
                                  setEditVal(String(e.weight));
                                }}
                                style={{ color: "var(--text-muted)" }}
                                className="hover:opacity-100"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                aria-label="Delete weight"
                                onClick={() => remove(e)}
                                className="hover:opacity-100"
                                style={{ color: "#ef4444" }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()
          ) : (
            // No label 2, show flat grid
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {entries.map((e, i) => (
                <div
                  key={e.id}
                  className="relative group rounded-xl p-2 text-center"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <span
                    className="absolute top-1 left-1.5 text-[10px] tabular-nums"
                    style={{ color: "var(--text-faint)" }}
                  >
                    {entries.length - i}
                  </span>
                  {editId === e.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={editVal}
                        onChange={(ev) =>
                          setEditVal(sanitizeWeight(ev.target.value))
                        }
                        inputMode="decimal"
                        type="text"
                        pattern="[0-9]*[.]?[0-9]*"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        enterKeyHint="done"
                        onKeyDown={(ev) =>
                          ev.key === "Enter" && commitEdit(e.id)
                        }
                        className="w-full rounded-lg px-1 py-1 text-lg font-bold text-center outline-none"
                        style={{
                          background: "var(--surface)",
                          color: "var(--text)",
                        }}
                      />
                      <button
                        aria-label="Save weight"
                        onClick={() => commitEdit(e.id)}
                        style={{ color: "var(--accent)" }}
                      >
                        <Check size={16} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <p
                        className="text-xl font-black tabular-nums pt-1"
                        style={{ color: "var(--text)" }}
                      >
                        {Number(e.weight).toFixed(2)}
                      </p>
                      <div className="flex justify-center gap-3 mt-1 opacity-60">
                        <button
                          aria-label="Edit weight"
                          onClick={() => {
                            setEditId(e.id);
                            setEditVal(String(e.weight));
                          }}
                          style={{ color: "var(--text-muted)" }}
                          className="hover:opacity-100"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          aria-label="Delete weight"
                          onClick={() => remove(e)}
                          className="hover:opacity-100"
                          style={{ color: "#ef4444" }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {entries.length === 0 && (
        <p
          className="text-center py-8 text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          No entries yet. Start weighing above.
        </p>
      )}

      {/* Primary CTA: finalize this draft load */}
      <button
        onClick={() => setFinalizeSheetOpen(true)}
        className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 mt-5 text-base font-black transition active:scale-95"
        style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
      >
        <ShieldCheck size={20} /> Finalize Load
      </button>

      <FinalizeSheet
        open={finalizeSheetOpen}
        onClose={() => setFinalizeSheetOpen(false)}
        entryCount={entries.length}
        grossWeight={total}
        onConfirm={handleFinalize}
      />

      {picker && (
        <LoadPicker
          onClose={() => setPicker(false)}
          onPick={(l: Load) => {
            setActiveLoad(l.id);
            setPicker(false);
          }}
        />
      )}
    </div>
  );
}
