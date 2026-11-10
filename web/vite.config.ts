/// <reference types="vite/client" />

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The API lives behind an SSH tunnel on the developer's machine and requires a bearer
 * token. The token is injected here, in Node, so it never reaches the browser bundle.
 * Missing token is a hard failure: silently falling back would either break every
 * request or, worse, push us toward disabling auth.
 */
// Minimal local declaration keeps the config typed without adding @types/node.
declare const process: { env: Record<string, string | undefined> };

const token = process.env.QW_API_TOKEN;
if (!token) {
  throw new Error(
    'QW_API_TOKEN is not set. Start the dev server with the API token in the environment, e.g. in PowerShell: $env:QW_API_TOKEN="..."; npm run dev',
  );
}

const apiTarget = process.env.QW_API_TARGET ?? 'http://127.0.0.1:8022';

export default defineConfig({
  plugins: [react()],
  server: {
    // Keep the dev server on loopback: it injects the token on your behalf, so anyone
    // who can reach it can use your credentials.
    host: '127.0.0.1',
    port: 5273,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: false,
        headers: { authorization: `Bearer ${token}` },
      },
      '/health': {
        target: apiTarget,
        changeOrigin: false,
      },
    },
  },
});
