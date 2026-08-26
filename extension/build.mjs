import { cp, mkdir } from 'node:fs/promises';
import { context } from 'esbuild';

const observar = process.argv.includes('--watch');

await mkdir('extension/dist', { recursive: true });
for (const fichero of ['manifest.json', 'opciones.html', 'iconos']) {
  await cp(`extension/${fichero}`, `extension/dist/${fichero}`, { recursive: true });
}

const comun = {
  bundle: true,
  target: 'chrome120',
  logLevel: 'info',
};

const modulos = await context({
  ...comun,
  entryPoints: ['extension/src/fondo.ts', 'extension/src/opciones.ts'],
  outdir: 'extension/dist',
  format: 'esm',
});

// El script inyectado va como IIFE y con un pie que deja la llamada como
// última expresión: ese es el valor que recoge chrome.scripting.executeScript.
const inyectado = await context({
  ...comun,
  entryPoints: ['extension/src/inyectado.ts'],
  outfile: 'extension/dist/inyectado.js',
  format: 'iife',
  footer: { js: '__rlCapturar();' },
});

if (observar) {
  await Promise.all([modulos.watch(), inyectado.watch()]);
} else {
  await Promise.all([modulos.rebuild(), inyectado.rebuild()]);
  await Promise.all([modulos.dispose(), inyectado.dispose()]);
}
