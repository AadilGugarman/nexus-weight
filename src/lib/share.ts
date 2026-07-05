import { toPng } from "html-to-image";
import { currentThemeColors } from "./theme";
import { shareBinaryFile, saveBinaryFile } from "./nativeShare";
import { isNative as isNativePlatform } from "./platform";
import {
  getCompanyProfile,
  getBusinessLabels,
  getCatalogLinkData,
} from "./settings";
import {
  computeLoadStats,
  computeLabelGroups,
  computeNestedGroups,
  flattenNestedGroups,
  type BreakdownLine,
} from "./loadStats";
import { resolveLinkedChain } from "./catalogLinks";
import type { Load, Entry, Party, CatalogFieldNumber } from "../types";

/* ---------- palette (hex only — html-to-image cannot parse oklch) ---------- */
const INK = "#0f172a";
const SUB = "#64748b";
const FAINT = "#94a3b8";
const PAPER = "#ffffff";
const CREAM = "#fafaf9";
const SOFT = "#f4f4f5";
const LINE = "#e7e5e4";

// Theme-driven accent colors (follow the user's selected theme). Read at call time.
function accents() {
  const c = currentThemeColors();
  return { GREEN: c.deep, LIME: c.accent };
}

export interface ShareCtx {
  load: Load;
  entries: Entry[];
  party?: Party;
}

// inline weight/scale icon (white), used inside the receipt logo badge
const WEIGHT_ICON = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1.5"/><path d="M4 8h16"/><path d="M4 8l-2.5 6a4 4 0 0 0 5 0z"/><path d="M20 8l-2.5 6a4 4 0 0 0 5 0z"/><path d="M8 21h8"/><path d="M12 8v13"/></svg>`;

function fmtDate(d?: string) {
  return new Date(d || Date.now()).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function fmtTime(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
/** Business-configured custom fields present on this load, paired with their labels. A blank label hides its field everywhere, including exports. */
function customFieldLines(load: Load): Array<{ label: string; value: string }> {
  const { customLabel2, customLabel3 } = getBusinessLabels();
  return [
    { label: customLabel2, value: load.custom_field_2 || "" },
    { label: customLabel3, value: load.custom_field_3 || "" },
  ].filter((f) => f.label && f.value);
}

/** The proven Label1->Label2(->Label3) chain — derived fresh from whichever
 * catalog values are actually Linked, not from any stored setting. Empty
 * when nothing has been linked yet (full independent-flat fallback). */
function linkedChain(
  labels: Array<string | null | undefined>,
): CatalogFieldNumber[] {
  const { catalogValues, catalogValueLinks } = getCatalogLinkData();
  return resolveLinkedChain(catalogValues, catalogValueLinks, labels);
}

/** Grouped weight breakdowns (one per label that actually mixes >1 value
 * across this load's entries via Group Entry Mode) — computed from real
 * entry-level data. Empty for the common single-classification load, which
 * keeps every export's layout unchanged from before this feature existed.
 * Fields that are part of the proven Linked Values chain are reported by
 * nestedBreakdownLines() below instead of here. */
function labelBreakdowns(
  load: Load,
  entries: Entry[],
): Array<{ label: string; groups: ReturnType<typeof computeLabelGroups> }> {
  const { customLabel1, customLabel2, customLabel3 } = getBusinessLabels();
  const labels = [customLabel1, customLabel2, customLabel3];
  const chain = linkedChain(labels);
  const fieldNumbers = ([1, 2, 3] as CatalogFieldNumber[]).filter(
    (n) => !chain.includes(n),
  );
  return fieldNumbers
    .map((n) => ({
      label: labels[n - 1] || "",
      groups: computeLabelGroups(load, entries, n),
    }))
    .filter((g) => g.label && g.groups.length > 1);
}

/** Nested Label1->Label2(->Label3) breakdown lines for whichever fields have
 * actually been Linked (see flattenNestedGroups) — empty until a business
 * links at least one pair of values. */
function nestedBreakdownLines(load: Load, entries: Entry[]): BreakdownLine[] {
  const { customLabel1, customLabel2, customLabel3 } = getBusinessLabels();
  const labels = [customLabel1, customLabel2, customLabel3];
  const chain = linkedChain(labels);
  if (chain.length < 2) return [];
  const groups = computeNestedGroups(load, entries, chain);
  const worthShowing =
    groups.length > 0 &&
    (groups.length > 1 || groups.some((g) => g.children.length > 1));
  return worthShowing ? flattenNestedGroups(groups, labels) : [];
}

/* ============================ RECEIPT IMAGE ============================ */
function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ]!,
  );
}

function buildReceiptNode(c: ShareCtx): HTMLDivElement {
  const { load, entries, party } = c;
  const {
    entryCount,
    gross,
    tare,
    net,
    firstEntryAt,
    lastEntryAt,
    lowestWeight,
    highestWeight,
  } = computeLoadStats(load, entries);
  const { customLabel1, customLabel2 } = getBusinessLabels();
  const { GREEN, LIME } = accents();
  const company = getCompanyProfile();

  const root = document.createElement("div");
  Object.assign(root.style, {
    width: "680px",
    background: CREAM,
    fontFamily: '-apple-system, "Segoe UI", Roboto, Arial, sans-serif',
    color: INK,
    boxSizing: "border-box",
    position: "absolute",
    top: "0",
    left: "0",
    visibility: "hidden",
    zIndex: "-9999",
  } as CSSStyleDeclaration);

  // Calculate day name and duration
  const createdAt = load.created_at ? new Date(load.created_at) : new Date();
  const dayName = createdAt.toLocaleDateString("en-IN", { weekday: "long" });

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

  const duration = calculateDuration();

  // Group entries by label 2 (variety)
  const label2Groups: Array<{
    label: string;
    entries: Array<{ entry: Entry; index: number }>;
    totalWeight: number;
  }> = [];
  if (customLabel2) {
    entries.forEach((e, i) => {
      const label = e.custom_field_2 || load.custom_field_2 || "Others";
      let section = label2Groups.find((s) => s.label === label);
      if (!section) {
        section = { label, entries: [], totalWeight: 0 };
        label2Groups.push(section);
      }
      section.entries.push({ entry: e, index: i });
      section.totalWeight += Number(e.weight);
    });
  }

  // Get label1 and label2 values for header
  const label1Value = load.custom_field_1 || "";
  const label2Value =
    load.custom_field_2 ||
    (label2Groups.length > 0 ? label2Groups[0].label : "");

  // Summary card helper (small, one row)
  const summaryCardSmall = (label: string, value: string) => `
    <div style="background:${PAPER};border-radius:10px;padding:10px 14px;text-align:center;flex:1;">
      <div style="font-size:10px;color:${FAINT};text-transform:uppercase;letter-spacing:1px;font-weight:800;margin-bottom:2px;">${label}</div>
      <div style="font-size:16px;font-weight:900;color:${INK};line-height:1.1;">${value}</div>
    </div>
  `;

  // Summary card helper (dominant net weight)
  const summaryCardDominant = (label: string, value: string) => `
    <div style="background:linear-gradient(135deg,${GREEN},${LIME});border-radius:12px;padding:14px 20px;text-align:center;">
      <div style="font-size:11px;color:rgba(255,255,255,0.9);text-transform:uppercase;letter-spacing:1px;font-weight:800;margin-bottom:4px;">${label}</div>
      <div style="font-size:24px;font-weight:900;color:#fff;line-height:1.1;">${value}</div>
    </div>
  `;

  // Weight card helper
  const weightCard = (index: number, weight: string) => `
    <div style="background:${PAPER};border:1px solid ${LINE};border-radius:10px;padding:10px 8px;text-align:center;">
      <div style="font-size:9px;font-weight:800;color:${FAINT};margin-bottom:4px;">#${index + 1}</div>
      <div style="font-size:17px;font-weight:900;color:${INK};font-variant-numeric:tabular-nums;letter-spacing:-0.3px;">${weight}</div>
    </div>
  `;

  // Generate weight sections HTML
  const weightSections =
    customLabel2 && label2Groups.length > 0
      ? label2Groups
          .map(
            (section) => `
        <div style="margin-bottom:24px;">
          <div style="background:${PAPER};padding:14px 18px;border-radius:12px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;min-height:52px;border:2px solid ${LINE};box-shadow:0 2px 4px rgba(0,0,0,0.05);">
            <span style="font-size:18px;font-weight:900;color:${GREEN};">${esc(section.label)}</span>
            <span style="font-size:12px;font-weight:800;color:${SUB};background:${SOFT};padding:4px 10px;border-radius:16px;">${section.entries.length} ${section.entries.length === 1 ? "entry" : "entries"}</span>
            <span style="font-size:20px;font-weight:900;color:${GREEN};">${section.totalWeight.toFixed(2)} kg</span>
          </div>
          <div style="padding:0 40px;display:grid;grid-template-columns:repeat(5,1fr);gap:10px;">
            ${section.entries.map(({ entry: e, index }) => weightCard(index, Number(e.weight).toFixed(2))).join("")}
          </div>
        </div>`,
          )
          .join("")
      : `<div style="padding:0 40px;display:grid;grid-template-columns:repeat(5,1fr);gap:10px;">
        ${entries.map((e, i) => weightCard(i, Number(e.weight).toFixed(2))).join("")}
      </div>`;

  root.innerHTML = `
    <!-- Main Header -->
    <div style="background:${INK};padding:24px 30px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:24px;">
        <!-- Center Section -->
        <div style="flex:1;">
          ${company.companyName ? `<div style="font-size:26px;font-weight:900;color:#fff;margin-bottom:6px;line-height:1.1;">${esc(company.companyName)}</div>` : ""}
          ${party ? `<div style="font-size:18px;font-weight:700;color:#cbd5e1;margin-bottom:8px;">${esc(party.name)}</div>` : ""}
          <div style="display:inline-block;background:${GREEN};color:#fff;padding:6px 14px;border-radius:20px;font-size:14px;font-weight:800;">${esc(load.label)}</div>
          ${
            label1Value
              ? `
            <div style="margin-top:8px;display:flex;align-items:center;gap:6px;">
              <div style="display:inline-block;background:rgba(255,255,255,0.1);color:#fff;padding:6px 12px;border-radius:16px;font-size:13px;font-weight:700;">${esc(label1Value)}</div>
              ${
                label2Value
                  ? `
                <span style="color:#cbd5e1;font-size:16px;">→</span>
                <div style="display:inline-block;background:rgba(255,255,255,0.15);color:#fff;padding:6px 12px;border-radius:16px;font-size:13px;font-weight:700;">${esc(label2Value)}</div>
              `
                  : ""
              }
            </div>
          `
              : ""
          }
        </div>
        <!-- Right Section -->
        <div style="text-align:right;flex-shrink:0;">
          <div style="display:flex;align-items:center;gap:10px;justify-content:flex-end;margin-bottom:4px;">
            <div style="font-size:16px;font-weight:900;color:#fff;">${fmtDate(load.created_at)}</div>
            <div style="font-size:13px;color:#cbd5e1;font-weight:600;">${dayName}</div>
          </div>
          ${
            firstEntryAt
              ? `
            <div style="font-size:13px;color:#cbd5e1;font-weight:600;">
              ${fmtTime(firstEntryAt)} - ${fmtTime(lastEntryAt)} · ${duration}
            </div>
          `
              : ""
          }
        </div>
      </div>
    </div>

    <!-- Summary Blocks -->
    <div style="padding:20px 30px;">
      <!-- First row: all small metrics -->
      <div style="display:flex;gap:10px;margin-bottom:12px;">
        ${summaryCardSmall("Total Entries", String(entryCount))}
        ${summaryCardSmall("Lowest", `${lowestWeight.toFixed(2)} kg`)}
        ${summaryCardSmall("Highest", `${highestWeight.toFixed(2)} kg`)}
      </div>
      <!-- Second row: dominant net weight -->
      <div style="margin-top:4px;">
        ${summaryCardDominant("Net Weight", `${net.toFixed(2)} kg`)}
      </div>
    </div>

    <div style="height:1px;background:${LINE};margin:0 30px 20px;"></div>

    <!-- Custom Business Fields -->
    ${
      customFieldLines(load).length
        ? `
    <div style="padding:0 30px 20px;">
      <div style="display:grid;grid-template-columns:repeat(${customFieldLines(load).length},1fr);gap:12px;">
        ${customFieldLines(load)
          .map(
            (f) => `
          <div style="background:${SOFT};border-radius:10px;padding:10px 14px;text-align:center;">
            <div style="font-size:10px;color:${FAINT};text-transform:uppercase;letter-spacing:1px;font-weight:800;margin-bottom:2px;">${f.label}</div>
            <div style="font-size:14px;font-weight:900;color:${GREEN};">${esc(f.value)}</div>
          </div>
        `,
          )
          .join("")}
      </div>
    </div>
    `
        : ""
    }

    <!-- Weight Entries Header -->
    <div style="padding:0 40px 12px;font-size:12px;color:${SUB};font-weight:800;text-transform:uppercase;letter-spacing:1.5px;">Weight Entries (${entryCount})</div>

    <!-- Weight Sections -->
    ${weightSections}

    <div style="height:1px;background:${LINE};margin:24px 30px 20px;"></div>

    <!-- Weight Calculation -->
    <div style="padding:0 30px 24px;">
      <div style="font-size:12px;color:${SUB};font-weight:800;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:14px;">Weight Calculation</div>
      <div style="display:flex;align-items:center;justify-center;gap:12px;">
        <div style="background:${SOFT};border-radius:12px;padding:14px 20px;text-align:center;flex:1;">
          <div style="font-size:11px;color:${SUB};text-transform:uppercase;letter-spacing:1px;font-weight:800;">Gross</div>
          <div style="font-size:22px;font-weight:900;color:${INK};margin-top:4px;">${gross.toFixed(2)}</div>
          <div style="font-size:12px;color:${FAINT};margin-top:2px;">kg</div>
        </div>
        <div style="font-size:28px;font-weight:900;color:${SUB};">−</div>
        <div style="background:${SOFT};border-radius:12px;padding:14px 20px;text-align:center;flex:1;">
          <div style="font-size:11px;color:${SUB};text-transform:uppercase;letter-spacing:1px;font-weight:800;">Tare</div>
          <div style="font-size:22px;font-weight:900;color:${INK};margin-top:4px;">${tare.toFixed(2)}</div>
          <div style="font-size:12px;color:${FAINT};margin-top:2px;">kg</div>
        </div>
        <div style="font-size:28px;font-weight:900;color:${GREEN};">=</div>
        <div style="background:linear-gradient(135deg,${GREEN},${LIME});border-radius:12px;padding:14px 20px;text-align:center;flex:1;">
          <div style="font-size:11px;color:rgba(255,255,255,0.9);text-transform:uppercase;letter-spacing:1px;font-weight:800;">Net</div>
          <div style="font-size:22px;font-weight:900;color:#fff;margin-top:4px;">${net.toFixed(2)}</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.85);margin-top:2px;">kg</div>
        </div>
      </div>
    </div>

    <!-- Footer - Nexus Weight branding -->
    <div style="padding:20px 30px 24px;text-align:center;border-top:2px solid ${LINE};">
      <div style="font-size:13px;color:${INK};font-weight:900;margin-bottom:2px;">Generated by Nexus Weight</div>
      <div style="font-size:10px;color:${FAINT};letter-spacing:0.5px;">Digital Weight Register · ${new Date().toLocaleString("en-IN")}</div>
    </div>
  `;
  return root;
}

async function renderReceiptPng(c: ShareCtx): Promise<string> {
  const node = buildReceiptNode(c);
  document.body.appendChild(node);
  try {
    // Wait for fonts to load
    await document.fonts.ready.catch(() => {});

    // Wait for multiple animation frames to ensure rendering is complete
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Force style recalculation by reading layout properties
            node.offsetHeight;
            node.scrollHeight;
            // Add a small delay to ensure everything is painted
            setTimeout(() => resolve(null), 100);
          });
        });
      });
    });

    const width = node.scrollWidth || 680;
    const height = node.scrollHeight;

    // Make node visible temporarily for capture
    node.style.visibility = "visible";
    node.style.position = "fixed";
    node.style.left = "0";
    node.style.top = "0";

    const dataUrl = await toPng(node, {
      pixelRatio: 2.5,
      backgroundColor: CREAM,
      cacheBust: true,
      width,
      height,
      // Force inclusion of styles
      skipAutoScale: false,
      includeQueryParams: true,
    });

    return dataUrl;
  } catch (error) {
    console.error("PNG rendering failed:", error);
    throw error;
  } finally {
    document.body.removeChild(node);
  }
}

/** Opens the native share sheet with the receipt image. The user picks ANY
 * recipient/group manually — the load's party is never pre-selected. */
export async function shareWhatsAppImage(c: ShareCtx) {
  try {
    const dataUrl = await renderReceiptPng(c);
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const filename = `nexus-${c.load.label.replace(/\s+/g, "-")}.png`;
    // Native → writes to cache + system share sheet. Web → Web Share / download.
    await shareBinaryFile({
      filename,
      blob,
      mimeType: "image/png",
      title: "Nexus Weight Receipt",
    });
  } catch (error) {
    console.error("WhatsApp image share failed:", error);
    throw new Error("Failed to generate or share image. Please try again.");
  }
}

/** Download the receipt image to device storage. */
export async function downloadImage(c: ShareCtx) {
  const dataUrl = await renderReceiptPng(c);
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const filename = `nexus-${c.load.label.replace(/\s+/g, "-")}.png`;
  if (isNativePlatform()) {
    await shareBinaryFile({
      filename,
      blob,
      mimeType: "image/png",
      title: "Nexus Weight Receipt",
    });
    return;
  }
  triggerDownload(blob, filename);
}

/** Native system print (WiFi / Bluetooth / any installed printer).
 * In the Android WebView there is no window.print(), so we hand the PDF to
 * the OS share/print sheet instead. */
export async function printReceipt(c: ShareCtx) {
  if (isNativePlatform()) {
    await exportPDF(c);
    return;
  }
  const node = buildReceiptNode(c);
  const html = node.innerHTML;
  const win = window.open("", "_blank", "width=720,height=900");
  if (!win) throw new Error("Popup blocked — allow popups to print");
  win.document.open();
  win.document
    .write(`<!doctype html><html><head><meta charset="utf-8"><title>Nexus Weight</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      body{background:${CREAM};font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:${INK};}
      .sheet{width:680px;max-width:100%;margin:0 auto;background:${CREAM};}
      @media print{
        @page{size:A4;margin:10mm;}
        body{background:#fff;}
        .sheet{width:100%;background:#fff;}
        /* keep each receipt section intact across page breaks (browsers
           ignore this when a section is taller than one page, so nothing
           can be clipped or lost) */
        .sheet > div{break-inside:avoid;page-break-inside:avoid;}
      }
    </style></head><body><div class="sheet">${html}</div>
    <script>window.onload=function(){setTimeout(function(){window.print();},250);};window.onafterprint=function(){window.close();};</script>
    </body></html>`);
  win.document.close();
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ============================ PROFESSIONAL PDF ============================ */
async function buildPdfBlob(
  c: ShareCtx,
): Promise<{ blob: Blob; filename: string }> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const { load, entries, party } = c;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const W = 595,
    H = 842,
    M = 40;
  const tc = currentThemeColors();
  const green = rgb(tc.deepRgb[0], tc.deepRgb[1], tc.deepRgb[2]);
  const lime = rgb(tc.accentRgb[0], tc.accentRgb[1], tc.accentRgb[2]);
  const ink = rgb(0.059, 0.09, 0.165);
  const sub = rgb(0.39, 0.45, 0.55);
  const faint = rgb(0.58, 0.64, 0.72);
  const soft = rgb(0.957, 0.957, 0.961);
  const line = rgb(0.906, 0.898, 0.882);
  const white = rgb(1, 1, 1);

  let page = pdf.addPage([W, H]);
  const { entryCount, gross, tare, net, firstEntryAt, lastEntryAt } =
    computeLoadStats(load, entries);
  const { customLabel1, customLabel2, customLabel3 } = getBusinessLabels();
  const company = getCompanyProfile();
  const classification =
    [load.custom_field_1, load.custom_field_2, load.custom_field_3]
      .filter(Boolean)
      .join(" · ") || "—";
  const breakdowns = labelBreakdowns(load, entries);
  const nestedLines = nestedBreakdownLines(load, entries);

  const rightText = (
    t: string,
    x: number,
    y: number,
    size: number,
    f = font,
    color = ink,
  ) =>
    page.drawText(t, {
      x: x - f.widthOfTextAtSize(t, size),
      y,
      size,
      font: f,
      color,
    });

  /* header */
  page.drawRectangle({ x: 0, y: H - 100, width: W, height: 100, color: ink });
  page.drawRectangle({ x: M, y: H - 76, width: 40, height: 40, color: green });
  // weight-scale glyph
  const cx = M + 20;
  page.drawCircle({ x: cx, y: H - 46, size: 2, color: white }); // top knob
  page.drawLine({
    start: { x: cx, y: H - 48 },
    end: { x: cx, y: H - 66 },
    thickness: 2,
    color: white,
  }); // stand
  page.drawLine({
    start: { x: M + 8, y: H - 52 },
    end: { x: M + 32, y: H - 52 },
    thickness: 2,
    color: white,
  }); // beam
  page.drawLine({
    start: { x: M + 12, y: H - 66 },
    end: { x: M + 28, y: H - 66 },
    thickness: 2,
    color: white,
  }); // base
  // pans
  page.drawLine({
    start: { x: M + 8, y: H - 52 },
    end: { x: M + 5, y: H - 60 },
    thickness: 1.2,
    color: white,
  });
  page.drawLine({
    start: { x: M + 8, y: H - 52 },
    end: { x: M + 11, y: H - 60 },
    thickness: 1.2,
    color: white,
  });
  page.drawLine({
    start: { x: M + 32, y: H - 52 },
    end: { x: M + 29, y: H - 60 },
    thickness: 1.2,
    color: white,
  });
  page.drawLine({
    start: { x: M + 32, y: H - 52 },
    end: { x: M + 35, y: H - 60 },
    thickness: 1.2,
    color: white,
  });
  if (company.companyName) {
    // Company name is the primary title; app name becomes the subtitle line.
    page.drawText(company.companyName.slice(0, 30), {
      x: M + 52,
      y: H - 52,
      size: 18,
      font: bold,
      color: rgb(1, 1, 1),
    });
    const csub = ["NEXUS WEIGHT", company.companyPhone, company.companyAddress]
      .filter(Boolean)
      .join("  ·  ");
    page.drawText(csub.slice(0, 64), {
      x: M + 52,
      y: H - 70,
      size: 8,
      font,
      color: faint,
    });
  } else {
    page.drawText("NEXUS WEIGHT", {
      x: M + 52,
      y: H - 56,
      size: 22,
      font: bold,
      color: rgb(1, 1, 1),
    });
    page.drawText("DIGITAL WEIGHT REGISTER", {
      x: M + 52,
      y: H - 74,
      size: 8,
      font,
      color: faint,
    });
  }
  page.drawText("DATE", {
    x: W - M - font.widthOfTextAtSize("DATE", 8),
    y: H - 52,
    size: 8,
    font: bold,
    color: faint,
  });
  rightText(fmtDate(load.created_at), W - M, H - 70, 13, bold, rgb(1, 1, 1));

  /* classification ribbon */
  page.drawRectangle({ x: 0, y: H - 134, width: W, height: 34, color: green });
  page.drawText(classification.toUpperCase(), {
    x: M,
    y: H - 122,
    size: 15,
    font: bold,
    color: rgb(1, 1, 1),
  });
  rightText(load.label, W - M, H - 122, 12, bold, rgb(0.85, 0.95, 0.75));

  /* meta card */
  let y = H - 134 - 22;
  const cardH = 56;
  page.drawRectangle({
    x: M,
    y: y - cardH,
    width: W - 2 * M,
    height: cardH,
    color: soft,
    borderColor: line,
    borderWidth: 1,
  });
  const third = (W - 2 * M) / 3;
  const metaItems: Array<[string, string]> = [
    ["PARTY", party?.name || "—"],
    ["VEHICLE NUMBER", load.label || "—"],
    ["TOTAL ENTRIES", String(entryCount)],
  ];
  metaItems.forEach(([l, v], i) => {
    const cx = M + 16 + i * third;
    page.drawText(l, { x: cx, y: y - 20, size: 8, font: bold, color: faint });
    page.drawText(v.length > 22 ? v.slice(0, 20) + "…" : v, {
      x: cx,
      y: y - 38,
      size: 14,
      font: bold,
      color: ink,
    });
  });
  y -= cardH + 26;

  /* first / last entry time */
  if (firstEntryAt) {
    const timeCardH = 44;
    page.drawRectangle({
      x: M,
      y: y - timeCardH,
      width: W - 2 * M,
      height: timeCardH,
      color: soft,
      borderColor: line,
      borderWidth: 1,
    });
    const half = (W - 2 * M) / 2;
    const timeItems: Array<[string, string]> = [
      ["FIRST ENTRY TIME", fmtTime(firstEntryAt)],
      ["LAST ENTRY TIME", fmtTime(lastEntryAt)],
    ];
    timeItems.forEach(([l, v], i) => {
      const cx = M + 16 + i * half;
      page.drawText(l, { x: cx, y: y - 17, size: 8, font: bold, color: faint });
      page.drawText(v, { x: cx, y: y - 33, size: 12, font: bold, color: ink });
    });
    y -= timeCardH + 26;
  }

  /* custom business fields (configured per business in Manage > Business Configuration) */
  const customFields = customFieldLines(load);
  if (customFields.length) {
    page.drawRectangle({
      x: M,
      y: y - cardH,
      width: W - 2 * M,
      height: cardH,
      color: soft,
      borderColor: line,
      borderWidth: 1,
    });
    customFields.forEach((f, i) => {
      const cx = M + 16 + i * third;
      page.drawText(f.label.toUpperCase(), {
        x: cx,
        y: y - 20,
        size: 8,
        font: bold,
        color: faint,
      });
      const v = f.value.length > 22 ? f.value.slice(0, 20) + "…" : f.value;
      page.drawText(v, {
        x: cx,
        y: y - 38,
        size: 14,
        font: bold,
        color: green,
      });
    });
    y -= cardH + 26;
  }

  /* weight table — adaptive column count keeps page count down: short loads
   * read as one clean column, long loads pack 2–3 columns across the width. */
  const numCols = entries.length <= 15 ? 1 : entries.length <= 40 ? 2 : 3;
  const tableX = M,
    tableW = W - 2 * M,
    colW = tableW / numCols,
    rowH = 17;
  const header = (topY: number) => {
    page.drawText("WEIGHT ENTRIES", {
      x: tableX,
      y: topY,
      size: 10,
      font: bold,
      color: sub,
    });
    rightText("KG", W - M, topY, 10, bold, sub);
    const ly = topY - 7;
    page.drawLine({
      start: { x: tableX, y: ly },
      end: { x: tableX + tableW, y: ly },
      thickness: 1.5,
      color: green,
    });
    return ly - 17;
  };
  const drawRow = (e: Entry, i: number, x: number, ry: number, r: number) => {
    // Entry No + Weight only — no per-entry timestamp (see First/Last Entry
    // Time in the meta card above instead).
    if (r % 2 === 1)
      page.drawRectangle({
        x,
        y: ry - 5,
        width: colW - 10,
        height: rowH,
        color: soft,
      });
    page.drawText(String(i + 1), {
      x: x + 8,
      y: ry,
      size: 9,
      font,
      color: faint,
    });
    const kg = Number(e.weight).toFixed(2);
    page.drawText(kg, {
      x: x + colW - 22 - bold.widthOfTextAtSize(kg, 11),
      y: ry,
      size: 11,
      font: bold,
      color: ink,
    });
  };

  let idx = 0;
  let startY = header(y);
  const fill = (bottom: number) => {
    const perCol = Math.max(1, Math.floor((startY - bottom) / rowH));
    let col = 0,
      r = 0;
    while (idx < entries.length && col < numCols) {
      drawRow(entries[idx], idx, tableX + col * colW, startY - r * rowH, r);
      idx++;
      r++;
      if (r >= perCol) {
        r = 0;
        col++;
      }
    }
  };
  fill(190);
  while (idx < entries.length) {
    page = pdf.addPage([W, H]);
    startY = header(H - M);
    const remaining = entries.length - idx;
    const fits = remaining <= Math.floor((startY - 190) / rowH) * numCols;
    fill(fits ? 190 : 60);
  }

  /* summary blocks */
  const sy = 150;
  const bw = (W - 2 * M - 20) / 3;
  const mini = (x: number, label: string, val: string) => {
    page.drawRectangle({
      x,
      y: sy,
      width: bw,
      height: 42,
      color: soft,
      borderColor: line,
      borderWidth: 1,
    });
    page.drawText(label, {
      x: x + 10,
      y: sy + 27,
      size: 8,
      font: bold,
      color: sub,
    });
    page.drawText(val, {
      x: x + 10,
      y: sy + 9,
      size: 15,
      font: bold,
      color: ink,
    });
  };
  mini(M, "GROSS WEIGHT", `${gross.toFixed(2)} kg`);
  mini(M + bw + 10, "TARE WEIGHT", `${tare.toFixed(2)} kg`);
  mini(M + 2 * (bw + 10), "NET WEIGHT", `${net.toFixed(2)} kg`);

  /* total bar */
  page.drawRectangle({ x: M, y: 84, width: W - 2 * M, height: 52, color: ink });
  page.drawText("NET WEIGHT", {
    x: M + 18,
    y: 116,
    size: 9,
    font: bold,
    color: faint,
  });
  page.drawText(`${entryCount} entries`, {
    x: M + 18,
    y: 98,
    size: 11,
    font,
    color: rgb(0.75, 0.78, 0.82),
  });
  const tw = `${net.toFixed(2)} kg`;
  rightText(tw, W - M - 18, 100, 26, bold, lime);

  /* label-wise breakdown — one section per label that mixes >1 value
   * (Group Entry Mode), plus the nested Label1->Label2(->Label3) tree under
   * Flexible Hierarchical Catalogs. Absent entirely for the common
   * single-value load, so ordinary receipts print exactly as before this
   * feature existed. */
  if (nestedLines.length || breakdowns.length) {
    page = pdf.addPage([W, H]);
    let by = H - M;
    page.drawText("LOAD SUMMARY BREAKDOWN", {
      x: M,
      y: by,
      size: 14,
      font: bold,
      color: ink,
    });
    by -= 30;
    for (const l of nestedLines) {
      if (by < 60) {
        page = pdf.addPage([W, H]);
        by = H - M;
      }
      const x = M + l.depth * 16;
      if (l.weight == null) {
        page.drawText(l.text, { x, y: by, size: 12, font: bold, color: ink });
        by -= 24;
      } else {
        page.drawRectangle({
          x,
          y: by - 6,
          width: W - M - x,
          height: 24,
          color: soft,
        });
        page.drawText(l.text, {
          x: x + 12,
          y: by,
          size: 11,
          font: bold,
          color: ink,
        });
        rightText(`${l.weight.toFixed(2)} kg`, W - M - 12, by, 12, bold, green);
        by -= 30;
      }
    }
    if (nestedLines.length) by -= 10;
    for (const { label, groups } of breakdowns) {
      if (by < 100) {
        page = pdf.addPage([W, H]);
        by = H - M;
      }
      page.drawText(`${label.toUpperCase()} WISE`, {
        x: M,
        y: by,
        size: 10,
        font: bold,
        color: sub,
      });
      by -= 6;
      page.drawLine({
        start: { x: M, y: by },
        end: { x: W - M, y: by },
        thickness: 1,
        color: line,
      });
      by -= 20;
      for (const g of groups) {
        if (by < 60) {
          page = pdf.addPage([W, H]);
          by = H - M;
        }
        page.drawRectangle({
          x: M,
          y: by - 6,
          width: W - 2 * M,
          height: 24,
          color: soft,
        });
        page.drawText(g.value, {
          x: M + 12,
          y: by,
          size: 11,
          font: bold,
          color: ink,
        });
        rightText(`${g.weight.toFixed(2)} kg`, W - M - 12, by, 12, bold, green);
        by -= 30;
      }
      by -= 16;
    }
  }

  page.drawText(
    `Generated by Nexus Weight · ${new Date().toLocaleString("en-IN")}`,
    { x: M, y: 56, size: 8, font, color: faint },
  );

  const bytes = await pdf.save();
  const blob = new Blob([bytes.slice().buffer], { type: "application/pdf" });
  const filename = `nexus-${load.label.replace(/\s+/g, "-")}.pdf`;
  return { blob, filename };
}

/** Share the PDF via the native share sheet (WhatsApp, email, etc. — kept as
 * the original export for backward compatibility with existing callers). */
export async function exportPDF(c: ShareCtx) {
  const { blob, filename } = await buildPdfBlob(c);
  // Native → save + share sheet (open in / share the PDF). Web → download.
  await shareBinaryFile({
    filename,
    blob,
    mimeType: "application/pdf",
    title: "Nexus Weight — PDF",
  });
}

/** Save the PDF straight to device storage (Documents on native, browser
 * download on web) — no share sheet, distinct from exportPDF. */
export async function downloadPDF(c: ShareCtx) {
  const { blob, filename } = await buildPdfBlob(c);
  await saveBinaryFile({ filename, blob });
}
