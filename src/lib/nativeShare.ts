import { isNative } from './platform';
import { registerPlugin } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

interface WhatsAppSharePlugin {
  share(opts: {
    uri: string;
    mimeType: string;
    phone?: string;
    text?: string;
  }): Promise<void>;
}

const WhatsAppShare = registerPlugin<WhatsAppSharePlugin>('WhatsAppShare');

/** Convert a Blob to a base64 string (no data: prefix). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      resolve(res.split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function canShareFile(filename: string, mimeType: string): boolean {
  if (isNative()) return true;
  if (!window.isSecureContext) return false;
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (!navigator.share || !nav.canShare) return false;
  try {
    const file = new File([new Blob(['share-test'], { type: mimeType })], filename, {
      type: mimeType,
    });
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Save a binary file to the device cache and open the native share sheet.
 * Falls back to a normal browser download when not running natively.
 */
export async function shareBinaryFile(opts: {
  filename: string;
  blob: Blob;
  mimeType: string;
  title?: string;
  text?: string;
}): Promise<'shared' | 'downloaded'> {
  const { filename, blob, mimeType, title, text } = opts;

  if (isNative()) {
    const base64 = await blobToBase64(blob);
    const write = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    });
    await Share.share({
      title: title || 'Nexus Weight',
      text: text || '',
      files: [write.uri],
      dialogTitle: title || 'Share',
    });
    return 'shared';
  }

  // Web fallback: try the Web Share API with files, else download visibly.
  const file = new File([blob], filename, { type: mimeType });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: title || 'Nexus Weight', text: text || '' });
      return 'shared';
    } catch (error) {
      if (isAbortError(error)) return 'shared';
      throw new Error('Share dialog was blocked by the browser. Please try again from the share button.');
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}

export async function shareWhatsAppFile(opts: {
  filename: string;
  blob: Blob;
  mimeType: string;
  phone?: string | null;
  text?: string;
}): Promise<'shared' | 'downloaded'> {
  const { filename, blob, mimeType, phone, text } = opts;
  if (isNative()) {
    const base64 = await blobToBase64(blob);
    const write = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    });
    try {
      await WhatsAppShare.share({
        uri: write.uri,
        mimeType,
        phone: phone || undefined,
        text: text || '',
      });
      return 'shared';
    } catch {
      await Share.share({
        title: 'Nexus Weight',
        text: text || '',
        files: [write.uri],
        dialogTitle: 'Share with WhatsApp',
      });
      return 'shared';
    }
  }
  return shareBinaryFile({
    filename,
    blob,
    mimeType,
    title: 'Nexus Weight',
    text,
  });
}

/**
 * Save a binary file directly to device storage — no share sheet. Native:
 * writes to the public Documents directory (visible to the user, e.g. via a
 * file manager), distinct from shareBinaryFile's Cache-dir + share-sheet
 * flow. Web: identical anchor-download fallback either way.
 */
export async function saveBinaryFile(opts: { filename: string; blob: Blob }): Promise<string> {
  const { filename, blob } = opts;
  if (isNative()) {
    const base64 = await blobToBase64(blob);
    const res = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Documents,
      recursive: true,
    });
    return res.uri;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return url;
}

/** Persist an app preference natively (survives app restarts) or in localStorage. */
export async function writeTextFile(filename: string, contents: string): Promise<string> {
  if (isNative()) {
    const res = await Filesystem.writeFile({
      path: filename,
      data: contents,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    return res.uri;
  }
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return url;
}
