import { build } from 'esbuild';

await build({
  entryPoints: ['src/sw/index.ts'],
  outfile: 'public/sw.js',
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  logLevel: 'warning',
});
