import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  const env = loadEnv(mode, root, 'REACT_APP_GOOGLE_CLIENT_ID');
  return {
    root,
    plugins: [react(), ...(demo ? [{
      name: 'synthetic-demo-entry',
      transformIndexHtml: {
        order: 'pre',
        handler: html => html.replace('/src/index.jsx', '/scripts/fixtures/entry.js'),
      },
    }] : [])],
    // Preserve the existing setting, and expose only this specific identifier.
    define: { 'process.env.REACT_APP_GOOGLE_CLIENT_ID': JSON.stringify(demo ? 'fixture-only' : (env.REACT_APP_GOOGLE_CLIENT_ID || '')) },
    resolve: { alias: demo ? { '@react-oauth/google': fileURLToPath(new URL('./scripts/fixtures/google.js', import.meta.url)) } : {} },
    server: {
      host: '127.0.0.1', port: 3000, strictPort: true, open: false,
      fs: {
        allow: [root],
        deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx}', '**/.git/**', '**/.publication-audit/**', '**/review/**', '**/private/**', '**/backups/**', '**/output/**', '**/.playwright-cli/**'],
      },
    },
    preview: { host: '127.0.0.1', port: 3001, strictPort: true, open: false },
    build: { outDir: demo ? '.preview-build' : 'build' },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/setupTests.js'],
      include: ['src/**/*.test.{js,jsx}'],
      environmentOptions: { jsdom: { url: 'http://localhost:3000' } },
    },
  };
});
