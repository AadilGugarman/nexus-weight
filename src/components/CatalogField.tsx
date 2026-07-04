import { useMemo } from 'react';
import Dropdown from './Dropdown';
import { useStore } from '../store/useStore';
import { findCatalogValueId, linkedChildren } from '../lib/catalogLinks';
import type { CatalogFieldNumber } from '../types';

interface Props {
  fieldNumber: CatalogFieldNumber;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** When set, this field's options are restricted to values linked from
   * `parentValue` (looked up by text on `parentFieldNumber`) — or every
   * value of this field if the parent has no links yet. Pass both together,
   * or neither for an unlinked field. */
  parentFieldNumber?: CatalogFieldNumber;
  parentValue?: string;
  /** Label of the parent field, only used for the "select parent first" placeholder. */
  parentLabel?: string;
  /** shorter control (h-9, smaller icon/text) — for compact catalog management screens */
  compact?: boolean;
  /** force typed text to display uppercase */
  uppercase?: boolean;
}

/** Search-or-type-or-create picker for one of the business's 3 dynamic
 * catalog fields (e.g. a fruit trader's Category values). Selecting or
 * creating a value just yields its text — loads store custom_field_1/2/3 as
 * plain text, so there's no id indirection to manage here. Reused by
 * LoadPicker (Load Entry) and the Catalogs settings page (quick-add).
 *
 * When `parentFieldNumber`/`parentValue` are supplied (Linked Values), only
 * values linked from the resolved parent catalog value are offered, and
 * newly-created values are auto-linked under that parent. */
export default function CatalogField({ fieldNumber, value, onChange, placeholder, disabled, parentFieldNumber, parentValue, parentLabel, compact, uppercase }: Props) {
  const catalogValues = useStore((s) => s.catalogValues);
  const catalogValueLinks = useStore((s) => s.catalogValueLinks);
  const addCatalogValue = useStore((s) => s.addCatalogValue);

  const isChild = parentFieldNumber != null;
  const parentId = useMemo(
    () => (isChild ? findCatalogValueId(catalogValues, parentFieldNumber, parentValue || '') : undefined),
    [catalogValues, isChild, parentFieldNumber, parentValue],
  );

  const options = useMemo(() => {
    if (!isChild) return catalogValues.filter((v) => !v.is_deleted && v.field_number === fieldNumber).map((v) => ({ value: v.value, label: v.value }));
    return linkedChildren(catalogValues, catalogValueLinks, parentId, fieldNumber).map((v) => ({ value: v.value, label: v.value }));
  }, [catalogValues, catalogValueLinks, fieldNumber, isChild, parentId]);

  const needsParentFirst = isChild && !parentValue?.trim();

  const handleCreate = async (text: string) => {
    const rec = await addCatalogValue(fieldNumber, text, isChild ? parentId : undefined);
    return rec.value;
  };

  return (
    <Dropdown
      value={value}
      onChange={onChange}
      options={options}
      placeholder={needsParentFirst ? `Select ${parentLabel || 'the parent value'} first` : (placeholder || 'Search or type…')}
      disabled={disabled || needsParentFirst}
      onCreate={handleCreate}
      createLabel={(t) => `Add "${t}"`}
      compact={compact}
      uppercase={uppercase}
    />
  );
}
