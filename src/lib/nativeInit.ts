import { isNative } from './platform';

/** One-time native (Android) setup: status bar, splash, back button, network. */
export async function initNative() {
  if (!isNative()) return;

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#1c1207' });
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch (e) { console.warn('[native] status bar', e); }

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch (e) { console.warn('[native] splash', e); }

  // Hardware back button: navigate back, or exit at the root.
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else App.exitApp();
    });
  } catch (e) { console.warn('[native] back button', e); }
}
