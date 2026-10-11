/** Política de enmarcado (iframe) por ruta. Sin dependencias: la importa el middleware (runtime edge). */

/** true solo para `/p/<token>/embed` (con o sin barra final): la ÚNICA ruta que se deja enmarcar desde otros sitios. */
export const isEmbedPath = (pathname: string) => /^\/p\/[^/]+\/embed\/?$/.test(pathname);

/** Cabeceras de enmarcado por ruta. Solo la vista embebida puede ser enmarcada por cualquier sitio; el resto de la
 * plataforma (sesión, panel, expertos, admin) solo desde su propio origen: evita clickjacking sobre pantallas con sesión. */
export function frameHeaders(pathname: string): Record<string, string> {
  if (isEmbedPath(pathname)) return { 'Content-Security-Policy': 'frame-ancestors *' };
  return { 'X-Frame-Options': 'SAMEORIGIN', 'Content-Security-Policy': "frame-ancestors 'self'" };
}
