import type { CapacitorConfig } from '@capacitor/cli';

const appUrl = process.env.CAPACITOR_APP_URL || 'https://nexara.com.mx/login';

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
    androidScheme: 'https',
    cleartext: false,
  },
  plugins: {
    // Push notifications (add @capacitor/push-notifications if needed)
    // SplashScreen: {
    //   launchShowDuration: 2000,
    // },
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
