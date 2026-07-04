import { create } from 'zustand';
import { useStore } from '../store/useStore';

/**
 * Company phone/address are secondary contact fields not covered by the
 * profiles.company_name migration — they remain device-local (localStorage).
 * The company name itself is authoritative in `profiles.company_name`
 * (see useStore's companyName / updateCompanyName) and synced across devices.
 */
export interface CompanyContact {
  companyPhone: string;
  companyAddress: string;
}

const KEY = 'companyProfile';

function load(): CompanyContact {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { companyPhone: '', companyAddress: '', ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { companyPhone: '', companyAddress: '' };
}

interface SettingsState extends CompanyContact {
  setProfile: (p: Partial<CompanyContact>) => void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...load(),
  setProfile: (p) => {
    const next = { ...get(), ...p };
    const { companyPhone, companyAddress } = next;
    localStorage.setItem(KEY, JSON.stringify({ companyPhone, companyAddress }));
    set({ companyPhone, companyAddress });
  },
}));

/** Non-hook accessor for use in share/PDF helpers (outside React). */
export function getCompanyProfile(): { companyName: string; companyPhone: string; companyAddress: string } {
  return { companyName: useStore.getState().companyName || '', ...load() };
}

/** Non-hook accessor for the business's configured custom labels (outside React). */
export function getBusinessLabels(): { customLabel1: string; customLabel2: string; customLabel3: string } {
  const s = useStore.getState();
  return { customLabel1: s.customLabel1 || '', customLabel2: s.customLabel2 || '', customLabel3: s.customLabel3 || '' };
}

/** Non-hook accessor for catalog values + their Linked Values (outside React) — lets share.ts derive which label pairs are actually linked. */
export function getCatalogLinkData(): { catalogValues: import('../types').CatalogValue[]; catalogValueLinks: import('../types').CatalogValueLink[] } {
  const s = useStore.getState();
  return { catalogValues: s.catalogValues, catalogValueLinks: s.catalogValueLinks };
}
