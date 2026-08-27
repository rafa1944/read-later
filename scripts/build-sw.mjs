import { build } from 'esbuild';

/*
 * Una marca distinta en cada compilación. Va en el nombre de las cachés del
 * service worker, así que un despliegue nuevo cambia el fichero, dispara la
 * actualización del worker y tira lo guardado por la versión anterior.
 */
const version = `v${Date.now().toString(36)}`;

await build({
  entryPoints: ['src/sw/index.ts'],
  outfile: 'public/sw.js',
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  logLevel: 'warning',
  define: { VERSION_COMPILACION: JSON.stringify(version) },
});

console.log(`service worker compilado (${version})`);
