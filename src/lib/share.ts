import { currentThemeColors } from "./theme";
import {
  canShareFile,
  shareBinaryFile,
  saveBinaryFile,
} from "./nativeShare";
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

/** Generate filename from party name, location, date, and vehicle.
 * Format: PartyName_Location_Date_VehicleNumber_Timestamp (omit location/vehicle if not present)
 * Example: JAYESH_MUMBAI_05Jan2026_MH12AB1234_143025 */
function generateFilename(ctx: ShareCtx, extension: string): string {
  const { load, party } = ctx;
  const parts: string[] = [];
  
  // Party name (required)
  if (party?.name) {
    parts.push(party.name.replace(/[^a-zA-Z0-9]/g, ""));
  }
  
  // Location (if party has place)
  if (party?.place) {
    parts.push(party.place.replace(/[^a-zA-Z0-9]/g, ""));
  }
  
  // Date in DDMmmYYYY format (no hyphens)
  const date = new Date(load.created_at || Date.now());
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleDateString("en-IN", { month: "short" });
  const year = date.getFullYear();
  const dateStr = `${day}${month}${year}`;
  parts.push(dateStr);
  
  // Vehicle number (skip if NO-VEHICLE)
  if (load.label && load.label !== "NO-VEHICLE") {
    parts.push(load.label.replace(/\s+/g, ""));
  }
  
  // Add timestamp (HHMMSS) to ensure uniqueness
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  parts.push(time);
  
  // Fallback to nexus-LoadLabel if no party
  if (parts.length === 1 || !party?.name) { // only timestamp added, no party
    return `nexus-${load.label.replace(/\s+/g, "-")}-${time}${extension}`;
  }
  
  return `${parts.join("_")}${extension}`;
}

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
  const { customLabel2 } = getBusinessLabels();
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
  const label2ValuesCommaSeparated =
    label2Groups.length > 0
      ? label2Groups.map((g) => g.label).join(", ")
      : load.custom_field_2 || "";
  const label2Value =
    load.custom_field_2 ||
    (label2Groups.length > 0 ? label2Groups[0].label : "");

  // Get Total Vakkal/Label2 value
  const totalVakkalValue = customLabel2
    ? String(label2Groups.length)
    : load.container_count != null && Number(load.container_count) > 0
      ? String(Number(load.container_count))
      : "-";
  const totalVakkalLabel = customLabel2
    ? `Total ${customLabel2}`
    : "Total Vakkla";

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
            <span style="font-size:18px;font-weight:900;color:${GREEN};">${label1Value ? `${esc(label1Value)} → ${esc(section.label)}` : esc(section.label)}</span>
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:12px;font-weight:800;color:${SUB};background:${SOFT};padding:4px 10px;border-radius:16px;">${section.entries.length} ${section.entries.length === 1 ? "entry" : "entries"}</span>
              <span style="font-size:20px;font-weight:900;color:${GREEN};">${section.totalWeight.toFixed(2)} kg</span>
            </div>
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
          <div style="display:inline-block;background:${GREEN};color:#fff;padding:6px 14px;border-radius:0;font-size:14px;font-weight:800;">${esc(load.label)}</div>
          ${
            label1Value
              ? `
            <div style="margin-top:8px;display:flex;align-items:center;gap:6px;">
              <div style="display:inline-block;background:rgba(255,255,255,0.1);color:#fff;padding:6px 12px;border-radius:0;font-size:13px;font-weight:700;">${esc(label1Value)}</div>
              ${
                label2ValuesCommaSeparated
                  ? `
                <span style="color:#cbd5e1;font-size:16px;">→</span>
                <div style="display:inline-block;background:rgba(255,255,255,0.15);color:#fff;padding:6px 12px;border-radius:0;font-size:13px;font-weight:700;">${esc(label2ValuesCommaSeparated)}</div>
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
              ${fmtTime(firstEntryAt)} - ${fmtTime(lastEntryAt)}
            </div>
            <div style="font-size:12px;color:#cbd5e1;font-weight:600;margin-top:2px;">
              ${duration}
            </div>
          `
              : ""
          }
        </div>
      </div>
    </div>

    <!-- Summary Blocks -->
    <div style="padding:20px 30px;">
      <div style="display:flex;gap:10px;">
        ${summaryCardSmall(totalVakkalLabel, totalVakkalValue)}
        ${summaryCardSmall("Total Entries", String(entryCount))}
        ${summaryCardSmall("Lowest", `${lowestWeight.toFixed(2)} kg`)}
        ${summaryCardSmall("Highest", `${highestWeight.toFixed(2)} kg`)}
        <div style="flex:1.2;">
          ${summaryCardDominant("Net Weight", `${net.toFixed(2)} kg`)}
        </div>
      </div>
    </div>

    <div style="height:1px;background:${LINE};margin:0 30px 20px;"></div>



    <!-- Weight Entries Header -->
    <div style="padding:0 40px 12px;font-size:12px;color:${SUB};font-weight:800;text-transform:uppercase;letter-spacing:1.5px;">Weight Entries (${entryCount})</div>

    <!-- Weight Sections -->
    ${weightSections}

    <!-- Footer - Nexus Weight branding -->
    <div style="padding:20px 30px 24px;text-align:center;border-top:2px solid ${LINE};">
      <div style="font-size:13px;color:${INK};font-weight:900;margin-bottom:2px;">Generated by Nexus Weight</div>
      <div style="font-size:10px;color:${FAINT};letter-spacing:0.5px;">Digital Weight Register · ${new Date().toLocaleString("en-IN")}</div>
    </div>
  `;
  return root;
}

async function renderReceiptPng(c: ShareCtx): Promise<string> {
  // Lazy load html-to-image only when needed (reduces initial bundle)
  const { toPng } = await import("html-to-image");
  
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
            void node.offsetHeight;
            void node.scrollHeight;
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
/* eslint-disable @typescript-eslint/no-unused-vars */
async function legacyShareWhatsAppImage(c: ShareCtx) {
  try {
    const dataUrl = await renderReceiptPng(c);
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const filename = generateFilename(c, ".png");
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
/* eslint-enable @typescript-eslint/no-unused-vars */

export async function shareWhatsAppImage(c: ShareCtx) {
  const filename = generateFilename(c, ".png");
  const whatsappWindow = !isNativePlatform()
    ? window.open("about:blank", "_blank", "width=520,height=720")
    : null;
  if (!isNativePlatform() && !whatsappWindow) {
    throw new Error("Popup blocked - allow popups to open WhatsApp share.");
  }
  if (whatsappWindow) {
    whatsappWindow.document.open();
    whatsappWindow.document.write(
      '<!doctype html><title>Nexus Weight</title><body style="font-family:Arial,sans-serif;padding:24px">Preparing WhatsApp share...</body>',
    );
    whatsappWindow.document.close();
  }

  try {
    const dataUrl = await renderReceiptPng(c);
    const res = await fetch(dataUrl);
    const blob = await res.blob();

    if (isNativePlatform()) {
      await shareBinaryFile({
        filename,
        blob,
        mimeType: "image/png",
        title: "Nexus Weight Receipt",
      });
      return;
    }

    if (!whatsappWindow) {
      throw new Error("Popup blocked - allow popups to open WhatsApp share.");
    }
    triggerDownload(blob, filename);
    const text = encodeURIComponent(
      "Nexus Weight receipt image is ready. Attach the downloaded PNG in WhatsApp if it is not attached automatically.",
    );
    whatsappWindow.location.href = `https://wa.me/?text=${text}`;
  } catch (error) {
    if (whatsappWindow && !whatsappWindow.closed) whatsappWindow.close();
    console.error("WhatsApp image share failed:", error);
    throw error instanceof Error
      ? error
      : new Error("Failed to generate or share image. Please try again.");
  }
}

async function shareFileWithWebFallback(opts: {
  filename: string;
  blob: Blob;
  mimeType: string;
  title: string;
  whatsappText: string;
  shareWindow: Window;
}) {
  const { filename, blob, mimeType, title, whatsappText, shareWindow } = opts;
  shareWindow.document.open();
  shareWindow.document.write(
    '<!doctype html><title>Nexus Weight</title><body style="font-family:Arial,sans-serif;padding:24px">Preparing share...</body>',
  );
  shareWindow.document.close();

  const fileUrl = URL.createObjectURL(blob);
  const file = new File([blob], filename, { type: mimeType });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (canShareFile(filename, mimeType) && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      shareWindow.close();
      setTimeout(() => URL.revokeObjectURL(fileUrl), 4000);
      return;
    } catch {
      // Browsers commonly reject this after async file generation; keep the
      // reserved popup alive and use the document-share fallback below.
    }
  }

  triggerDownload(blob, filename);
  const text = encodeURIComponent(whatsappText);
  shareWindow.document.open();
  shareWindow.document.write(`<!doctype html>
    <html><head><meta charset="utf-8"><title>Nexus Weight Share</title></head>
    <body style="font-family:Arial,sans-serif;padding:24px;line-height:1.45">
      <h3 style="margin:0 0 12px">Share file ready</h3>
      <p>The file has been downloaded. Attach it in WhatsApp or open it below.</p>
      <p><a href="https://wa.me/?text=${text}" style="font-weight:700">Open WhatsApp</a></p>
      <p><a href="${fileUrl}" target="_blank" rel="noreferrer">Open ${filename}</a></p>
    </body></html>`);
  shareWindow.document.close();
  shareWindow.location.href = `https://wa.me/?text=${text}`;
  setTimeout(() => URL.revokeObjectURL(fileUrl), 60000);
}

/** Download the receipt image to device storage. */
export async function downloadImage(c: ShareCtx) {
  const dataUrl = await renderReceiptPng(c);
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const filename = generateFilename(c, ".png");
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
/* eslint-disable @typescript-eslint/no-unused-vars */
async function legacyBuildPdfBlob(
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
  const filename = generateFilename(c, ".pdf");
  return { blob, filename };
}
/* eslint-enable @typescript-eslint/no-unused-vars */

async function buildPdfBlob(
  c: ShareCtx,
): Promise<{ blob: Blob; filename: string }> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const { load, entries, party } = c;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const W = 595;
  const H = 842;
  const M = 28;
  const contentW = W - 2 * M;
  const footerY = 24;
  const bottomReserve = 52;

  const tc = currentThemeColors();
  const green = rgb(tc.deepRgb[0], tc.deepRgb[1], tc.deepRgb[2]);
  const ink = rgb(0.059, 0.09, 0.165);
  const sub = rgb(0.39, 0.45, 0.55);
  const faint = rgb(0.58, 0.64, 0.72);
  const soft = rgb(0.973, 0.976, 0.98);
  const softer = rgb(0.988, 0.988, 0.988);
  const line = rgb(0.82, 0.84, 0.87);
  const darkLine = rgb(0.47, 0.51, 0.56);
  const white = rgb(1, 1, 1);
  const black = rgb(0, 0, 0);

  let page = pdf.addPage([W, H]);
  let pageNo = 1;
  const stats = computeLoadStats(load, entries);
  const {
    entryCount,
    gross,
    tare,
    net,
    firstEntryAt,
    lastEntryAt,
    lowestWeight,
    highestWeight,
  } = stats;
  const { customLabel1, customLabel2, customLabel3 } = getBusinessLabels();
  const company = getCompanyProfile();

  const rightText = (
    t: string,
    x: number,
    y: number,
    size: number,
    f = font,
    color = ink,
  ) => {
    page.drawText(t, {
      x: x - f.widthOfTextAtSize(t, size),
      y,
      size,
      font: f,
      color,
    });
  };
  const drawTextFit = (
    text: string,
    x: number,
    y: number,
    maxW: number,
    size: number,
    f = font,
    color = ink,
  ) => {
    let out = text || "-";
    while (out.length > 1 && f.widthOfTextAtSize(out, size) > maxW) {
      out = `${out.slice(0, -2)}.`;
    }
    page.drawText(out, { x, y, size, font: f, color });
  };
  const newPage = () => {
    page = pdf.addPage([W, H]);
    pageNo += 1;
  };
  const ensureSpace = (y: number, needed: number) => {
    if (y - needed < bottomReserve) {
      newPage();
      return H - M;
    }
    return y;
  };
  const tableColumns = (count: number) =>
    count <= 10 ? 1 : count <= 30 ? 2 : count <= 60 ? 3 : 4;
  const fieldLabel = (n: CatalogFieldNumber) =>
    n === 1 ? customLabel1 : n === 2 ? customLabel2 : customLabel3;
  const fieldValue = (
    obj: Load | Entry,
    n: CatalogFieldNumber,
  ): string | null | undefined =>
    n === 1
      ? obj.custom_field_1
      : n === 2
        ? obj.custom_field_2
        : obj.custom_field_3;
  const entryFieldValue = (entry: Entry, n: CatalogFieldNumber) =>
    fieldValue(entry, n) || fieldValue(load, n) || "Others";
  const distinctValues = (n: CatalogFieldNumber) =>
    new Set(entries.map((e) => entryFieldValue(e, n)).filter(Boolean)).size;

  const groupField = ([3, 2, 1] as CatalogFieldNumber[]).find(
    (n) => fieldLabel(n) && distinctValues(n) > 1,
  );
  const sections = groupField
    ? Array.from(
        entries.reduce(
          (map, entry, index) => {
            const label = entryFieldValue(entry, groupField);
            const current = map.get(label) ?? {
              label,
              rows: [],
              totalWeight: 0,
            };
            current.rows.push({ entry, index });
            current.totalWeight += Number(entry.weight);
            map.set(label, current);
            return map;
          },
          new Map<
            string,
            {
              label: string;
              rows: Array<{ entry: Entry; index: number }>;
              totalWeight: number;
            }
          >(),
        ),
      ).map(([, section]) => section)
    : [
        {
          label: "",
          rows: entries.map((entry, index) => ({ entry, index })),
          totalWeight: gross,
        },
      ];

  const durationLabel = (() => {
    if (!firstEntryAt || !lastEntryAt) return "-";
    const ms = Math.max(0, +new Date(lastEntryAt) - +new Date(firstEntryAt));
    const mins = Math.floor(ms / 60000);
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    return hours ? `${hours}h ${rem}m` : `${mins}m`;
  })();
  const dayName = new Date(load.created_at || Date.now()).toLocaleDateString(
    "en-IN",
    { weekday: "long" },
  );
  const headerChain =
    load.custom_field_1 && load.custom_field_2
      ? `${load.custom_field_1} -> ${load.custom_field_2}`
      : load.custom_field_1
        ? `${load.custom_field_1} -> General`
        : load.custom_field_2 || load.custom_field_3 || "";
  const totalVakkal =
    load.container_count != null && Number(load.container_count) > 0
      ? String(Number(load.container_count))
      : "-";

  let y = H - M;

  const headerH = 112;
  page.drawRectangle({
    x: M,
    y: y - headerH,
    width: contentW,
    height: headerH,
    color: white,
    borderColor: darkLine,
    borderWidth: 1.1,
  });
  page.drawRectangle({
    x: M,
    y: y - 20,
    width: contentW,
    height: 20,
    color: ink,
  });
  page.drawText("COMMERCIAL WEIGHT REPORT", {
    x: M + 10,
    y: y - 14,
    size: 8,
    font: bold,
    color: white,
  });
  rightText("A4 PRINT RECORD", W - M - 10, y - 14, 8, bold, white);

  const leftX = M + 14;
  const rightX = M + contentW - 160;
  drawTextFit(
    (company.companyName || "NEXUS WEIGHT").toUpperCase(),
    leftX,
    y - 44,
    rightX - leftX - 18,
    20,
    bold,
    ink,
  );
  drawTextFit((party?.name || "-").toUpperCase(), leftX, y - 64, 260, 12, bold);
  drawTextFit((load.label || "-").toUpperCase(), leftX, y - 82, 260, 13, bold);
  if (headerChain)
    drawTextFit(headerChain, leftX, y - 100, 300, 10, bold, green);

  const meta: Array<[string, string]> = [
    ["Date", fmtDate(load.created_at)],
    ["Day", dayName],
    ["Start Time", fmtTime(firstEntryAt)],
    ["End Time", fmtTime(lastEntryAt)],
    ["Duration", durationLabel],
  ];
  meta.forEach(([label, value], i) => {
    const rowY = y - 38 - i * 12;
    page.drawText(label.toUpperCase(), {
      x: rightX,
      y: rowY,
      size: 6.5,
      font: bold,
      color: faint,
    });
    rightText(value, W - M - 14, rowY, 8.5, bold, ink);
  });
  y -= headerH;

  const summaryH = 48;
  const summaryItems: Array<[string, string, boolean]> = [
    ["Total Entries", String(entryCount), false],
    ["Total Vakkal", totalVakkal, false],
    ["Gross Weight", gross.toFixed(2), false],
    ["Tare Weight", tare.toFixed(2), false],
    ["Net Weight", net.toFixed(2), true],
    ["Lowest Weight", lowestWeight.toFixed(2), false],
    ["Highest Weight", highestWeight.toFixed(2), false],
  ];
  const blockW = contentW / summaryItems.length;
  summaryItems.forEach(([label, value, highlight], i) => {
    const x = M + i * blockW;
    page.drawRectangle({
      x,
      y: y - summaryH,
      width: blockW,
      height: summaryH,
      color: highlight ? green : soft,
      borderColor: darkLine,
      borderWidth: 0.8,
    });
    drawTextFit(
      value,
      x + 6,
      y - 21,
      blockW - 12,
      14,
      bold,
      highlight ? white : ink,
    );
    drawTextFit(
      label.toUpperCase(),
      x + 6,
      y - 37,
      blockW - 12,
      6.5,
      bold,
      highlight ? white : sub,
    );
  });
  y -= summaryH + 14;

  const drawSectionHeader = (
    sectionLabel: string,
    groupFieldNum: CatalogFieldNumber | undefined,
    count: number,
    weight: number,
    topY: number,
  ) => {
    if (!sectionLabel) return topY;
    const h = 26;
    page.drawRectangle({
      x: M,
      y: topY - h,
      width: contentW,
      height: h,
      color: soft,
      borderColor: darkLine,
      borderWidth: 0.9,
    });

    // Build the header text
    let headerText = sectionLabel.toUpperCase();
    if (groupFieldNum === 2 && load.custom_field_1) {
      headerText = `${load.custom_field_1.toUpperCase()} -> ${sectionLabel.toUpperCase()}`;
    } else if (groupFieldNum === 2) {
      headerText = `GENERAL -> ${sectionLabel.toUpperCase()}`;
    } else if (
      groupFieldNum === 3 &&
      load.custom_field_2 &&
      load.custom_field_1
    ) {
      headerText = `${load.custom_field_1.toUpperCase()} -> ${load.custom_field_2.toUpperCase()} -> ${sectionLabel.toUpperCase()}`;
    } else if (groupFieldNum === 3 && load.custom_field_2) {
      headerText = `GENERAL -> ${load.custom_field_2.toUpperCase()} -> ${sectionLabel.toUpperCase()}`;
    } else if (groupFieldNum === 3) {
      headerText = `GENERAL -> GENERAL -> ${sectionLabel.toUpperCase()}`;
    }

    page.drawText(headerText, {
      x: M + 9,
      y: topY - 17,
      size: 10,
      font: bold,
      color: ink,
    });
    rightText(
      `Entries: ${count}    Weight: ${weight.toFixed(2)} kg`,
      W - M - 9,
      topY - 17,
      9,
      bold,
      green,
    );
    return topY - h - 6;
  };

  const drawEntryTable = (
    rows: Array<{ entry: Entry; index: number }>,
    topY: number,
  ) => {
    let currentY = topY;
    let idx = 0;
    const cols = tableColumns(rows.length);
    const colW = contentW / cols;
    const rowH = 15;
    const headH = 18;

    while (idx < rows.length) {
      currentY = ensureSpace(currentY, headH + rowH + 4);
      const availableRows = Math.max(
        1,
        Math.floor((currentY - bottomReserve - headH) / rowH),
      );
      const remaining = rows.length - idx;
      const rowsThisCol = Math.ceil(
        Math.min(remaining, availableRows * cols) / cols,
      );
      const chunk = Math.min(remaining, rowsThisCol * cols);
      const tableH = headH + rowsThisCol * rowH;

      page.drawRectangle({
        x: M,
        y: currentY - tableH,
        width: contentW,
        height: tableH,
        color: white,
        borderColor: darkLine,
        borderWidth: 0.9,
      });
      for (let col = 0; col < cols; col += 1) {
        const x = M + col * colW;
        page.drawRectangle({
          x,
          y: currentY - headH,
          width: colW,
          height: headH,
          color: ink,
        });
        if (col > 0) {
          page.drawLine({
            start: { x, y: currentY },
            end: { x, y: currentY - tableH },
            thickness: 0.7,
            color: darkLine,
          });
        }
        page.drawText("Sr No.", {
          x: x + 7,
          y: currentY - 12,
          size: 8,
          font: bold,
          color: white,
        });
        rightText("Weight (kg)", x + colW - 7, currentY - 12, 8, bold, white);
      }
      for (let r = 0; r < rowsThisCol; r += 1) {
        const ry = currentY - headH - r * rowH;
        if (r % 2 === 1) {
          page.drawRectangle({
            x: M,
            y: ry - rowH,
            width: contentW,
            height: rowH,
            color: softer,
          });
        }
        page.drawLine({
          start: { x: M, y: ry - rowH },
          end: { x: W - M, y: ry - rowH },
          thickness: 0.35,
          color: line,
        });
      }
      for (let local = 0; local < chunk; local += 1) {
        const row = rows[idx + local];
        const col = Math.floor(local / rowsThisCol);
        const r = local % rowsThisCol;
        const x = M + col * colW;
        const ry = currentY - headH - r * rowH - 10.5;
        const sr = `#${row.index + 1}`;
        const kg = Number(row.entry.weight).toFixed(2);
        page.drawText(sr, {
          x: x + 8,
          y: ry,
          size: 8.5,
          font: bold,
          color: ink,
        });
        rightText(kg, x + colW - 8, ry, 9.5, bold, black);
      }
      idx += chunk;
      currentY -= tableH + 10;
      if (idx < rows.length) {
        newPage();
        currentY = H - M;
      }
    }
    return currentY;
  };

  page.drawText("WEIGHT ENTRIES", {
    x: M,
    y,
    size: 10,
    font: bold,
    color: sub,
  });
  y -= 10;

  for (const section of sections) {
    y = ensureSpace(y, (section.label ? 36 : 0) + 38);
    y = drawSectionHeader(
      section.label,
      groupField,
      section.rows.length,
      section.totalWeight,
      y,
    );
    y = drawEntryTable(section.rows, y);
  }

  y = ensureSpace(y, 76);
  const totalH = 58;
  page.drawRectangle({
    x: M,
    y: y - totalH,
    width: contentW,
    height: totalH,
    color: white,
    borderColor: darkLine,
    borderWidth: 1,
  });
  const calcWidths = [0.245, 0.07, 0.245, 0.07, 0.37];
  const calcItems: Array<[string, string, boolean]> = [
    ["Gross Weight", `${gross.toFixed(2)} kg`, false],
    [" ", "-", false],
    ["Tare Weight", `${tare.toFixed(2)} kg`, false],
    [" ", "=", false],
    ["Net Weight", `${net.toFixed(2)} kg`, true],
  ];
  let calcX = M;
  calcItems.forEach(([label, value, highlight], i) => {
    const w = contentW * calcWidths[i];
    page.drawRectangle({
      x: calcX,
      y: y - totalH,
      width: w,
      height: totalH,
      color: highlight ? green : i % 2 === 1 ? softer : white,
      borderColor: line,
      borderWidth: 0.6,
    });
    const valueSize = highlight ? 18 : i % 2 === 1 ? 18 : 13;
    drawTextFit(
      value,
      calcX + 9,
      y - 25,
      w - 18,
      valueSize,
      bold,
      highlight ? white : ink,
    );
    drawTextFit(
      label.toUpperCase(),
      calcX + 9,
      y - 43,
      w - 18,
      7,
      bold,
      highlight ? white : sub,
    );
    calcX += w;
  });

  const generatedAt = new Date().toLocaleString("en-IN");
  pdf.getPages().forEach((p, i) => {
    p.drawLine({
      start: { x: M, y: footerY + 13 },
      end: { x: W - M, y: footerY + 13 },
      thickness: 0.5,
      color: line,
    });
    p.drawText(`Generated by Nexus Weight | ${generatedAt}`, {
      x: M,
      y: footerY,
      size: 7.5,
      font,
      color: faint,
    });
    const pageLabel = `Page ${i + 1} of ${pageNo}`;
    p.drawText(pageLabel, {
      x: W - M - font.widthOfTextAtSize(pageLabel, 7.5),
      y: footerY,
      size: 7.5,
      font,
      color: faint,
    });
  });

  const bytes = await pdf.save();
  const pdfBytes = new Uint8Array(bytes);
  const blob = new Blob([pdfBytes.buffer], { type: "application/pdf" });
  const filename = generateFilename(c, ".pdf");
  return { blob, filename };
}

/** Share the PDF via the native share sheet (WhatsApp, email, etc. — kept as
 * the original export for backward compatibility with existing callers). */
/* eslint-disable @typescript-eslint/no-unused-vars */
async function legacyExportPDF(c: ShareCtx) {
  const { blob, filename } = await buildPdfBlob(c);
  // Native → save + share sheet (open in / share the PDF). Web → download.
  await shareBinaryFile({
    filename,
    blob,
    mimeType: "application/pdf",
    title: "Nexus Weight — PDF",
  });
}
/* eslint-enable @typescript-eslint/no-unused-vars */

export async function exportPDF(c: ShareCtx) {
  if (!isNativePlatform()) {
    const shareWindow = window.open(
      "about:blank",
      "_blank",
      "width=520,height=720",
    );
    if (!shareWindow) {
      throw new Error("Popup blocked - allow popups to open the share window.");
    }
    shareWindow.document.open();
    shareWindow.document.write(
      '<!doctype html><title>Nexus Weight</title><body style="font-family:Arial,sans-serif;padding:24px">Preparing PDF share...</body>',
    );
    shareWindow.document.close();

    try {
      const { blob, filename } = await buildPdfBlob(c);
      await shareFileWithWebFallback({
        filename,
        blob,
        mimeType: "application/pdf",
        title: "Nexus Weight PDF",
        whatsappText:
          "Nexus Weight PDF is ready. Attach the downloaded PDF in WhatsApp.",
        shareWindow,
      });
    } catch (error) {
      if (!shareWindow.closed) shareWindow.close();
      throw error;
    }
    return;
  }

  const { blob, filename } = await buildPdfBlob(c);
  const result = await shareBinaryFile({
    filename,
    blob,
    mimeType: "application/pdf",
    title: "Nexus Weight PDF",
  });
  if (result === "downloaded") {
    throw new Error(
      "This browser cannot open a file share dialog for PDFs. The PDF was downloaded instead.",
    );
  }
}

/** Save the PDF straight to device storage (Documents on native, browser
 * download on web) — no share sheet, distinct from exportPDF. */
export async function downloadPDF(c: ShareCtx) {
  const { blob, filename } = await buildPdfBlob(c);
  await saveBinaryFile({ filename, blob });
}
