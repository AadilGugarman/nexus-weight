import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
}

export default function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizeOptions = [25, 50, 100] }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  if (total === 0) return null;

  return (
    <div className="mt-4 flex items-center gap-2 rounded-xl px-2.5 py-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      {/* page-size segmented toggle */}
      <div className="flex items-center gap-0.5 rounded-full p-0.5 shrink-0" style={{ background: 'var(--surface-2)' }}>
        {pageSizeOptions.map((n) => (
          <button
            key={n}
            onClick={() => onPageSizeChange(n)}
            className="rounded-full px-2 py-1 text-[10px] font-bold tabular-nums transition"
            style={n === pageSize ? { background: 'var(--accent)', color: 'var(--accent-fg)' } : { color: 'var(--text-faint)' }}
          >
            {n}
          </button>
        ))}
      </div>

      {/* result range */}
      <span className="flex-1 min-w-0 text-center text-[11px] font-semibold tabular-nums truncate" style={{ color: 'var(--text-faint)' }}>
        {start}–{end} <span className="opacity-60">of</span> {total}
      </span>

      {/* prev/next */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className="w-7 h-7 flex items-center justify-center rounded-lg disabled:opacity-30 transition active:scale-95"
          style={{ background: 'var(--surface-2)', color: 'var(--text)' }}
        >
          <ChevronLeft size={15} />
        </button>
        <span className="min-w-[38px] text-center text-[11px] font-black tabular-nums" style={{ color: 'var(--text)' }}>
          {page}/{totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          className="w-7 h-7 flex items-center justify-center rounded-lg disabled:opacity-30 transition active:scale-95"
          style={{ background: 'var(--surface-2)', color: 'var(--text)' }}
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
