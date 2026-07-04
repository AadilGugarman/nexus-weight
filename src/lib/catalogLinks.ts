import type { CatalogValue, CatalogValueLink, CatalogFieldNumber } from '../types';

/** The field a value from `fieldNumber` can link forward to, or null past the last field. */
export function nextField(fieldNumber: CatalogFieldNumber): CatalogFieldNumber | null {
  return fieldNumber === 1 ? 2 : fieldNumber === 2 ? 3 : null;
}

function active(links: CatalogValueLink[]) {
  return links.filter((l) => !l.is_deleted);
}

/** Case-insensitive lookup of an active catalog value's id by its field + text. */
export function findCatalogValueId(values: CatalogValue[], fieldNumber: CatalogFieldNumber, text: string): string | undefined {
  const needle = text.trim().toLowerCase();
  if (!needle) return undefined;
  return values.find((v) => !v.is_deleted && v.field_number === fieldNumber && v.value.trim().toLowerCase() === needle)?.id;
}

/** Ids this value currently links to (outgoing only). */
export function linkedValueIds(links: CatalogValueLink[], valueId: string): Set<string> {
  return new Set(active(links).filter((l) => l.value_id === valueId).map((l) => l.linked_value_id));
}

/** Whether this value has any outgoing links at all — the "has the business
 * opted into linking for this value" signal. When false, linkedChildren()
 * below falls back to offering every value of the next field, so a business
 * that never links anything keeps its fully independent behavior. */
export function hasAnyOutgoingLinks(links: CatalogValueLink[], valueId: string): boolean {
  return active(links).some((l) => l.value_id === valueId);
}

/** Active values of `childField` available for `parentId` to pick from:
 * exactly its linked values when it has any, otherwise every active value of
 * that field (no links configured yet = unrestricted, matching pre-linking
 * behavior). Returns [] while no parent is selected. */
export function linkedChildren(catalogValues: CatalogValue[], links: CatalogValueLink[], parentId: string | undefined, childField: CatalogFieldNumber): CatalogValue[] {
  if (!parentId) return [];
  const all = catalogValues.filter((v) => !v.is_deleted && v.field_number === childField).sort((a, b) => a.value.localeCompare(b.value));
  
  // If this value has explicit outgoing links, return only the linked children
  if (hasAnyOutgoingLinks(links, parentId)) {
    const ids = linkedValueIds(links, parentId);
    return all.filter((v) => ids.has(v.id));
  }
  
  // If no explicit links, return all values (fallback for backward compatibility)
  // But for Entry page hierarchy, we want to return empty array instead
  // So we check if this is being used in a hierarchy context
  return all;
}

/** Active values of `childField` that are explicitly linked as children of `parentId`.
 * Returns empty array if parentId has no outgoing links (strict mode - no fallback). */
export function explicitLinkedChildren(catalogValues: CatalogValue[], links: CatalogValueLink[], parentId: string | undefined, childField: CatalogFieldNumber): CatalogValue[] {
  if (!parentId) return [];
  if (!hasAnyOutgoingLinks(links, parentId)) return []; // No fallback
  
  const all = catalogValues.filter((v) => !v.is_deleted && v.field_number === childField).sort((a, b) => a.value.localeCompare(b.value));
  const ids = linkedValueIds(links, parentId);
  return all.filter((v) => ids.has(v.id));
}

/** True if at least one active link exists from any value of `fieldA` to any
 * value of `fieldB` — the signal that a business has actually engaged with
 * linking for this pair, used to decide whether summaries/exports should
 * nest that pair or keep showing it as two independent flat breakdowns. */
export function hasAnyLinksForPair(catalogValues: CatalogValue[], links: CatalogValueLink[], fieldA: CatalogFieldNumber, fieldB: CatalogFieldNumber): boolean {
  const aIds = new Set(catalogValues.filter((v) => !v.is_deleted && v.field_number === fieldA).map((v) => v.id));
  const bIds = new Set(catalogValues.filter((v) => !v.is_deleted && v.field_number === fieldB).map((v) => v.id));
  return active(links).some((l) => aIds.has(l.value_id) && bIds.has(l.linked_value_id));
}

/** The longest proven Label1->Label2(->Label3) chain for summary/export
 * nesting — empty when Label1/2 aren't both configured or nothing has been
 * linked between them yet (full independent-flat fallback, byte-identical
 * to pre-linking behavior). No mode is stored anywhere; this is derived
 * fresh from whatever links actually exist. */
export function resolveLinkedChain(catalogValues: CatalogValue[], links: CatalogValueLink[], labels: Array<string | null | undefined>): CatalogFieldNumber[] {
  if (!labels[0] || !labels[1] || !hasAnyLinksForPair(catalogValues, links, 1, 2)) return [];
  const chain: CatalogFieldNumber[] = [1, 2];
  if (labels[2] && hasAnyLinksForPair(catalogValues, links, 2, 3)) chain.push(3);
  return chain;
}

// ============================================================================
// Catalog tree — Manage screen's hierarchical view. The app enforces a
// single active parent per value here (stricter than the raw many-to-many
// schema), so "the parent" is well-defined and cascade-delete/Move are
// unambiguous. See useStore.setValueParent for the write side.
// ============================================================================

export interface CatalogTreeNode {
  value: CatalogValue;
  field: CatalogFieldNumber;
  children: CatalogTreeNode[];
}

/** The single active parent id linking to this value, if any. */
export function parentOf(links: CatalogValueLink[], childId: string): string | undefined {
  return active(links).find((l) => l.linked_value_id === childId)?.value_id;
}

/** Walks parentOf() upward to the root — every ancestor id of `id`. */
export function ancestorIds(links: CatalogValueLink[], id: string): string[] {
  const out: string[] = [];
  let cur = parentOf(links, id);
  while (cur) {
    out.push(cur);
    cur = parentOf(links, cur);
  }
  return out;
}

/** Active values of `field` with no active parent link — orphans that still
 * need managing (Entry pickers show them as available to everyone) but
 * don't belong under any node in the main tree. */
export function unlinkedValuesOf(catalogValues: CatalogValue[], links: CatalogValueLink[], field: CatalogFieldNumber): CatalogValue[] {
  return catalogValues
    .filter((v) => !v.is_deleted && v.field_number === field && !parentOf(links, v.id))
    .sort((a, b) => a.value.localeCompare(b.value));
}

function childrenOf(catalogValues: CatalogValue[], links: CatalogValueLink[], parentId: string, childField: CatalogFieldNumber): CatalogValue[] {
  return catalogValues
    .filter((v) => !v.is_deleted && v.field_number === childField && parentOf(links, v.id) === parentId)
    .sort((a, b) => a.value.localeCompare(b.value));
}

/** Builds a forest for `roots`, which sit at `chain[chainIdx]`, recursively
 * attaching children from `chain[chainIdx+1]` (if any) that are linked to
 * each root. Used both for the main tree (roots = chain[0] values) and for
 * an "Unlinked" bucket's own sub-trees (roots = orphans of some later field
 * in the chain — an orphaned Variety can still have linked Vakkal children). */
export function buildForest(roots: CatalogValue[], chain: CatalogFieldNumber[], chainIdx: number, catalogValues: CatalogValue[], links: CatalogValueLink[]): CatalogTreeNode[] {
  const childField = chainIdx + 1 < chain.length ? chain[chainIdx + 1] : null;
  return roots.map((v) => ({
    value: v,
    field: chain[chainIdx],
    children: childField == null ? [] : buildForest(childrenOf(catalogValues, links, v.id, childField), chain, chainIdx + 1, catalogValues, links),
  }));
}

/** The main tree for a chain of consecutively-configured fields — roots are
 * every active value of `chain[0]`. */
export function buildCatalogTree(catalogValues: CatalogValue[], links: CatalogValueLink[], chain: CatalogFieldNumber[]): CatalogTreeNode[] {
  if (chain.length === 0) return [];
  const roots = catalogValues.filter((v) => !v.is_deleted && v.field_number === chain[0]).sort((a, b) => a.value.localeCompare(b.value));
  return buildForest(roots, chain, 0, catalogValues, links);
}

/** Total node count in a forest, including all descendants. */
export function countNodes(nodes: CatalogTreeNode[]): number {
  return nodes.reduce((n, node) => n + 1 + countNodes(node.children), 0);
}

/** Recursively prunes a forest to only nodes whose value matches `query`
 * (case-insensitive substring) or that have a matching descendant — powers
 * search-with-auto-expand: callers should also expand every surviving
 * node's id (or just its matches' ancestors) so the pruned branch is visible. */
export function filterTreeForSearch(nodes: CatalogTreeNode[], query: string): CatalogTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  const walk = (list: CatalogTreeNode[]): CatalogTreeNode[] =>
    list.reduce<CatalogTreeNode[]>((out, node) => {
      const children = walk(node.children);
      const selfMatches = node.value.value.toLowerCase().includes(q);
      if (selfMatches || children.length > 0) out.push({ ...node, children });
      return out;
    }, []);
  return walk(nodes);
}
