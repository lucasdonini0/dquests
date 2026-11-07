import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [react()],
  base: './',
  // builds do Electron e do Android travam o watcher (EBUSY) e deixam o dev servindo código velho
  server: { port: 5173, watch: { ignored: ['**/release/**', '**/android/**', '**/dist/**'] } },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
