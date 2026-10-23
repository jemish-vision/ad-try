// Silence Vite Node API CJS deprecation warning
process.env.VITE_CJS_IGNORE_WARNING = 'true';

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import envCompatible from 'vite-plugin-env-compatible';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const reactAppEnv = {};
  for (const key in env) {
    if (key.startsWith('REACT_APP_') || key === 'NODE_ENV') {
      reactAppEnv[`process.env.${key}`] = JSON.stringify(env[key]);
    }
  }

  return {
    plugins: [
      react(),
      svgr({
        svgrOptions: {
          icon: true,
        },
      }),
      envCompatible({ prefix: 'REACT_APP_' }),
    ],
    resolve: {
      alias: {
        src: path.resolve(__dirname, './src'),
        components: path.resolve(__dirname, './src/components'),
        utils: path.resolve(__dirname, './src/lib/utils'),
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
          silenceDeprecations: [
            'legacy-js-api',
            'import',
            'global-builtin',
            'color-functions',
            'mixed-decls',
          ],
          quietDeps: true,
        },
      },
    },
    esbuild: {
      loader: 'jsx',
      include: /src\/.*\.jsx?$/,
      exclude: [],
    },
    optimizeDeps: {
      esbuildOptions: {
        loader: {
          '.js': 'jsx',
        },
      },
    },
    define: {
      ...reactAppEnv,
      'process.env': JSON.stringify(env),
      global: 'window',
    },
    server: {
      port: 3000,
      open: false,
    },
    build: {
      outDir: 'build',
      sourcemap: false,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const cleanId = id.replace(/\\/g, '/');
            if (cleanId.includes('/node_modules/')) {
              // React Core, State Management & Time
              if (
                cleanId.includes('/node_modules/react/') ||
                cleanId.includes('/node_modules/react-dom/') ||
                cleanId.includes('/node_modules/react-router/') ||
                cleanId.includes('/node_modules/react-router-dom/') ||
                cleanId.includes('/node_modules/redux/') ||
                cleanId.includes('/node_modules/react-redux/') ||
                cleanId.includes('/node_modules/@reduxjs/') ||
                cleanId.includes('/node_modules/@tanstack/react-query/') ||
                cleanId.includes('/node_modules/moment') ||
                cleanId.includes('/node_modules/date-fns')
              ) {
                return 'vendor-react-core';
              }

              // AG Grid suite
              if (cleanId.includes('/node_modules/ag-grid-')) {
                return 'vendor-ag-grid';
              }

              // Charting libraries
              if (
                cleanId.includes('/node_modules/recharts/') ||
                cleanId.includes('/node_modules/apexcharts/') ||
                cleanId.includes('/node_modules/react-apexcharts/') ||
                cleanId.includes('/node_modules/chart.js/') ||
                cleanId.includes('/node_modules/react-google-charts/')
              ) {
                return 'vendor-charts';
              }

              // FullCalendar suite
              if (cleanId.includes('/node_modules/@fullcalendar/')) {
                return 'vendor-fullcalendar';
              }

              // Icon suites
              if (
                cleanId.includes('/node_modules/react-icons/') ||
                cleanId.includes('/node_modules/lucide-react/') ||
                cleanId.includes('/node_modules/@phosphor-icons/') ||
                cleanId.includes('/node_modules/@fortawesome/')
              ) {
                return 'vendor-icons';
              }

              // UI Component Suites (MUI, Emotion, PrimeReact, RSuite, Mantine, Radix)
              if (
                cleanId.includes('/node_modules/@mui/') ||
                cleanId.includes('/node_modules/@material-ui/') ||
                cleanId.includes('/node_modules/@emotion/') ||
                cleanId.includes('/node_modules/primereact/') ||
                cleanId.includes('/node_modules/rsuite/') ||
                cleanId.includes('/node_modules/@mantine/') ||
                cleanId.includes('/node_modules/@radix-ui/') ||
                cleanId.includes('/node_modules/bootstrap/') ||
                cleanId.includes('/node_modules/react-bootstrap/') ||
                cleanId.includes('/node_modules/react-toastify/')
              ) {
                return 'vendor-ui-libs';
              }

              // Drag and drop libraries
              if (
                cleanId.includes('/node_modules/@dnd-kit/') ||
                cleanId.includes('/node_modules/react-beautiful-dnd/')
              ) {
                return 'vendor-dnd';
              }

              // PDF and Spreadsheet processing (pure dynamic on-demand)
              if (
                cleanId.includes('/node_modules/jspdf/') ||
                cleanId.includes('/node_modules/xlsx/') ||
                cleanId.includes('/node_modules/pdf-lib/') ||
                cleanId.includes('/node_modules/html2canvas/')
              ) {
                return 'vendor-pdf-excel';
              }

              // Internationalization
              if (
                cleanId.includes('/node_modules/i18next/') ||
                cleanId.includes('/node_modules/react-i18next/') ||
                cleanId.includes('/node_modules/i18next-browser-languagedetector/')
              ) {
                return 'vendor-i18n';
              }

              // Forms and validations
              if (
                cleanId.includes('/node_modules/formik/') ||
                cleanId.includes('/node_modules/react-hook-form/') ||
                cleanId.includes('/node_modules/react-hooks-useform/') ||
                cleanId.includes('/node_modules/yup/') ||
                cleanId.includes('/node_modules/zod/')
              ) {
                return 'vendor-forms';
              }

              // Firebase
              if (cleanId.includes('/node_modules/firebase/')) {
                return 'vendor-firebase';
              }

              // General utilities
              if (
                cleanId.includes('/node_modules/lodash/') ||
                cleanId.includes('/node_modules/axios/') ||
                cleanId.includes('/node_modules/file-saver/') ||
                cleanId.includes('/node_modules/clsx/') ||
                cleanId.includes('/node_modules/tailwind-merge/') ||
                cleanId.includes('/node_modules/class-variance-authority/')
              ) {
                return 'vendor-utils';
              }
            }
          },
        },
      },
    },
  };
});
