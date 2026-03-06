import { sentryVitePlugin } from '@sentry/vite-plugin';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import dotenv from 'dotenv';

dotenv.config({
  path: path.resolve(__dirname, `../../.env.${process.env.NODE_ENV}`)
});

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    TanStackRouterVite({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    sentryVitePlugin({
      org: 'liveonit',
      project: 'gira',
      url: 'https://sentry.internal.liveonit.com/'
    })
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@livonit/shared':
        mode === 'development'
          ? path.resolve(__dirname, '../../packages/shared/src/index.ts')
          : '@livonit/shared'
    },
    conditions:
      mode === 'development'
        ? ['development', 'import', 'module', 'browser', 'default']
        : undefined
  },

  define: {
    'process.env': process.env
  },

  optimizeDeps: {
    exclude: [
      '@livonit/shared',
      '@nestjs/mapped-types',
      '@nestjs/common',
      'class-transformer',
      'class-validator'
    ],
    esbuildOptions: {
      target: 'ES2022',
      external: [
        'class-transformer/storage',
        '@nestjs/*',
        '@nestjs/mapped-types'
      ]
    }
  },

  build: {
    sourcemap: true,
    commonjsOptions: {
      include: [/node_modules/, /packages\/shared/]
    },
    rollupOptions: {
      external: id => {
        return (
          id.includes('class-transformer/storage') ||
          id.includes('@nestjs/mapped-types')
        );
      }
    }
  },

  server: {
    watch: {
      ignored: ['!**/packages/shared/src/**']
    }
  }
}));
