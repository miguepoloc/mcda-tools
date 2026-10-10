// Verifica que el enlace «Reportar un problema» no filtre ids ni tokens y lleve versión y método.
import { buildIssueUrl, sanitizePath } from '../src/lib/report-issue.ts';
import { APP_RELEASE_TAG } from '../src/lib/version.ts';

let fails = 0;
function eq(label: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.error(`FAIL ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
}

eq('token experto', sanitizePath('/e/AbC123secret'), '/e/:token');
eq('token público', sanitizePath('/p/xyz789'), '/p/:token');
eq('proyecto', sanitizePath('/projects/3f2a-uuid'), '/projects/:id');
eq('dashboard', sanitizePath('/dashboard'), '/dashboard');
eq('con query', sanitizePath('/metodo?x=secret'), '/metodo');
eq('raíz', sanitizePath('/'), '/');

const url = new URL(buildIssueUrl({ path: '/projects/abc-uuid', method: 'topsis' }));
eq('host', url.origin + url.pathname, 'https://github.com/miguepoloc/mcda-tools/issues/new');
const body = url.searchParams.get('body') ?? '';
eq('versión', body.includes(`Versión: ${APP_RELEASE_TAG}`), true);
eq('método', body.includes('Método del proyecto: topsis'), true);
eq('sin id', body.includes('abc-uuid'), false);
eq('labels', url.searchParams.get('labels'), 'bug');
eq('title', (url.searchParams.get('title') ?? '').length > 0, true);

if (fails > 0) { console.error(`${fails} fallos`); process.exit(1); }
console.log('check-report-issue: OK');
