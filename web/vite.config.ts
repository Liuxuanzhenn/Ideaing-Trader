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

const apiTarget = process.env.QW_API_TARGET ?? 'http://127.0.0.1:8022';

export default defineConfig(({ command }) => {
  // 只有 dev proxy 需要 token；build 不代理任何请求，无 token 也必须通过。
  const token = process.env.QW_API_TOKEN;
  if (command === 'serve' && !token) {
    throw new Error(
      'QW_API_TOKEN is not set. Start dev/preview with the API token in the environment, e.g. in PowerShell: $env:QW_API_TOKEN="..."; npm run dev  (or npm run preview)',
    );
  }

  // dev 与 preview 共用同一份代理：token 只在 Node 层注入，浏览器永远拿不到
  const proxy = {
    '/api': {
      target: apiTarget,
      changeOrigin: false,
      headers: { authorization: `Bearer ${token ?? ''}` },
    },
    '/health': {
      target: apiTarget,
      changeOrigin: false,
    },
  };

  return {
  plugins: [react()],
  server: {
    // Keep the dev server on loopback: it injects the token on your behalf, so anyone
    // who can reach it can use your credentials.
    host: '127.0.0.1',
    port: 5273,
    proxy,
  },
  // 生产构建预览：dist 是静态文件，但 /api 仍由这里的 dev server 进程代理，
  // token 同样只存在于 Node 层；缺 token 在 serve 分支已硬失败，不会静默无凭证转发。
  preview: {
    host: '127.0.0.1',
    port: 5274,
    proxy,
  },
  };
});
