/**
 * Enlace «Reportar un problema»: abre un issue nuevo en GitHub con la versión, la ruta y (si hay) el método
 * del proyecto. No incluye correos, ids de proyecto ni tokens: la ruta se normaliza antes de enviarla.
 */
import { APP_REPO_URL, APP_RELEASE_TAG } from './version.ts';

/** Sustituye ids y tokens de la ruta por marcadores: `/e/abc123` → `/e/:token`, `/projects/<uuid>` → `/projects/:id`. */
export function sanitizePath(pathname: string): string {
  const parts = pathname.split('?')[0].split('#')[0].split('/');
  const out = parts.map((seg, i) => {
    const prev = parts[i - 1];
    if (i > 0 && (prev === 'e' || prev === 'p')) return ':token';
    if (i > 0 && prev === 'projects' && seg !== '') return ':id';
    return seg;
  });
  return out.join('/') || '/';
}

export interface IssueContext {
  /** Ruta actual (location.pathname). */
  path: string;
  /** Método del proyecto abierto (ahp, topsis…) si lo hay. */
  method?: string;
}

export function buildIssueUrl({ path, method }: IssueContext): string {
  const safe = sanitizePath(path);
  const body = [
    '## ¿Qué pasó?',
    '',
    '<!-- Describe el problema y qué esperabas que ocurriera. -->',
    '',
    '## Cómo reproducirlo',
    '',
    '1. ',
    '',
    '## Contexto (se completó automáticamente)',
    '',
    `- Versión: ${APP_RELEASE_TAG}`,
    `- Ruta: ${safe}`,
    ...(method ? [`- Método del proyecto: ${method}`] : []),
    '',
    '<!-- No pegues datos personales, enlaces de expertos ni tokens. -->',
  ].join('\n');
  const q = new URLSearchParams({ title: '[Problema] ', body, labels: 'bug' });
  return `${APP_REPO_URL}/issues/new?${q.toString()}`;
}
