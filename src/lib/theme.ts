import { create } from 'zustand';

export type ThemeName = 'lime' | 'blue' | 'purple' | 'rose' | 'emerald' | 'indigo';
export type Mode = 'dark' | 'light' | 'system';

export const THEMES: { id: ThemeName; label: string; color: string; deep: string }[] = [
  { id: 'lime', label: 'Amber', color: '#f59e0b', deep: '#b45309' },
  { id: 'blue', label: 'Blue', color: '#3b82f6', deep: '#1d4ed8' },
  { id: 'purple', label: 'Purple', color: '#a855f7', deep: '#7e22ce' },
  { id: 'rose', label: 'Rose', color: '#e11d48', deep: '#be123c' },
  { id: 'emerald', label: 'Emerald', color: '#10b981', deep: '#047857' },
  { id: 'indigo', label: 'Indigo', color: '#6366f1', deep: '#4338ca' },
];

/** Full color palette per theme, used by share/receipt/PDF so they follow the selected accent. */
export const THEME_COLORS: Record<ThemeName, { accent: string; deep: string; accentRgb: [number, number, number]; deepRgb: [number, number, number] }> = {
  lime:    { accent: '#f59e0b', deep: '#b45309', accentRgb: [0.961, 0.620, 0.043], deepRgb: [0.706, 0.325, 0.035] },
  blue:    { accent: '#3b82f6', deep: '#1d4ed8', accentRgb: [0.231, 0.510, 0.965], deepRgb: [0.114, 0.306, 0.847] },
  purple:  { accent: '#a855f7', deep: '#7e22ce', accentRgb: [0.659, 0.333, 0.969], deepRgb: [0.494, 0.133, 0.808] },
  rose:    { accent: '#e11d48', deep: '#be123c', accentRgb: [0.882, 0.114, 0.282], deepRgb: [0.745, 0.071, 0.235] },
  emerald: { accent: '#10b981', deep: '#047857', accentRgb: [0.063, 0.725, 0.506], deepRgb: [0.016, 0.471, 0.341] },
  indigo:  { accent: '#6366f1', deep: '#4338ca', accentRgb: [0.388, 0.400, 0.945], deepRgb: [0.263, 0.220, 0.792] },
};

export function currentThemeName(): ThemeName {
  const t = localStorage.getItem('theme') as ThemeName;
  return t && t in THEME_COLORS ? t : 'indigo';
}
export function currentThemeColors() {
  return THEME_COLORS[currentThemeName()];
}

interface ThemeState {
  theme: ThemeName;
  mode: Mode;
  setTheme: (t: ThemeName) => void;
  setMode: (m: Mode) => void;
}

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

/** 'system' resolves to the OS preference at apply time; the matchMedia
 * listener below re-applies whenever the OS setting flips. */
function resolveMode(mode: Mode): 'dark' | 'light' {
  return mode === 'system' ? (systemDark.matches ? 'dark' : 'light') : mode;
}

function apply(theme: ThemeName, mode: Mode) {
  const el = document.documentElement;
  el.setAttribute('data-theme', theme);
  el.setAttribute('data-mode', resolveMode(mode));
}

const initTheme = currentThemeName();
const initMode = (localStorage.getItem('mode') as Mode) || 'dark';
apply(initTheme, initMode);

export const useTheme = create<ThemeState>((set, get) => ({
  theme: initTheme,
  mode: initMode,
  setTheme: (t) => { localStorage.setItem('theme', t); apply(t, get().mode); set({ theme: t }); },
  setMode: (m) => { localStorage.setItem('mode', m); apply(get().theme, m); set({ mode: m }); },
}));

systemDark.addEventListener('change', () => {
  const { theme, mode } = useTheme.getState();
  if (mode === 'system') apply(theme, mode);
});
