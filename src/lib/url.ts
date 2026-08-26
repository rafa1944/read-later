const PARAMETROS_DE_SEGUIMIENTO = [
  /^utm_/,
  /^ga_/,
  /^_hs/,
  /^mc_/,
  /^vero_/,
  /^icid$/,
  /^fbclid$/,
  /^gclid$/,
  /^gbraid$/,
  /^wbraid$/,
  /^msclkid$/,
  /^igshid$/,
  /^mkt_tok$/,
  /^ref$/,
  /^ref_src$/,
  /^s_cid$/,
  /^cmpid$/,
];

export function canonicalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error(`URL no válida: ${raw}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Esquema no admitido: ${url.protocol}`);
  }

  url.hostname = url.hostname.toLowerCase();
  url.hash = '';

  const conservados = [...url.searchParams.entries()]
    .filter(([clave]) => !PARAMETROS_DE_SEGUIMIENTO.some((patron) => patron.test(clave)))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  url.search = '';
  for (const [clave, valor] of conservados) {
    url.searchParams.append(clave, valor);
  }

  if (url.pathname !== '/' && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }

  return url.toString();
}
