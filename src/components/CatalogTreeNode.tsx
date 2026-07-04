import { Fragment } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Folder, FolderOpen, Tag, Pencil, Plus, MoreHorizontal, Trash2 } from 'lucide-react';
import type { CatalogFieldNumber } from '../types';
import type { CatalogTreeNode as TreeNode } from '../lib/catalogLinks';
import type { Screen } from './CatalogNodeSheet';

export interface NodeActionContext {
  node: TreeNode;
  childField: CatalogFieldNumber | null;
  childLabel: string | null;
  parentField: CatalogFieldNumber | null;
  parentLabel: string | null;
  initialScreen: Screen;
}

interface Props {
  node: TreeNode;
  chain: CatalogFieldNumber[];
  chainIdx: number;
  labels: Partial<Record<CatalogFieldNumber, string>>;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  query: string;
  onOpenActions: (ctx: NodeActionContext) => void;
}

/** One row plus its (recursively rendered) children. Indentation is purely
 * structural — each nesting level wraps its children in an inset,
 * left-bordered container, so depth doesn't need to be tracked/passed as a number. */
export default function CatalogTreeNode({ node, chain, chainIdx, labels, expandedIds, onToggleExpand, query, onOpenActions }: Props) {
  const hasChildren = node.children.length > 0;
  const expanded = hasChildren && expandedIds.has(node.value.id);

  const childField = chainIdx + 1 < chain.length ? chain[chainIdx + 1] : null;
  const parentField = chainIdx > 0 ? chain[chainIdx - 1] : null;

  const baseCtx = {
    node,
    childField,
    childLabel: childField != null ? labels[childField] ?? null : null,
    parentField,
    parentLabel: parentField != null ? labels[parentField] ?? null : null,
  };
  const openWith = (initialScreen: Screen) => onOpenActions({ ...baseCtx, initialScreen });
  const hasOverflow = childField != null || parentField != null;

  return (
    <div>
      <div
        className="flex items-center gap-1 min-h-[44px] px-1.5 rounded-lg"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {hasChildren ? (
          <button type="button" aria-label={expanded ? 'Collapse' : 'Expand'} onClick={() => onToggleExpand(node.value.id)} className="shrink-0 p-1 -ml-0.5">
            <ChevronRight size={15} className="transition-transform" style={{ color: 'var(--text-faint)', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }} />
          </button>
        ) : (
          <span className="w-6 shrink-0" />
        )}

        <span className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'var(--accent-soft)' }}>
          {hasChildren
            ? (expanded ? <FolderOpen size={13} style={{ color: 'var(--accent)' }} /> : <Folder size={13} style={{ color: 'var(--accent)' }} />)
            : <Tag size={12} style={{ color: 'var(--accent)' }} />}
        </span>

        <span className="flex-1 min-w-0 truncate text-sm font-bold ml-0.5" style={{ color: 'var(--text)' }}>
          {highlightMatch(node.value.value, query)}
        </span>

        <div className="shrink-0 flex items-center">
          {childField != null && (
            <button type="button" aria-label={`Add child under ${node.value.value}`} onClick={() => openWith('addChild')} className="p-1.5">
              <Plus size={15} style={{ color: 'var(--accent)' }} />
            </button>
          )}
          <button type="button" aria-label={`Edit ${node.value.value}`} onClick={() => openWith('edit')} className="p-1.5">
            <Pencil size={14} style={{ color: 'var(--text-faint)' }} />
          </button>
          {hasOverflow && (
            <button type="button" aria-label={`More actions for ${node.value.value}`} onClick={() => openWith('menu')} className="p-1.5">
              <MoreHorizontal size={15} style={{ color: 'var(--text-faint)' }} />
            </button>
          )}
          <button type="button" aria-label={`Delete ${node.value.value}`} onClick={() => openWith('delete')} className="p-1.5 -mr-1">
            <Trash2 size={14} className="text-red-400" />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 space-y-1.5 pl-3 ml-3 border-l" style={{ borderColor: 'var(--border-2)' }}>
              {node.children.map((child) => (
                <CatalogTreeNode
                  key={child.value.id}
                  node={child}
                  chain={chain}
                  chainIdx={chainIdx + 1}
                  labels={labels}
                  expandedIds={expandedIds}
                  onToggleExpand={onToggleExpand}
                  query={query}
                  onOpenActions={onOpenActions}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function highlightMatch(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <Fragment>
      {text.slice(0, idx)}
      <span style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 3 }}>{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </Fragment>
  );
}
