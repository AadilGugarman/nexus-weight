import { apiGet, apiPost } from "./api";
import { useStore } from "../store/useStore";
import { getDriveToken, uploadBackup, downloadBackup, getBackupMeta } from "./drive";
import { saveBinaryFile } from "./nativeShare";
import type { BackupMeta } from "./drive";

export interface Snapshot {
  version: number;
  exportedAt: string;
  userId: string;
  recordCount: number;
  tables: Record<string, unknown[]>;
}

export type BackupSchedule = "daily" | "weekly" | "off";

/** Pull a full snapshot from the server. */
export async function fetchSnapshot(): Promise<Snapshot> {
  return apiGet<Snapshot>("backup");
}

/** Back up to the user's Google Drive (single file, replaces previous). */
export async function backupToDrive(
  interactive = true,
): Promise<{ recordCount: number }> {
  const token = await getDriveToken(interactive);
  const snapshot = await fetchSnapshot();
  await uploadBackup(token, snapshot); // overwrites the one existing file
  localStorage.setItem("lastBackupAt", new Date().toISOString());
  localStorage.setItem("lastBackupCount", String(snapshot.recordCount));
  // record approximate backup size (bytes of the JSON payload)
  try {
    localStorage.setItem(
      "lastBackupSize",
      String(new Blob([JSON.stringify(snapshot)]).size),
    );
  } catch {
    /* ignore */
  }
  return { recordCount: snapshot.recordCount };
}

/** Restore the complete database from Google Drive. */
export async function restoreFromDrive(): Promise<{ restored: number }> {
  const token = await getDriveToken(true);
  const snapshot = await downloadBackup(token);
  if (!snapshot) throw new Error("No backup found in your Google Drive");
  const result = await apiPost<{ restored: number }>("restore", snapshot);
  await useStore.getState().loadAll();
  return result;
}

/** Read the Drive backup metadata (size + modified time). */
export async function driveBackupMeta(
  interactive = false,
): Promise<BackupMeta | null> {
  const token = await getDriveToken(interactive);
  return getBackupMeta(token);
}

/** Manual fallback for when Google Drive is unavailable/misconfigured: save
 * the same snapshot as a local JSON file (Documents on native, browser
 * download on web). Requires no Google auth at all. */
export async function downloadBackupFile(): Promise<{ recordCount: number }> {
  const snapshot = await fetchSnapshot();
  const blob = new Blob([JSON.stringify(snapshot)], { type: "application/json" });
  const date = new Date().toISOString().slice(0, 10);
  await saveBinaryFile({ filename: `nexus-weight-backup-${date}.json`, blob });
  return { recordCount: snapshot.recordCount };
}

/** Manual fallback restore: read a previously downloaded backup file back in. */
export async function restoreFromFile(file: File): Promise<{ restored: number }> {
  const text = await file.text();
  let snapshot: Snapshot;
  try {
    snapshot = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a valid backup — could not parse JSON");
  }
  if (!snapshot || typeof snapshot !== "object" || !snapshot.tables) {
    throw new Error("That file isn't a valid Nexus Weight backup");
  }
  const result = await apiPost<{ restored: number }>("restore", snapshot);
  await useStore.getState().loadAll();
  return result;
}

/* -------- Scheduling (WhatsApp-style: Daily 5AM / Weekly 5AM / Off) -------- */
const SCHED_KEY = "backupSchedule";
const NEXT_KEY = "backupNextRun";

export function getSchedule(): BackupSchedule {
  return (localStorage.getItem(SCHED_KEY) as BackupSchedule) || "off";
}

export function setSchedule(s: BackupSchedule) {
  localStorage.setItem(SCHED_KEY, s);
  if (s === "off") localStorage.removeItem(NEXT_KEY);
  else computeNextRun(s);
}

/** Next 5:00 AM occurrence (daily => tomorrow/today 5AM, weekly => +7 days). */
function computeNextRun(s: BackupSchedule): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(5, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1); // move to next day's 5AM
  if (s === "weekly") {
    // schedule 7 days from the last backup (or today) at 5AM
    const last = localStorage.getItem("lastBackupAt");
    const base = last ? new Date(last) : now;
    const wk = new Date(base);
    wk.setDate(wk.getDate() + 7);
    wk.setHours(5, 0, 0, 0);
    if (wk > now) {
      localStorage.setItem(NEXT_KEY, String(wk.getTime()));
      return wk.getTime();
    }
  }
  localStorage.setItem(NEXT_KEY, String(next.getTime()));
  return next.getTime();
}

function nextRunTime(): number {
  const v = localStorage.getItem(NEXT_KEY);
  return v ? Number(v) : computeNextRun(getSchedule());
}

export function nextRunLabel(): string {
  if (getSchedule() === "off") return "Off";
  return new Date(nextRunTime()).toLocaleString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

let autoTimer: number | null = null;

/** Checks every minute whether a scheduled backup is due. */
export function initAutoBackup() {
  if (autoTimer) return;
  const tick = async () => {
    const schedule = getSchedule();
    if (schedule === "off") return;
    if (!navigator.onLine) return;
    if (Date.now() < nextRunTime()) return;
    try {
      await backupToDrive(false); // silent (non-interactive) — needs prior consent
      // schedule the following run
      if (schedule === "daily") {
        const n = new Date();
        n.setDate(n.getDate() + 1);
        n.setHours(5, 0, 0, 0);
        localStorage.setItem(NEXT_KEY, String(n.getTime()));
      } else {
        const n = new Date();
        n.setDate(n.getDate() + 7);
        n.setHours(5, 0, 0, 0);
        localStorage.setItem(NEXT_KEY, String(n.getTime()));
      }
    } catch (e) {
      console.warn(
        "[auto-backup] scheduled attempt failed (will retry next tick)",
        e,
      );
      // push next attempt 30 min out to avoid hammering
      localStorage.setItem(NEXT_KEY, String(Date.now() + 30 * 60 * 1000));
    }
  };
  // ensure a next-run exists
  if (!localStorage.getItem(NEXT_KEY) && getSchedule() !== "off")
    computeNextRun(getSchedule());
  autoTimer = window.setInterval(tick, 60 * 1000);
  window.setTimeout(tick, 10000);
}
