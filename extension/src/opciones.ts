import { guardarConfig, leerConfig, normalizarServidor } from './almacen';

const formulario = document.getElementById('ajustes') as HTMLFormElement;
const campoServidor = document.getElementById('servidor') as HTMLInputElement;
const campoToken = document.getElementById('token') as HTMLInputElement;
const aviso = document.getElementById('aviso') as HTMLParagraphElement;

function mostrar(texto: string, error = false) {
  aviso.textContent = texto;
  aviso.style.color = error ? '#a3341f' : '#2f7d4f';
}

void (async () => {
  const config = await leerConfig();
  if (config) {
    campoServidor.value = config.servidor;
    campoToken.value = config.token;
  }
})();

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  let servidor: string;
  try {
    servidor = normalizarServidor(campoServidor.value);
  } catch (error) {
    mostrar(error instanceof Error ? error.message : 'La dirección no es válida', true);
    return;
  }

  const token = campoToken.value.trim();
  if (!token) {
    mostrar('Escribe el token del servidor', true);
    return;
  }

  const concedido = await chrome.permissions.request({ origins: [`${servidor}/*`] });
  if (!concedido) {
    mostrar('Sin permiso para ese dominio la extensión no puede guardar nada', true);
    return;
  }

  await guardarConfig({ servidor, token });
  campoServidor.value = servidor;
  mostrar('Ajustes guardados. Ya puedes usar el botón de la barra.');
});
