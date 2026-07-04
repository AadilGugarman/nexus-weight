import { useMemo, useState } from 'react';
import { Package, Search, ChevronRight } from 'lucide-react';
import CatalogField from './CatalogField';
import CatalogTreeNode, { type NodeActionContext } from './CatalogTreeNode';
import CatalogNodeSheet from './CatalogNodeSheet';
import { useStore } from '../store/useStore';
import { buildCatalogTree, buildForest, unlinkedValuesOf, countNodes, filterTreeForSearch, type CatalogTreeNode as TreeNode } from '../lib/catalogLinks';
import type { CatalogFieldNumber } from '../types';

interface Props {
  /** Only the business's configured (non-blank) fields, in field-number order. */
  catalogFields: Array<{ n: CatalogFieldNumber; label: string }>;
}

interface Section {
  n: CatalogFieldNumber;
  chain: CatalogFieldNumber[];
}

/** Every id of a node that has children, anywhere in the forest — used to
 * force-open the full path to every surviving match while searching. */
function expandableIds(nodes: TreeNode[]): Set<string> {
  const out = new Set<string>();
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      if (n.children.length > 0) {
        out.add(n.value.id);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return out;
}

export default function CatalogTree({ catalogFields }: Props) {
  const catalogValues = useStore((s) => s.catalogValues);
  const catalogValueLinks = useStore((s) => s.catalogValueLinks);

  const [query, setQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [actionCtx, setActionCtx] = useState<NodeActionContext | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const labelOf = (n: CatalogFieldNumber) => catalogFields.find((f) => f.n === n)?.label ?? '';
  const isActive = (n: CatalogFieldNumber) => catalogFields.some((f) => f.n === n);
  const labels = useMemo(() => Object.fromEntries(catalogFields.map((f) => [f.n, f.label])) as Partial<Record<CatalogFieldNumber, string>>, [catalogFields]);

  // Which fields are the top of their own section (no active field before
  // them), and how far each section's chain extends through however many
  // *consecutive* configured fields follow.
  const sections = useMemo<Section[]>(() => {
    const chainFrom = (n: CatalogFieldNumber): CatalogFieldNumber[] => {
      const chain: CatalogFieldNumber[] = [n];
      if (n < 3 && isActive((n + 1) as CatalogFieldNumber)) {
        chain.push((n + 1) as CatalogFieldNumber);
        if (n + 1 < 3 && isActive((n + 2) as CatalogFieldNumber)) chain.push((n + 2) as CatalogFieldNumber);
      }
      return chain;
    };
    return ([1, 2, 3] as CatalogFieldNumber[])
      .filter((n) => isActive(n) && (n === 1 || !isActive((n - 1) as CatalogFieldNumber)))
      .map((n) => ({ n, chain: chainFrom(n) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogFields]);

  const q = query.trim();

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2" size={14} style={{ color: 'var(--text-faint)' }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search catalog values…"
          className="w-full rounded-lg pl-8 pr-2.5 h-9 text-xs outline-none" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
      </div>

      {sections.map((section) => {
        const fullTree = buildCatalogTree(catalogValues, catalogValueLinks, section.chain);
        const tree = q ? filterTreeForSearch(fullTree, q) : fullTree;
        const forcedExpand = q ? expandableIds(tree) : new Set<string>();
        const effectiveExpanded = q ? new Set([...expandedIds, ...forcedExpand]) : expandedIds;

        const unlinkedFields = section.chain.slice(1);
        const buckets = unlinkedFields.map((field) => {
          const chainIdx = section.chain.indexOf(field);
          const fullForest = buildForest(unlinkedValuesOf(catalogValues, catalogValueLinks, field), section.chain, chainIdx, catalogValues, catalogValueLinks);
          const forest = q ? filterTreeForSearch(fullForest, q) : fullForest;
          return { field, chainIdx, fullForest, forest };
        });

        const totalValues = countNodes(fullTree) + buckets.reduce((n, b) => n + countNodes(b.fullForest), 0);
        const sectionLabel = labelOf(section.n);

        return (
          <div key={section.n} className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {/* Section Header */}
            <div className="flex items-center gap-2 mb-3 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--accent-soft)' }}>
                <Package size={18} style={{ color: 'var(--accent-deep)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-base leading-tight" style={{ color: 'var(--text)' }}>{sectionLabel}</p>
                <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                  {totalValues} value{totalValues === 1 ? '' : 's'}{section.chain.length > 1 ? ` · ${section.chain.length} levels` : ''}
                </p>
              </div>
            </div>

            {/* Top Level Input */}
            <div className="mb-3">
              <p className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-faint)' }}>
                Add {sectionLabel}
              </p>
              <CatalogField fieldNumber={section.n} value="" onChange={() => {}} placeholder={`Enter ${sectionLabel.toLowerCase()}…`} compact uppercase />
            </div>

            {tree.length === 0 ? (
              <p className="text-xs pl-1 mb-1" style={{ color: 'var(--text-faint)' }}>
                {q ? 'No matches.' : `No ${sectionLabel.toLowerCase()} yet — add one above.`}
              </p>
            ) : (
              <div className="space-y-1 mb-3">
                {tree.map((node) => (
                  <CatalogTreeNode key={node.value.id} node={node} chain={section.chain} chainIdx={0} labels={labels}
                    expandedIds={effectiveExpanded} onToggleExpand={toggleExpand} query={q} onOpenActions={setActionCtx} />
                ))}
              </div>
            )}

            {buckets.map(({ field, chainIdx, fullForest, forest }) => {
              const bucketKey = `bucket:${field}`;
              const bucketOpen = q ? true : expandedIds.has(bucketKey);
              const bucketForcedExpand = q ? new Set([...expandedIds, ...expandableIds(forest)]) : expandedIds;
              const hasUnlinked = fullForest.length > 0;
              const fieldLabel = labelOf(field);
              
              return (
                <div key={field} className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                  {/* Input field for adding unlinked values */}
                  <div className="mb-2">
                    <p className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-faint)' }}>
                      Add {fieldLabel}
                    </p>
                    <CatalogField 
                      fieldNumber={field} 
                      value="" 
                      onChange={() => {}} 
                      placeholder={`Enter ${fieldLabel.toLowerCase()}…`} 
                      compact 
                      uppercase
                    />
                  </div>
                  
                  {hasUnlinked && (
                    <>
                      <button type="button" onClick={() => toggleExpand(bucketKey)}
                        className="w-full flex items-center gap-1.5 text-xs font-bold py-2 px-2 rounded-lg transition-colors hover:bg-opacity-50" 
                        style={{ color: 'var(--text-muted)', background: 'var(--surface-2)' }}>
                        <ChevronRight size={13} className="transition-transform" style={{ transform: bucketOpen ? 'rotate(90deg)' : 'rotate(0deg)' }} />
                        Unlinked {fieldLabel} ({countNodes(fullForest)})
                      </button>
                      {bucketOpen && (
                        <div className="space-y-1 mt-2">
                          {(q && forest.length === 0) ? (
                            <p className="text-xs pl-1" style={{ color: 'var(--text-faint)' }}>No matches.</p>
                          ) : (
                            forest.map((node) => (
                              <CatalogTreeNode key={node.value.id} node={node} chain={section.chain} chainIdx={chainIdx} labels={labels}
                                expandedIds={bucketForcedExpand} onToggleExpand={toggleExpand} query={q} onOpenActions={setActionCtx} />
                            ))
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      <CatalogNodeSheet open={actionCtx != null} onClose={() => setActionCtx(null)} context={actionCtx} />
    </div>
  );
}
