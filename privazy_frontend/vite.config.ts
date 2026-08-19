import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import {
  type PolyfillOptions,
  nodePolyfills,
} from 'vite-plugin-node-polyfills';

const nodePolyfillsFix = (options?: PolyfillOptions): Plugin => ({
  ...nodePolyfills(options),
  resolveId(source: string) {
    const m =
      /^vite-plugin-node-polyfills\/shims\/(buffer|global|process)$/.exec(
        source,
      );
    if (m) {
      return `./node_modules/vite-plugin-node-polyfills/shims/${m[1]}/dist/index.cjs`;
    }
  },
});

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [
    react(),
    nodePolyfillsFix({
      globals: {
        process: true,
        Buffer: true,
      },
    }),
  ],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    rollupOptions: {
      output: {
        assetFileNames: (info) => {
          if (info.name && /\.wasm$/.test(info.name)) console.log('wasm asset:', JSON.stringify(info));
          if (info.name === 'sqlite3.wasm' || info.name?.endsWith('/sqlite3.wasm')) return 'assets/sqlite3.wasm';
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
  optimizeDeps: {
    include: [
      'pino',
      'pino/browser',
      'sha3',
      'hash.js',
      'inherits',
      'minimalistic-assert',
      'bn.js',
      'lodash.chunk',
      'lodash.clonedeep',
      'lodash.clonedeepwith',
      'lodash.isequal',
      'lodash.merge',
      'lodash.omit',
      'lodash.pickby',
      'lodash.times',
      'json-stringify-deterministic',
    ],
    exclude: [
      '@aztec/noir-noirc_abi',
      '@aztec/noir-acvm_js',
      '@aztec/bb.js',
      '@aztec/noir-noir_js',
      '@aztec/kv-store',
      '@aztec/sqlite3mc-wasm',
      '@aztec/accounts',
      '@aztec/aztec.js',
      '@aztec/bb-prover',
      '@aztec/blob-lib',
      '@aztec/builder',
      '@aztec/constants',
      '@aztec/entrypoints',
      '@aztec/ethereum',
      '@aztec/foundation',
      '@aztec/key-store',
      '@aztec/l1-artifacts',
      '@aztec/native',
      '@aztec/noir-acvm_js',
      '@aztec/noir-contracts.js',
      '@aztec/noir-noir_codegen',
      '@aztec/noir-protocol-circuits-types',
      '@aztec/noir-types',
      '@aztec/protocol-contracts',
      '@aztec/pxe',
      '@aztec/simulator',
      '@aztec/standard-contracts',
      '@aztec/stdlib',
      '@aztec/telemetry-client',
      '@aztec/wallet-sdk',
      '@aztec/wallets',
      '@aztec/world-state',
    ],
    needsInterop: ['sha3'],
  },
  resolve: {
    alias: {
      // kv-store's #msgpackr resolves to the CJS `index-no-eval` in browsers,
      // whose UMD wrapper breaks Vite's named-export interop in dev. Use the ESM build.
      '#msgpackr': 'msgpackr',
    },
  },
});
