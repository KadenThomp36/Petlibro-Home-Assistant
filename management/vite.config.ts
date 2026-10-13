import tailwindcss from '@tailwindcss/vite';
import { devtools } from '@tanstack/devtools-vite';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';

import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

const basePath = normalizeBasePath(process.env.PETLIBRO_MANAGEMENT_BASE_PATH);
const serverBasePath = normalizeBasePath(
  process.env.PETLIBRO_MANAGEMENT_SERVER_BASE_PATH ??
    process.env.PETLIBRO_MANAGEMENT_BASE_PATH,
);

const config = defineConfig({
  base: basePath,
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    nitro({
      baseURL: serverBasePath,
      entry: './server/runtime/node-server.ts',
      features: { websocket: true },
      rollupConfig: { external: [/^@sentry\//] },
      serverDir: './server',
    }),
    tailwindcss(),
    tanstackStart({
      spa: {
        enabled: true,
      },
    }),
    viteReact(),
  ],
});

export default config;

function normalizeBasePath(value: string | undefined): string {
  if (value === undefined || value.trim() === '' || value.trim() === '/') {
    return '/';
  }

  return `/${value.trim().replace(/^\/+|\/+$/g, '')}/`;
}
