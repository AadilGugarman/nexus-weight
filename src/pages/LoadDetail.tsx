import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  MessageCircle,
  Printer,
  Download,
  Loader2,
  Scale,
  Lock,
  Pencil,
  ShieldCheck,
  AlertTriangle,
  Share2,
} from "lucide-react";
import { useStore } from "../store/useStore";
import { apiGet } from "../lib/api";
import { useToast } from "../components/toastContext";
import {
  shareWhatsAppImage,
  exportPDF,
  downloadPDF,
  printReceipt,
  type ShareCtx,
} from "../lib/share";
import {
  computeLoadStats,
  computeLabelGroups,
  computeNestedGroups,
} from "../lib/loadStats";
import { resolveLinkedChain } from "../lib/catalogLinks";
import FinalizeSheet from "../components/FinalizeSheet";
import ShareSheet, { type ShareAction } from "../components/ShareSheet";
import NestedBreakdown from "../components/NestedBreakdown";
import type { Entry, CatalogFieldNumber } from "../types";

export default function LoadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { show } = useToast();
  const {
    loads,
    parties,
    customLabel1,
    customLabel2,
    customLabel3,
    catalogValues,
    catalogValueLinks,
    updateLoad,
    setActiveLoad,
  } = useStore();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [finalizeSheetOpen, setFinalizeSheetOpen] = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [unlockConfirmOpen, setUnlockConfirmOpen] = useState(false);

  const load = loads.find((l) => l.id === id);
  const party = parties.find((p) => p.id === load?.party_id);

  useEffect(() => {
    if (!id) return;
    apiGet<Entry[]>(`entries?load_id=${id}`)
      .then(setEntries)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (!load)
    return (
      <div className="py-16 text-center" style={{ color: "var(--text-muted)" }}>
        Load not found.
      </div>
    );
  const ordered = [...entries].sort((a, b) =>
    (a.created_at || "").localeCompare(b.created_at || ""),
  );
  const { entryCount, gross, tare, net, firstEntryAt, lastEntryAt } =
    computeLoadStats(load, ordered);
  const isFinalized = load.status === "finalized";
  const ctx: ShareCtx = { load, entries: ordered, party };
  const customFields = [
    { label: customLabel1, value: load.custom_field_1 },
    { label: customLabel2, value: load.custom_field_2 },
    { label: customLabel3, value: load.custom_field_3 },
  ].filter(
    (f): f is { label: string; value: string } => !!f.label && !!f.value,
  );
  // Linked Values: whichever Label1->Label2(->Label3) pairs have actually
  // been linked nest into one tree below; everything else (including every
  // label when nothing's been linked yet) stays an independent flat
  // breakdown, exactly like before Linked Values existed.
  const nestedLabels = [
    customLabel1 || "",
    customLabel2 || "",
    customLabel3 || "",
  ];
  const chain = resolveLinkedChain(
    catalogValues,
    catalogValueLinks,
    nestedLabels,
  );
  // Show only label 2 (variety) breakdown with count and weight
  const label2Groups = customLabel2 ? computeLabelGroups(load, ordered, 2) : [];
  const showLabel2Breakdown = label2Groups.length > 1;
  
  // Calculate unique counts for label 1 (fruit) and label 2 (variety)
  const label1Groups = customLabel1 ? computeLabelGroups(load, ordered, 1) : [];
  const uniqueLabel1Count = label1Groups.length;
  const uniqueLabel2Count = label2Groups.length;
  
  // Calculate lowest and highest weights
  const weights = ordered.map(e => Number(e.weight));
  const lowestWeight = weights.length > 0 ? Math.min(...weights) : 0;
  const highestWeight = weights.length > 0 ? Math.max(...weights) : 0;
  const nestedGroups =
    chain.length >= 2 ? computeNestedGroups(load, ordered, chain) : [];
  const showNested = false; // Disable nested view

  const guard = () =>
    ordered.length > 0 || (show("No entries to export"), false);

  const handleEditReopen = async () => {
    // First unlock the load (change status to draft)
    await updateLoad({ id: load.id, status: "draft" });
    // Set the active load in the store
    setActiveLoad(load.id);
    // Navigate to Entry page
    navigate("/");
    show("Load reopened for editing");
  };

  const run = async (
    key: string,
    fn: () => Promise<void> | void,
    okMsg?: string,
  ) => {
    if (!guard()) return;
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

  const handleFinalize = async (
    containerCount: number,
    weightPerContainer: number,
  ) => {
    await updateLoad({
      id: load.id,
      status: "finalized",
      container_count: containerCount,
      weight_per_container: weightPerContainer,
    });
    show("Load finalized — entries are now locked");
  };

  const handleUnlock = async () => {
    setUnlockConfirmOpen(false);
    await updateLoad({ id: load.id, status: "draft" });
    show("Load unlocked for editing");
  };

  const createdAt = load.created_at ? new Date(load.created_at) : new Date();
  const dateStr = createdAt.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  
  // Calculate duration and times for operational metrics
  const getDayName = (date: Date) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
  };
  
  const formatTime12h = (dateStr: string | null) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };
  
  const calculateDuration = () => {
    if (!firstEntryAt || !lastEntryAt) return "—";
    const start = new Date(firstEntryAt);
    const end = new Date(lastEntryAt);
    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };
  
  const dayName = getDayName(createdAt);
  const duration = calculateDuration();

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
    <div className="pb-6">
      {/* ===== Header row: Back only — export actions moved into Share Load ===== */}
      <div className="mb-5">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 font-semibold text-sm rounded-xl px-3 py-2 transition active:scale-95"
          style={{
            color: "var(--text-muted)",
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <ArrowLeft size={18} /> Back
        </button>
      </div>

      {/* ===== Status bar: Draft/Finalized + (finalized only) the explicit unlock action ===== */}
      <div
        className="flex items-center justify-between gap-2 mb-4 rounded-2xl px-4 py-3"
        style={{
          background: isFinalized ? "var(--accent-soft)" : "var(--surface-2)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="flex items-center gap-2">
          {isFinalized ? (
            <Lock size={16} style={{ color: "var(--accent-deep)" }} />
          ) : (
            <Pencil size={16} style={{ color: "var(--text-muted)" }} />
          )}
          <div>
            <p
              className="text-sm font-black"
              style={{
                color: isFinalized ? "var(--accent-deep)" : "var(--text)",
              }}
            >
              {isFinalized ? "Finalized" : "Draft"}
            </p>
            <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
              {!isFinalized && "Entries can be added, edited, and deleted."}
            </p>
          </div>
        </div>
        {isFinalized && (
          <button
            onClick={handleEditReopen}
            className="shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition active:scale-95"
            style={{
              background: "var(--surface)",
              color: "var(--text)",
              border: "1px solid var(--border-2)",
            }}
          >
            <Pencil size={14} /> Edit / Reopen
          </button>
        )}
      </div>

      {/* ===== Primary CTA: mobile-first, one big obvious action per state ===== */}
      {isFinalized ? (
        <button
          onClick={() => setShareSheetOpen(true)}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 mb-5 text-base font-black transition active:scale-95"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          <Share2 size={20} /> Share Load
        </button>
      ) : (
        <button
          onClick={() => setFinalizeSheetOpen(true)}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 mb-5 text-base font-black transition active:scale-95"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          <ShieldCheck size={20} /> Finalize Load
        </button>
      )}

      {/* ===== Mobile-Friendly Industrial Dashboard ===== */}
      <div
        className="rounded-2xl overflow-hidden shadow-xl"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Header Section - Vehicle, Party, Date/Time, Total Entries/Variety */}
        <div
          className="px-4 py-3"
          style={{
            background: "var(--surface-2)",
            borderBottom: "2px solid var(--border)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            {/* Left: Vehicle, Party, Label 1, Total Entries/Variety */}
            <div className="flex-1 min-w-0">
              <p
                className="text-lg font-black leading-tight truncate"
                style={{ color: "var(--text)" }}
              >
                {load.label}
              </p>
              {party && (
                <p
                  className="text-xs font-semibold truncate mt-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  {party.name}
                </p>
              )}
              {/* Show only Label 1 (Fruit) if available */}
              {load.custom_field_1 && (
                <div className="mt-2">
                  <span
                    className="text-xs font-bold px-2.5 py-1 rounded-lg inline-block"
                    style={{
                      background: "var(--accent-soft)",
                      color: "var(--accent-deep)",
                      border: "1px solid var(--accent-deep)",
                    }}
                  >
                    {load.custom_field_1}
                  </span>
                </div>
              )}
              
              {/* Total Entries and Total Variety below label - slightly down with mt-3 */}
              <div
                className="grid gap-2 mt-3"
                style={{
                  gridTemplateColumns: customLabel2 && uniqueLabel2Count > 0 ? 'repeat(2, 1fr)' : '1fr',
                  maxWidth: customLabel2 && uniqueLabel2Count > 0 ? '280px' : '140px',
                }}
              >
                <div
                  className="rounded-lg px-2.5 py-2 text-center"
                  style={{
                    background: "linear-gradient(180deg, var(--surface) 0%, var(--surface-2) 100%)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <p
                    className="text-[8px] uppercase tracking-wider font-black mb-0.5"
                    style={{ color: "var(--text-faint)" }}
                  >
                    Entries
                  </p>
                  <p
                    className="text-base font-black"
                    style={{ color: "var(--text)" }}
                  >
                    {entryCount}
                  </p>
                </div>
                
                {customLabel2 && uniqueLabel2Count > 0 && (
                  <div
                    className="rounded-lg px-2.5 py-2 text-center"
                    style={{
                      background: "linear-gradient(180deg, var(--surface) 0%, var(--surface-2) 100%)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <p
                      className="text-[8px] uppercase tracking-wider font-black mb-0.5"
                      style={{ color: "var(--text-faint)" }}
                    >
                      {customLabel2}
                    </p>
                    <p
                      className="text-base font-black"
                      style={{ color: "var(--text)" }}
                    >
                      {uniqueLabel2Count}
                    </p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Right: Date & Time Block - Vertical Layout (no "Date" label) */}
            <div
              className="text-right shrink-0 rounded-xl px-3 py-2"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <p
                className="font-black text-xs mb-0.5"
                style={{ color: "var(--text)" }}
              >
                {dateStr}
              </p>
              <p
                className="text-[9px] font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                {dayName}
              </p>
              
              {firstEntryAt && (
                <>
                  <div className="h-px my-1.5" style={{ background: "var(--border)" }} />
                  
                  <p
                    className="text-[8px] uppercase tracking-widest font-black mb-0.5"
                    style={{ color: "var(--text-faint)" }}
                  >
                    Start Time
                  </p>
                  <p
                    className="font-bold text-[10px] mb-1.5"
                    style={{ color: "var(--text)" }}
                  >
                    {formatTime12h(firstEntryAt)}
                  </p>
                  
                  <p
                    className="text-[8px] uppercase tracking-widest font-black mb-0.5"
                    style={{ color: "var(--text-faint)" }}
                  >
                    End Time
                  </p>
                  <p
                    className="font-bold text-[10px] mb-1.5"
                    style={{ color: "var(--text)" }}
                  >
                    {formatTime12h(lastEntryAt)}
                  </p>
                  
                  <p
                    className="text-[8px] uppercase tracking-widest font-black mb-0.5"
                    style={{ color: "var(--text-faint)" }}
                  >
                    Duration
                  </p>
                  <p
                    className="font-black text-[10px]"
                    style={{ color: "var(--accent-deep)" }}
                  >
                    {duration}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* PRIMARY KPI: NET WEIGHT - Compact Height */}
        <div
          className="px-4 py-3 text-center"
          style={{
            background: "linear-gradient(180deg, var(--surface) 0%, var(--surface-2) 100%)",
            borderBottom: "2px solid var(--border)",
          }}
        >
          <p
            className="text-[9px] uppercase tracking-[0.2em] font-black mb-1.5"
            style={{ color: "var(--text-faint)" }}
          >
            NET WEIGHT
          </p>
          <p
            className="font-black tabular-nums leading-none"
            style={{
              fontSize: "clamp(2rem, 10vw, 3rem)",
              color: "var(--accent-deep)",
              textShadow: "0 2px 8px rgba(234, 88, 12, 0.15)",
            }}
          >
            {net.toFixed(2)}
            <span
              className="font-bold ml-1.5"
              style={{
                fontSize: "clamp(0.875rem, 3.5vw, 1.25rem)",
                color: "var(--text-muted)",
              }}
            >
              kg
            </span>
          </p>
        </div>

        {/* Metrics Row: Only Lowest/Highest Weight */}
        <div
          className="px-3 py-4 grid grid-cols-2 gap-2.5"
          style={{
            background: "var(--surface-2)",
            borderTop: "1px solid var(--border)",
          }}
        >
          <MetricCard label="Lowest Weight" value={`${lowestWeight.toFixed(2)} kg`} />
          <MetricCard label="Highest Weight" value={`${highestWeight.toFixed(2)} kg`} />
        </div>

        {/* Weight entries grouped by Label 2 */}
        {!loading && ordered.length > 0 && (
          <>
            <div
              className="h-px mx-4"
              style={{ background: "var(--border)" }}
            />
            <div className="px-4 py-4">
              <p
                className="text-[9px] font-black uppercase tracking-[0.15em] mb-3"
                style={{ color: "var(--text-faint)" }}
              >
                Weight Entries ({ordered.length})
              </p>
              
              {customLabel2 ? (
                // Group by label 2 and show sections with total weight
                (() => {
                  const sections: Array<{ label: string; entries: Array<{ entry: Entry; index: number }>; totalWeight: number }> = [];
                  ordered.forEach((e, i) => {
                    const label = e.custom_field_2 || load.custom_field_2 || 'Others';
                    let section = sections.find(s => s.label === label);
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
                            · {section.entries.length} {section.entries.length === 1 ? 'entry' : 'entries'}
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
                      <div className="grid grid-cols-5 sm:grid-cols-6 lg:grid-cols-8 gap-1.5">
                        {section.entries.map(({ entry, index }) => (
                          <div
                            key={entry.id}
                            className="relative rounded-lg pt-2.5 pb-1.5 text-center"
                            style={{
                              background: "var(--surface-2)",
                              border: "1px solid var(--border)",
                            }}
                          >
                            <span
                              className="absolute top-0.5 left-1 text-[7px] font-extrabold"
                              style={{ color: "var(--text-faint)" }}
                            >
                              {index + 1}
                            </span>
                            <span
                              className="block font-extrabold tabular-nums text-[12px] leading-none px-0.5 truncate"
                              style={{ color: "var(--text)" }}
                            >
                              {Number(entry.weight).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()
              ) : (
                // No label 2, show flat list
                <div className="grid grid-cols-5 sm:grid-cols-6 lg:grid-cols-8 gap-1.5">
                  {ordered.map((e, i) => (
                    <div
                      key={e.id}
                      className="relative rounded-lg pt-2.5 pb-1.5 text-center"
                      style={{
                        background: "var(--surface-2)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <span
                        className="absolute top-0.5 left-1 text-[7px] font-extrabold"
                        style={{ color: "var(--text-faint)" }}
                      >
                        {i + 1}
                      </span>
                      <span
                        className="block font-extrabold tabular-nums text-[12px] leading-none px-0.5 truncate"
                        style={{ color: "var(--text)" }}
                      >
                        {Number(e.weight).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {loading && (
          <div className="py-8 flex justify-center">
            <Loader2
              className="animate-spin"
              style={{ color: "var(--accent-deep)" }}
            />
          </div>
        )}

        {/* Weight Calculation: Gross - Tare = Net (Compact Formula) */}
        <div className="px-3 py-4">
          <div
            className="h-px mb-4"
            style={{ background: "var(--border)" }}
          />
          <p
            className="text-[9px] font-black uppercase tracking-[0.15em] mb-3 text-center"
            style={{ color: "var(--text-faint)" }}
          >
            Weight Breakdown
          </p>
          <div className="flex items-center justify-center gap-1.5">
            {/* Gross Weight */}
            <div
              className="flex-1 rounded-lg px-2 py-3 text-center"
              style={{
                background: "var(--surface)",
                border: "1.5px solid var(--border)",
              }}
            >
              <p
                className="text-[8px] uppercase tracking-wider font-black mb-1"
                style={{ color: "var(--text-faint)" }}
              >
                Gross
              </p>
              <p
                className="font-black tabular-nums text-base"
                style={{ color: "var(--text)" }}
              >
                {gross.toFixed(2)}
              </p>
              <p
                className="text-[9px] font-semibold"
                style={{ color: "var(--text-muted)" }}
              >
                kg
              </p>
            </div>

            {/* Minus Sign */}
            <div
              className="flex items-center justify-center w-7 h-7 rounded-md shrink-0"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
              }}
            >
              <span
                className="text-base font-black"
                style={{ color: "var(--text-muted)" }}
              >
                −
              </span>
            </div>

            {/* Tare Weight */}
            <div
              className="flex-1 rounded-lg px-2 py-3 text-center"
              style={{
                background: "var(--surface)",
                border: "1.5px solid var(--border)",
              }}
            >
              <p
                className="text-[8px] uppercase tracking-wider font-black mb-1"
                style={{ color: "var(--text-faint)" }}
              >
                Tare
              </p>
              <p
                className="font-black tabular-nums text-base"
                style={{ color: "var(--text)" }}
              >
                {tare.toFixed(2)}
              </p>
              <p
                className="text-[9px] font-semibold"
                style={{ color: "var(--text-muted)" }}
              >
                kg
              </p>
            </div>

            {/* Equals Sign */}
            <div
              className="flex items-center justify-center w-7 h-7 rounded-md shrink-0"
              style={{
                background: "var(--accent-soft)",
                border: "1px solid var(--accent-deep)",
              }}
            >
              <span
                className="text-base font-black"
                style={{ color: "var(--accent-deep)" }}
              >
                =
              </span>
            </div>

            {/* Net Weight Result */}
            <div
              className="flex-1 rounded-lg px-2 py-3 text-center"
              style={{
                background: "var(--accent-soft)",
                border: "1.5px solid var(--accent-deep)",
              }}
            >
              <p
                className="text-[8px] uppercase tracking-wider font-black mb-1"
                style={{ color: "var(--accent-deep)" }}
              >
                Net
              </p>
              <p
                className="font-black tabular-nums text-base"
                style={{ color: "var(--accent-deep)" }}
              >
                {net.toFixed(2)}
              </p>
              <p
                className="text-[9px] font-semibold"
                style={{ color: "var(--accent-deep)" }}
              >
                kg
              </p>
            </div>
          </div>
        </div>

        <div className="h-3" />
      </div>

      {!isFinalized && (
        <p
          className="text-[11px] mt-3 text-center"
          style={{ color: "var(--text-faint)" }}
        >
          Sharing, PDF, and print unlock once this load is finalized.
        </p>
      )}

      <FinalizeSheet
        open={finalizeSheetOpen}
        onClose={() => setFinalizeSheetOpen(false)}
        entryCount={entryCount}
        grossWeight={gross}
        onConfirm={handleFinalize}
      />

      <ShareSheet
        open={shareSheetOpen}
        onClose={() => setShareSheetOpen(false)}
        actions={shareActions}
      />

      {unlockConfirmOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: "rgba(0,0,0,0.7)" }}
        >
          <div
            className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-5"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              className="flex items-center gap-2 mb-2"
              style={{ color: "#f59e0b" }}
            >
              <AlertTriangle size={20} />
              <h2
                className="text-lg font-black"
                style={{ color: "var(--text)" }}
              >
                Edit this finalized load?
              </h2>
            </div>
            <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
              This unlocks the load so entries can be added, edited, or deleted
              again.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setUnlockConfirmOpen(false)}
                className="flex-1 rounded-xl py-3 font-bold"
                style={{ background: "var(--surface-2)", color: "var(--text)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => void handleUnlock()}
                className="flex-1 rounded-xl py-3 font-black"
                style={{
                  background: "var(--accent)",
                  color: "var(--accent-fg)",
                }}
              >
                Unlock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function fmtEntryTime(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl py-3.5 px-2 text-center"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <p
        className="text-[9px] uppercase tracking-wider font-black mb-1"
        style={{ color: "var(--text-faint)" }}
      >
        {label}
      </p>
      <p
        className="text-base font-black"
        style={{ color: "var(--text)" }}
      >
        {value}
      </p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl py-2.5 text-center"
      style={{ background: "var(--surface-2)" }}
    >
      <p
        className="text-[9px] uppercase tracking-wider font-black"
        style={{ color: "var(--text-faint)" }}
      >
        {label}
      </p>
      <p
        className="text-base font-black mt-0.5"
        style={{ color: "var(--text)" }}
      >
        {value}
      </p>
    </div>
  );
}
