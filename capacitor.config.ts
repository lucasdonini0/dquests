import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dquests.app',
  appName: 'dQuests',
  webDir: 'dist',
  backgroundColor: '#0b0a08',
  android: { allowMixedContent: false },
};

export default config;
