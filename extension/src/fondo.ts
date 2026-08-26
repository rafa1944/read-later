import { leerConfig } from './almacen';
import type { ArticuloExtraido } from './extraer';

const VERDE = '#2f7d4f';
const ROJO = '#a3341f';

async function señal(tabId: number, texto: string, color: string, ms = 2500) {
  await chrome.action.setBadgeBackgroundColor({ tabId, color });
  await chrome.action.setBadgeText({ tabId, text: texto });
  setTimeout(() => void chrome.action.setBadgeText({ tabId, text: '' }), ms);
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url?.startsWith('http')) return;
  const tabId = tab.id;

  const config = await leerConfig();
  if (!config) {
    await señal(tabId, '⚙', ROJO, 4000);
    await chrome.runtime.openOptionsPage();
    return;
  }

  try {
    const [resultado] = await chrome.scripting.executeScript({
      target: { tabId },
      files: ['inyectado.js'],
    });

    const articulo = resultado?.result as ArticuloExtraido | undefined;
    if (!articulo?.url) throw new Error('No se pudo leer la página');

    const respuesta = await fetch(`${config.servidor}/api/items`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify(articulo),
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      throw new Error(`${respuesta.status} ${detalle.slice(0, 160)}`);
    }

    const { created } = (await respuesta.json()) as { created: boolean };
    // El check distingue guardado nuevo de artículo que ya tenías.
    await señal(tabId, created ? '✓' : '=', VERDE);
  } catch (error) {
    console.error('[Read Later]', error);
    await señal(tabId, '!', ROJO, 5000);
  }
});
