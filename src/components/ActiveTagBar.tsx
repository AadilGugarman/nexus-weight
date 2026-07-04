import { useMemo } from "react";
import { Tag, ChevronRight } from "lucide-react";
import ChipPicker from "./ChipPicker";
import { useStore } from "../store/useStore";
import { explicitLinkedChildren, findCatalogValueId } from "../lib/catalogLinks";
import type { CatalogFieldNumber } from "../types";

export interface ActiveTagField {
  n: CatalogFieldNumber;
  label: string;
  value: string;
  set: (v: string) => void;
  parentFieldNumber?: CatalogFieldNumber;
  parentValue?: string;
  parentLabel?: string;
}

/** Active Tag Mode — hierarchical tag selection for live weighing.
 * 
 * Behavior:
 * - Initially shows only Label 1 tags
 * - Selecting a Label 1 tag shows selected Label 1 > its children in same row, all Label 1 in second row
 * - Selecting a child shows the hierarchy appropriately
 * - Weight is saved against the CURRENTLY SELECTED TAG
 */
export default function ActiveTagBar({ fields }: { fields: ActiveTagField[] }) {
  const catalogValues = useStore((s) => s.catalogValues);
  const catalogValueLinks = useStore((s) => s.catalogValueLinks);

  // Get the active fields (only those with labels configured)
  const [field1, field2, field3] = fields;
  
  // Determine which level is currently selected based on which values are set
  const hasValue1 = field1?.value.trim();
  const hasValue2 = field2?.value.trim();
  const hasValue3 = field3?.value.trim();

  // The selected level is the deepest level with a value
  const selectedLevel: 1 | 2 | 3 | null = hasValue3 ? 3 : hasValue2 ? 2 : hasValue1 ? 1 : null;

  // Check if the currently selected value has children
  const selectedHasChildren = useMemo(() => {
    if (!selectedLevel) return false;
    
    const selectedField = fields[selectedLevel - 1];
    if (!selectedField?.value) return false;

    const valueId = findCatalogValueId(catalogValues, selectedField.n, selectedField.value);
    if (!valueId) return false;

    const nextFieldIdx = selectedLevel;
    if (nextFieldIdx >= fields.length) return false;
    
    const nextField = fields[nextFieldIdx];
    if (!nextField?.label) return false;

    // Use explicitLinkedChildren to only show actual linked children, not all unlinked values
    const children = explicitLinkedChildren(catalogValues, catalogValueLinks, valueId, nextField.n);
    return children.length > 0;
  }, [selectedLevel, fields, catalogValues, catalogValueLinks]);

  // Handler for selecting/changing a tag at any level
  const selectTag = (fieldIndex: 0 | 1 | 2, value: string) => {
    const field = fields[fieldIndex];
    if (!field) return;

    // Set the value for this field
    field.set(value);

    // Clear all deeper levels
    if (fieldIndex === 0) {
      fields[1]?.set("");
      fields[2]?.set("");
    } else if (fieldIndex === 1) {
      fields[2]?.set("");
    }
  };

  // Get all Label 1 values for display
  const allLabel1Values = useMemo(() => {
    if (!field1) return [];
    return catalogValues
      .filter((v) => !v.is_deleted && v.field_number === field1.n)
      .sort((a, b) => a.value.localeCompare(b.value));
  }, [catalogValues, field1]);

  return (
    <div
      className="mb-3 rounded-xl p-2"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <p
        className="text-[9px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1"
        style={{ color: "var(--text-faint)" }}
      >
        <Tag size={10} /> Active tag
      </p>

      {/* RULE 1: Initial State - Show only Label 1 tags when nothing is selected */}
      {!selectedLevel && field1 && (
        <div>
          <p
            className="text-[9px] font-semibold mb-1 truncate"
            style={{ color: "var(--text-faint)" }}
          >
            {field1.label}
          </p>
          <ChipPicker
            fieldNumber={field1.n}
            value=""
            onChange={(v) => selectTag(0, v)}
            placeholder={field1.label}
          />
        </div>
      )}

      {/* RULE 2: Label 1 selected - Show selected Label 1 > children in SAME ROW, all Label 1 in second row */}
      {selectedLevel === 1 && field1 && field2 && (
        <>
          {/* Row 1: Selected Label 1 > its children (SAME ROW with arrow) */}
          <div className="mb-2">
            <p
              className="text-[9px] font-semibold mb-1 truncate"
              style={{ color: "var(--text-faint)" }}
            >
              {field1.label} › {field2.label}
            </p>
            <div className="flex flex-wrap items-start gap-1.5">
              {/* Show selected Label 1 as a badge */}
              <button
                type="button"
                onClick={() => selectTag(0, field1.value)}
                className="px-3.5 py-2 rounded-lg text-sm font-bold transition active:scale-95 whitespace-nowrap"
                style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                {field1.value}
              </button>
              
              {/* Arrow separator */}
              <div className="flex items-center" style={{ paddingTop: '0.5rem' }}>
                <ChevronRight size={16} style={{ color: 'var(--text-faint)' }} className="shrink-0" />
              </div>
              
              {/* Label 2 children in same row - wrap naturally */}
              <div className="flex-1 min-w-0">
                <ChipPicker
                  fieldNumber={field2.n}
                  value=""
                  onChange={(v) => selectTag(1, v)}
                  placeholder={field2.label}
                  parentFieldNumber={field1.n}
                  parentValue={field1.value}
                  parentLabel={field1.label}
                />
              </div>
            </div>
          </div>

          {/* Row 2: All Label 1 tags (for switching categories) */}
          <div>
            <p
              className="text-[9px] font-semibold mb-1 truncate"
              style={{ color: "var(--text-faint)" }}
            >
              {field1.label}
            </p>
            <ChipPicker
              fieldNumber={field1.n}
              value={field1.value}
              onChange={(v) => selectTag(0, v)}
              placeholder={field1.label}
            />
          </div>
        </>
      )}

      {/* RULE 3 & 4: Label 2 selected */}
      {selectedLevel === 2 && field1 && field2 && (
        <>
          {selectedHasChildren && field3 ? (
            /* Label 2 HAS children - Show Active Label 1 > Label 2 siblings in Row 1, Label 3 children in Row 2 */
            <>
              {/* Row 1: Active Label 1 > Selected Label 2 siblings (SAME ROW) */}
              <div className="mb-2">
                <p
                  className="text-[9px] font-semibold mb-1 truncate"
                  style={{ color: "var(--text-faint)" }}
                >
                  {field1.value} › {field2.label}
                </p>
                <div className="flex flex-wrap items-start gap-1.5">
                  {/* Show active Label 1 as a badge */}
                  <button
                    type="button"
                    onClick={() => selectTag(0, field1.value)}
                    className="px-3.5 py-2 rounded-lg text-sm font-bold transition active:scale-95 whitespace-nowrap"
                    style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
                  >
                    {field1.value}
                  </button>
                  
                  {/* Arrow separator */}
                  <div className="flex items-center" style={{ paddingTop: '0.5rem' }}>
                    <ChevronRight size={16} style={{ color: 'var(--text-faint)' }} className="shrink-0" />
                  </div>
                  
                  {/* Label 2 siblings in same row */}
                  <div className="flex-1 min-w-0">
                    <ChipPicker
                      fieldNumber={field2.n}
                      value={field2.value}
                      onChange={(v) => selectTag(1, v)}
                      placeholder={field2.label}
                      parentFieldNumber={field1.n}
                      parentValue={field1.value}
                      parentLabel={field1.label}
                    />
                  </div>
                </div>
              </div>

              {/* Row 2: Label 3 children */}
              <div>
                <p
                  className="text-[9px] font-semibold mb-1 truncate"
                  style={{ color: "var(--text-faint)" }}
                >
                  {field3.label}
                </p>
                <ChipPicker
                  fieldNumber={field3.n}
                  value=""
                  onChange={(v) => selectTag(2, v)}
                  placeholder={field3.label}
                  parentFieldNumber={field2.n}
                  parentValue={field2.value}
                  parentLabel={field2.label}
                />
              </div>
            </>
          ) : (
            /* Label 2 has NO children - Show only Active Label 1 > Selected Label 2 badge */
            <div>
              <p
                className="text-[9px] font-semibold mb-1 truncate"
                style={{ color: "var(--text-faint)" }}
              >
                {field1.value} › {field2.value}
              </p>
              <div className="flex flex-wrap items-start gap-1.5">
                {/* Show active Label 1 as a badge */}
                <button
                  type="button"
                  onClick={() => selectTag(0, field1.value)}
                  className="px-3.5 py-2 rounded-lg text-sm font-bold transition active:scale-95 whitespace-nowrap"
                  style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
                >
                  {field1.value}
                </button>
                
                {/* Arrow separator */}
                <div className="flex items-center" style={{ paddingTop: '0.5rem' }}>
                  <ChevronRight size={16} style={{ color: 'var(--text-faint)' }} className="shrink-0" />
                </div>
                
                {/* Show selected Label 2 as a badge (no siblings, no children) */}
                <button
                  type="button"
                  onClick={() => selectTag(1, field2.value)}
                  className="px-3.5 py-2 rounded-lg text-sm font-bold transition active:scale-95 whitespace-nowrap"
                  style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
                >
                  {field2.value}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Label 3 selected - Show Active Label 1 > Label 2 > Label 3 */}
      {selectedLevel === 3 && field1 && field2 && field3 && (
        <>
          {/* Row 1: Active Label 1 > Label 2 siblings (SAME ROW) */}
          <div className="mb-2">
            <p
              className="text-[9px] font-semibold mb-1 truncate"
              style={{ color: "var(--text-faint)" }}
            >
              {field1.value} › {field2.label}
            </p>
            <div className="flex flex-wrap items-start gap-1.5">
              {/* Show active Label 1 as a badge */}
              <button
                type="button"
                onClick={() => selectTag(0, field1.value)}
                className="px-3.5 py-2 rounded-lg text-sm font-bold transition active:scale-95 whitespace-nowrap"
                style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                {field1.value}
              </button>
              
              {/* Arrow separator */}
              <div className="flex items-center" style={{ paddingTop: '0.5rem' }}>
                <ChevronRight size={16} style={{ color: 'var(--text-faint)' }} className="shrink-0" />
              </div>
              
              {/* Label 2 siblings in same row */}
              <div className="flex-1 min-w-0">
                <ChipPicker
                  fieldNumber={field2.n}
                  value={field2.value}
                  onChange={(v) => selectTag(1, v)}
                  placeholder={field2.label}
                  parentFieldNumber={field1.n}
                  parentValue={field1.value}
                  parentLabel={field1.label}
                />
              </div>
            </div>
          </div>

          {/* Row 2: Label 3 siblings */}
          <div>
            <p
              className="text-[9px] font-semibold mb-1 truncate"
              style={{ color: "var(--text-faint)" }}
            >
              {field3.label}
            </p>
            <ChipPicker
              fieldNumber={field3.n}
              value={field3.value}
              onChange={(v) => selectTag(2, v)}
              placeholder={field3.label}
              parentFieldNumber={field2.n}
              parentValue={field2.value}
              parentLabel={field2.label}
            />
          </div>
        </>
      )}
    </div>
  );
}
