import type { NestedGroup } from '../lib/loadStats';

interface Props {
  /** Label text per nesting depth — e.g. [Category, Vakkal] or [Category, Vakkal, Bag Type]. */
  labels: string[];
  groups: NestedGroup[];
  depth?: number;
}

/** Recursive "{Label} Wise" breakdown for Flexible Hierarchical Catalogs —
 * renders a NestedGroup tree (see computeNestedGroups) with each deeper
 * level indented under its parent's row. Shared by LoadDetail and the Entry
 * "Load Finalized" screen so the on-screen layout matches exactly. */
export default function NestedBreakdown({ labels, groups, depth = 0 }: Props) {
  const label = labels[depth];
  if (!label || groups.length === 0) return null;
  return (
    <div className={depth > 0 ? 'pl-3 mt-1.5' : ''}>
      {depth === 0 && <p className="text-[10px] font-black uppercase tracking-[0.15em] mb-2" style={{ color: 'var(--text-faint)' }}>{label} Wise</p>}
      <div className="space-y-1.5">
        {groups.map((g) => (
          <div key={g.value}>
            <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'var(--surface-2)' }}>
              <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>{g.value}</span>
              <span className="text-sm font-black tabular-nums" style={{ color: 'var(--accent-deep)' }}>{g.weight.toFixed(2)} kg</span>
            </div>
            {g.children.length > 0 && <NestedBreakdown labels={labels} groups={g.children} depth={depth + 1} />}
          </div>
        ))}
      </div>
    </div>
  );
}
