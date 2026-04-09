import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Tiendas / producción: CAPACITOR_SERVER_URL=https://app.tudominio.com
 * Desarrollo IP: CAPACITOR_SERVER_URL=http://138.197.42.104:3002 (+ cleartext implícito si es http)
 * Sin servidor remoto (solo webDir): CAPACITOR_SERVER_URL=bundled
 */
const fromEnv = (process.env.CAPACITOR_SERVER_URL || process.env.CAPACITOR_APP_URL || "").trim();
const rawServer = fromEnv.length > 0 ? fromEnv : "http://138.197.42.104:3002";
const useRemoteServer = rawServer !== "bundled" && rawServer !== "local";
const serverUrl = useRemoteServer ? rawServer : "";
const isHttpUrl = useRemoteServer && serverUrl.startsWith("http://");
const allowCleartext =
  process.env.CAPACITOR_ALLOW_CLEARTEXT === "1" ||
  process.env.CAPACITOR_ALLOW_CLEARTEXT === "true" ||
  isHttpUrl;

const webDir = (process.env.CAPACITOR_WEB_DIR || 'public').trim();

const config: CapacitorConfig = {
  appId: 'mx.nexara.mobile',
  appName: 'Nexara',
  webDir,
  ...(useRemoteServer
    ? {
        server: {
          url: serverUrl,
          androidScheme: 'https',
          cleartext: allowCleartext,
        },
      }
    : {}),
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  android: {
    minWebViewVersion: 80,
  },
  ios: {},
};

export default config;
