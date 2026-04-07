import { defineConfig } from '@wdio/cli';
import path from 'path';

const binaryPath = process.env['TAURI_BINARY_PATH']
  ?? path.join(__dirname, 'src-tauri/target/release/garbanzobeans.exe');

export const config = defineConfig({
  runner: 'local',
  specs: ['./e2e-integration/**/*.test.ts'],
  capabilities: [{
    'tauri:options': {
      application: binaryPath,
    },
    browserName: 'wry',
    'goog:chromeOptions': {
      binary: binaryPath,
    },
  }],
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    timeout: 30_000,
  },
});
