import { Capacitor } from '@capacitor/core';

/** True when running inside the native Capacitor Android/iOS shell. */
export const isNative = (): boolean => Capacitor.isNativePlatform();

/** Current platform: 'android' | 'ios' | 'web'. */
export const platform = (): string => Capacitor.getPlatform();

export const isAndroid = (): boolean => Capacitor.getPlatform() === 'android';

/** Whether a given Capacitor plugin is available at runtime. */
export const hasPlugin = (name: string): boolean => Capacitor.isPluginAvailable(name);
