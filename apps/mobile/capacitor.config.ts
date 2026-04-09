import type { CapacitorConfig } from '@capacitor/cli';

const appUrl = process.env.CAPACITOR_APP_URL || 'http://138.197.42.104:3002';
const isHttpUrl = appUrl.startsWith('http://');

const config: CapacitorConfig = {
  // Bundle ID — must match the ID you register in Play Store / App Store
  appId: 'mx.nexara.mobile',
  appName: 'Nexara',
  // Required by Capacitor; remote URL mode still needs a valid existing folder.
  webDir: 'public',
  server: {
    // Production mobile shell points to your deployed mobile app URL.
    // This avoids Next.js static-export limitations for dynamic routes.
    url: appUrl,
    // Always use 'https' as the WebView scheme even when the remote server is HTTP.
    // Capacitor proxies the HTTP content internally so the WebView sees a secure
    // origin — this is required for getUserMedia (camera) to work in the WebView.
    // `cleartext: true` allows the underlying network request to reach the HTTP server.
    androidScheme: 'https',
    cleartext: isHttpUrl,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  android: {
    // Minimum SDK to target; 24 covers ~99 % of active Android devices
    minWebViewVersion: 80,
  },
  ios: {
    // Allows mixed HTTP/HTTPS in dev builds; remove for production
    // allowsLinkPreview: false,
  },
};

export default config;
