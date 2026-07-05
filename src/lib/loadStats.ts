import type { Load, Entry, CatalogFieldNumber } from "../types";

export interface LoadStats {
  entryCount: number;
  gross: number;
  tare: number;
  net: number;
  /** created_at of the earliest/latest entry (by timestamp, not insertion order), or null with 0 entries. */
  firstEntryAt: string | null;
  lastEntryAt: string | null;
  lowestWeight: number;
  highestWeight: number;
}

/** Gross = sum of entry weights. Tare = container_count × weight_per_container.
 * Net = Gross − Tare. Shared by LoadDetail (on-screen) and share.ts (exports)
 * so the formula only lives in one place. */
export function computeLoadStats(load: Load, entries: Entry[]): LoadStats {
  const gross = entries.reduce((s, e) => s + Number(e.weight), 0);
  const tare =
    (Number(load.container_count) || 0) *
    (Number(load.weight_per_container) || 0);
  const times = entries
    .map((e) => e.created_at)
    .filter((t): t is string => !!t)
    .sort();
  const weights = entries.map((e) => Number(e.weight));
  let lowestWeight = 0;
  let highestWeight = 0;
  if (weights.length > 0) {
    lowestWeight = Math.min(...weights);
    highestWeight = Math.max(...weights);
  }
  return {
    entryCount: entries.length,
    gross,
    tare,
    net: gross - tare,
    firstEntryAt: times[0] ?? null,
    lastEntryAt: times[times.length - 1] ?? null,
    lowestWeight,
    highestWeight,
  };
}

export interface LabelGroup {
  value: string;
  weight: number;
  count: number;
}

/** Grouped weight totals for one of the business's 3 catalog fields, computed
 * from actual entry-level data. Falls back to the load's own custom_field_N
 * for any entry that doesn't carry its own (i.e. every load created before
 * per-entry labeling existed, or an entry added without changing the active
 * group) — so existing loads/entries keep summarizing exactly as before. */
function fieldValue(
  obj: Load | Entry,
  fieldNumber: CatalogFieldNumber,
): string | null | undefined {
  return fieldNumber === 1
    ? obj.custom_field_1
    : fieldNumber === 2
      ? obj.custom_field_2
      : obj.custom_field_3;
}

export function computeLabelGroups(
  load: Load,
  entries: Entry[],
  fieldNumber: CatalogFieldNumber,
): LabelGroup[] {
  const loadField = fieldValue(load, fieldNumber);
  const groups = new Map<string, LabelGroup>();
  for (const e of entries) {
    const value = fieldValue(e, fieldNumber) || loadField;
    if (!value) continue;
    const g = groups.get(value) ?? { value, weight: 0, count: 0 };
    g.weight += Number(e.weight);
    g.count += 1;
    groups.set(value, g);
  }
  return [...groups.values()].sort((a, b) => b.weight - a.weight);
}

export interface NestedGroup {
  value: string;
  weight: number;
  count: number;
  children: NestedGroup[];
}

/** Nested weight totals for a chain of catalog fields under Flexible
 * Hierarchical Catalogs — `fields` is `[1,2]` for Label1->Label2 (l1_l2
 * mode) or `[1,2,3]` for the full Label1->Label2->Label3 chain (l1_l2_l3
 * mode). Recurses one level per field, so it supports either depth with the
 * same logic. Like computeLabelGroups, this reads only the literal text
 * already stored on each entry (falling back to the load's own value) — no
 * catalog lookups needed, so it works the same whether or not the catalog
 * was ever formally linked. */
export function computeNestedGroups(
  load: Load,
  entries: Entry[],
  fields: CatalogFieldNumber[],
): NestedGroup[] {
  if (fields.length === 0) return [];
  const [field, ...rest] = fields;
  const loadValue = fieldValue(load, field);
  const groups = new Map<
    string,
    { weight: number; count: number; entries: Entry[] }
  >();
  for (const e of entries) {
    const value = fieldValue(e, field) || loadValue;
    if (!value) continue;
    const g = groups.get(value) ?? { weight: 0, count: 0, entries: [] };
    g.weight += Number(e.weight);
    g.count += 1;
    g.entries.push(e);
    groups.set(value, g);
  }
  return [...groups.entries()]
    .map(([value, g]) => ({
      value,
      weight: g.weight,
      count: g.count,
      children: rest.length ? computeNestedGroups(load, g.entries, rest) : [],
    }))
    .sort((a, b) => b.weight - a.weight);
}

export interface BreakdownLine {
  text: string;
  /** null = header row with no numeric total shown (the common case where a
   * load has exactly one top-level value, so its subtotal would just repeat
   * the load's overall net weight). */
  weight: number | null;
  depth: number;
}

/** Flattens a NestedGroup tree into printable rows for exports (WhatsApp
 * text, receipt image, PDF) — each row is prefixed with its level's label
 * name (e.g. "Vakkal A") and indented by `depth`. The root row's weight is
 * shown whenever a load mixes multiple top-level values (so each one's
 * subtotal is distinguishable), and hidden otherwise. */
export function flattenNestedGroups(
  groups: NestedGroup[],
  labels: string[],
): BreakdownLine[] {
  const showRootWeight = groups.length > 1;
  const walk = (nodes: NestedGroup[], depth: number): BreakdownLine[] => {
    const label = labels[depth] || "";
    const lines: BreakdownLine[] = [];
    for (const g of nodes) {
      const text = depth === 0 ? `${label}: ${g.value}` : `${label} ${g.value}`;
      lines.push({
        text,
        weight: depth === 0 && !showRootWeight ? null : g.weight,
        depth,
      });
      if (g.children.length) lines.push(...walk(g.children, depth + 1));
    }
    return lines;
  };
  return walk(groups, 0);
}
