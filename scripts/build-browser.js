/**
 * Browser bundle build script using esbuild
 * 
 * Creates a single JS file that works in browsers with sql.js storage.
 */

import * as esbuild from 'esbuild';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

async function build() {
  console.log('🔨 Building browser bundle...');

  await esbuild.build({
    entryPoints: [join(rootDir, 'src/browser.ts')],
    bundle: true,
    outfile: join(rootDir, 'ui/public/boundless.browser.js'),
    format: 'esm',
    platform: 'browser',
    target: ['es2020'],
    minify: false, // Keep readable for demo purposes
    sourcemap: true,
    define: {
      'process.env.NODE_ENV': '"production"'
    },
    banner: {
      js: '// Boundless DCB Event Store - Browser Bundle\n// https://github.com/SBortz/boundless\n'
    }
  });

  console.log('✅ Browser bundle created: ui/public/boundless.browser.js');
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
