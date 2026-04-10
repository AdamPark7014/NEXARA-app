/**
 * Misma superficie que en web: SW `showNotification` cuando existe, fallback a `Notification`.
 */
export type BrowserHeadsUpOptions = {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  priority?: 'high' | 'normal' | 'low';
};

type SwShowNotificationOpts = {
  body?: string;
  tag?: string;
  renotify?: boolean;
  requireInteraction?: boolean;
  silent?: boolean;
  data?: unknown;
  vibrate?: number[];
  actions?: ReadonlyArray<{ action: string; title: string }>;
};

export async function showBrowserHeadsUpNotification(opts: BrowserHeadsUpOptions): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (window.Notification.permission !== 'granted') return false;

  const isHigh = opts.priority === 'high';
  const tag = opts.tag || `nexara-${Date.now()}`;

  try {
    const reg =
      (await navigator.serviceWorker?.getRegistration?.('/')) ||
      (await navigator.serviceWorker?.getRegistration?.());

    if (reg && typeof reg.showNotification === 'function') {
      const swOpts: SwShowNotificationOpts = {
        body: opts.body,
        tag,
        renotify: true,
        requireInteraction: isHigh,
        silent: false,
        data: { url: opts.url || '/' },
        vibrate: isHigh ? [140, 50, 140, 50, 140] : [100, 40, 100],
        actions: [{ action: 'open', title: 'Abrir' }],
      };
      await reg.showNotification(opts.title, swOpts as NotificationOptions);
      return true;
    }

    new window.Notification(opts.title, { body: opts.body, tag });
    return true;
  } catch {
    return false;
  }
}
