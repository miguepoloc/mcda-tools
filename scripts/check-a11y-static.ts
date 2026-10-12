// Verificación ESTÁTICA de accesibilidad (WCAG 2.2 AA, ítem U3). No renderiza nada: lee el JSX/CSS y busca
// patrones que casi siempre son un fallo real. Los falsos positivos conocidos se eliminan reescribiendo el
// patrón (p. ej. dando `aria-label`), no con una lista de excepciones. Ver docs/AUDITORIA_accesibilidad.md.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../src', import.meta.url).pathname;
let fails = 0;
const fail = (rule: string, file: string, line: number, msg: string) => {
  fails++;
  console.error(`FALLA [${rule}] ${file.replace(ROOT, 'src')}:${line} ${msg}`);
};
let checks = 0;
const ok = (name: string) => { checks++; console.log('ok   ', name); };

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const files = walk(ROOT);
const tsx = files.filter((f) => f.endsWith('.tsx'));
const css = files.filter((f) => f.endsWith('.css'));
const lineOf = (src: string, idx: number) => src.slice(0, idx).split('\n').length;

// Quita comentarios para no contar ejemplos escritos en la documentación del código.
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/[^\n]*/g, (m, a) => a + ' '.repeat(m.length - a.length));

// Abre una etiqueta JSX en `start` (índice de «<») y devuelve hasta el «>» que la cierra, respetando {…} y comillas.
function openingTag(src: string, start: number): { text: string; end: number } {
  let depth = 0; let q = '';
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === q && src[i - 1] !== '\\') q = ''; continue; }
    if (depth === 0 && (c === '"' || c === "'")) { q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0 && src[i - 1] !== '=') return { text: src.slice(start, i + 1), end: i + 1 };
  }
  return { text: src.slice(start), end: src.length };
}

const ICON_ONLY = /^[\s×✕✖✗✓✔…⋯⋮↑↓←→▲▼▸▾◂▴+−\-–—·•x✎✏⟳↻⤢⤓⤒?*]*$/;

for (const file of tsx) {
  const src = strip(readFileSync(file, 'utf8'));

  // 1. Botones sin nombre accesible (solo icono/glifo, sin aria-label/aria-labelledby/title).
  let re = /<button\b/g; let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const { text, end } = openingTag(src, m.index);
    if (/\baria-label(ledby)?=/.test(text) || /\.\.\.\s*\w+/.test(text) && /aria-label/.test(text)) continue;
    const close = src.indexOf('</button>', end);
    if (close < 0) continue;
    const inner = src.slice(end, close);
    // Texto visible = lo que queda sin etiquetas ni bloques svg; una expresión {…} cuenta como texto.
    const visible = inner.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').replace(/\{\s*\}/g, '').trim();
    const hasSvgOnly = /<svg\b/.test(inner) && visible === '';
    const hasSrOnly = /sr-only|visually-hidden/.test(inner) && /<span[^>]*sr-only/.test(inner);
    if ((visible === '' && !hasSrOnly) || ICON_ONLY.test(visible)) {
      if (hasSrOnly) continue;
      if (/\btitle=/.test(text) && !hasSvgOnly) { /* title ayuda pero no basta para táctil; se acepta con glifo */ continue; }
      fail('boton-sin-nombre', file, lineOf(src, m.index), `<button> solo icono sin aria-label (${visible || 'svg'})`);
    }
  }

  // 2. Imágenes sin alt.
  re = /<img\b/g;
  while ((m = re.exec(src))) {
    const { text } = openingTag(src, m.index);
    if (!/\balt=/.test(text)) fail('img-sin-alt', file, lineOf(src, m.index), '<img> sin alt');
  }

  // 3. Campos sin etiqueta: necesitan aria-label/aria-labelledby/title, o un id (por htmlFor) o estar dentro de <label>.
  re = /<(input|select|textarea)\b/g;
  while ((m = re.exec(src))) {
    const { text } = openingTag(src, m.index);
    if (/type=["'](hidden|submit|button|reset)["']/.test(text)) continue;
    if (/\{\.\.\./.test(text)) continue;
    if (/\bhidden\b(?!=)|aria-hidden=["']true["']/.test(text)) continue; // fuera del árbol de accesibilidad
    if (/\baria-label(ledby)?=|\btitle=|\bid=/.test(text)) continue;
    const before = src.slice(Math.max(0, m.index - 600), m.index);
    const lastOpen = before.lastIndexOf('<label');
    const lastClose = before.lastIndexOf('</label>');
    if (lastOpen > lastClose) continue;
    fail('campo-sin-etiqueta', file, lineOf(src, m.index), `<${m[1]}> sin etiqueta asociada`);
  }

  // 4. Tablas sin título accesible (caption, aria-label o aria-labelledby).
  re = /<table\b/g;
  while ((m = re.exec(src))) {
    const { text, end } = openingTag(src, m.index);
    const close = src.indexOf('</table>', end);
    const body = close < 0 ? '' : src.slice(end, Math.min(close, end + 400));
    if (!/aria-label(ledby)?=/.test(text) && !/<caption\b/.test(body) && !/role=["']presentation["']/.test(text)) {
      fail('tabla-sin-titulo', file, lineOf(src, m.index), '<table> sin <caption> ni aria-label');
    }
  }

  // 5. <th> sin scope (columna o fila) — salvo celdas con rowSpan/colSpan, que se declaran a mano.
  re = /<th\b/g;
  while ((m = re.exec(src))) {
    const { text } = openingTag(src, m.index);
    if (!/\bscope=/.test(text) && !/\{\.\.\./.test(text)) fail('th-sin-scope', file, lineOf(src, m.index), '<th> sin scope');
  }

  // 6. div/span con onClick pero sin rol ni teclado.
  re = /<(div|span|li|td|p|section)\b/g;
  while ((m = re.exec(src))) {
    const { text } = openingTag(src, m.index);
    if (!/\bonClick=/.test(text)) continue;
    if (/\brole=/.test(text) || /\bonKeyDown=|\bonKeyUp=/.test(text)) continue;
    // Contenedor que solo detiene la propagación o cierra al hacer clic fuera: no es un control.
    if (/onClick=\{\s*\(?\s*\w*\s*\)?\s*=>\s*\w*\.?stopPropagation\(\)\s*\}/.test(text)) continue;
    if (/aria-hidden=["']true["']/.test(text)) continue;
    if (/\bclassName=["'][^"']*(overlay|backdrop|scrim|-ov\b)/.test(text) || /\bclassName=["'](modal-overlay|gv-modal|gv-tour-backdrop|gv-cmp-ov)/.test(text)) continue;
    fail('click-sin-teclado', file, lineOf(src, m.index), `<${m[1]} onClick> sin role ni onKeyDown`);
  }

  // 7. tabIndex positivo (rompe el orden natural de Tab).
  re = /tabIndex=\{?["']?([1-9]\d*)/g;
  while ((m = re.exec(src))) fail('tabindex-positivo', file, lineOf(src, m.index), `tabIndex=${m[1]}`);

  // 8. role="tab" debe declarar aria-selected; role="dialog"/"alertdialog" debe tener nombre.
  re = /<\w+\b[^<>]*\brole=["']tab["']/g;
  while ((m = re.exec(src))) {
    const { text } = openingTag(src, m.index);
    if (!/aria-selected=/.test(text)) fail('tab-sin-selected', file, lineOf(src, m.index), 'role="tab" sin aria-selected');
  }
  re = /<\w+\b[^<>]*\brole=["'](alert)?dialog["']/g;
  while ((m = re.exec(src))) {
    const { text } = openingTag(src, m.index);
    if (!/aria-label(ledby)?=/.test(text)) fail('dialogo-sin-nombre', file, lineOf(src, m.index), 'diálogo sin aria-label/aria-labelledby');
    if (!/aria-modal=/.test(text)) fail('dialogo-sin-modal', file, lineOf(src, m.index), 'diálogo sin aria-modal');
  }

  // 9. SVG con role="img" sin nombre.
  re = /<svg\b/g;
  while ((m = re.exec(src))) {
    const { text } = openingTag(src, m.index);
    if (/role=["']img["']/.test(text) && !/aria-label(ledby)?=/.test(text)) {
      const after = src.slice(m.index, m.index + 600);
      if (!/<title\b/.test(after)) fail('svg-img-sin-nombre', file, lineOf(src, m.index), '<svg role="img"> sin nombre');
    }
  }

  // 10. Enlaces que abren pestaña nueva deben avisar a lectores (texto o aria-label «nueva pestaña»)? Solo rel.
  re = /<a\b[^>]*target=["']_blank["'][^>]*>/g;
  while ((m = re.exec(src))) {
    if (!/rel=/.test(m[0])) fail('blank-sin-rel', file, lineOf(src, m.index), 'target="_blank" sin rel');
  }
}
if (fails === 0) ok(`JSX: botones, imágenes, campos, tablas, th, clics, tabIndex, roles (${tsx.length} archivos)`);

// ---- CSS ----
const allCss = css.map((f) => [f, readFileSync(f, 'utf8')] as const);
// Contenedores que reciben el foco SOLO por programa (tabindex=-1: diálogo, <main>, encabezado de paso): no son
// controles que el teclado alcance, así que no necesitan contorno.
const PROGRAMMATIC = /^(\.modal|main|\.wz-q|\.rec-name)\b/;
const INDICATOR = /(box-shadow|border[\w-]*|background[\w-]*|text-decoration|color)\s*:/;
let cssBad = 0;
for (const [file, text] of allCss) {
  const bare = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bare))) {
    const sel = m[1].trim(); const body = m[2];
    if (!/\boutline\s*:\s*(none|0)\b/.test(body) || !/:focus/.test(sel)) continue;
    if (sel.split(',').every((x) => PROGRAMMATIC.test(x.trim()))) continue;
    if (!INDICATOR.test(body.replace(/\boutline\s*:[^;]*;?/g, ''))) {
      cssBad++;
      fail('foco-invisible', file, lineOf(bare, m.index + m[1].length), `«${sel.slice(0, 70)}» quita el contorno sin otro indicador`);
    }
  }
}
if (!cssBad) ok('CSS: ningún :focus quita el contorno sin otro indicador');

const global = readFileSync(join(ROOT, 'app/globals.css'), 'utf8');
const before = fails;
if (!/prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{[^]*animation-duration\s*:\s*\.?0?1ms/.test(global)) {
  fail('movimiento', join(ROOT, 'app/globals.css'), 1, 'falta la regla global prefers-reduced-motion');
}
if (!/\.skip-link\b/.test(global)) fail('skip-link', join(ROOT, 'app/globals.css'), 1, 'falta .skip-link');
if (!/:focus-visible\s*\{[^}]*outline\s*:\s*[23]px/.test(global)) fail('foco', join(ROOT, 'app/globals.css'), 1, 'falta el :focus-visible global');
if (fails === before) ok('CSS: movimiento reducido, .skip-link y :focus-visible global');

const layout = readFileSync(join(ROOT, 'app/layout.tsx'), 'utf8');
const b2 = fails;
if (!/<main\b/.test(layout) || !/skip-link/.test(layout)) fail('landmark', join(ROOT, 'app/layout.tsx'), 1, 'el layout raíz debe tener <main> y enlace «saltar al contenido»');
if (!/<html lang=/.test(layout)) fail('lang', join(ROOT, 'app/layout.tsx'), 1, '<html> sin lang');
if (fails === b2) ok('layout: <main>, enlace de salto y <html lang>');

// Cada página (servidor) declara su título: 2.4.2. Las que dependen de `use client` heredan el del layout o de su layout.tsx.
const b3 = fails;
for (const f of files.filter((x) => /app\/.+\/page\.tsx$/.test(x))) {
  const src = readFileSync(f, 'utf8');
  if (/^['"]use client['"]/.test(src)) continue;
  if (!/export const metadata|generateMetadata/.test(src)) fail('titulo', f, 1, 'página sin metadata.title');
}
if (fails === b3) ok('páginas de servidor con título propio');

// Teclado de pestañas: todo role="tablist" debe manejar flechas (tablistKeys) o llevar tabIndex itinerante.
const b4 = fails;
for (const f of tsx) {
  const src = strip(readFileSync(f, 'utf8'));
  for (const m of src.matchAll(/role=["']tablist["']/g)) {
    const near = src.slice(m.index, m.index + 400);
    if (!/onKeyDown=/.test(near)) fail('tablist-sin-teclado', f, lineOf(src, m.index!), 'role="tablist" sin onKeyDown (usa tablistKeys)');
  }
}
if (fails === b4) ok('tablists con navegación por flechas');

// ---- Pendientes cerrados en la segunda pasada (errores de campo, tabpanels, th de fila, avisos, encabezados) ----
const bA = fails;
// 1. Pestañas: todo archivo con role="tab" declara un role="tabpanel" y aria-controls. Para pestañas cuyos paneles son
//    render condicional basta un solo panel con aria-labelledby que cambie con la pestaña activa.
for (const f of tsx) {
  const src = strip(readFileSync(f, 'utf8'));
  const m = /role=["']tab["']/.exec(src);
  if (!m) continue;
  if (!/role=["']tabpanel["']/.test(src)) fail('tab-sin-panel', f, lineOf(src, m.index), 'role="tab" sin role="tabpanel" en el archivo');
  if (!/aria-controls=/.test(src)) fail('tab-sin-controls', f, lineOf(src, m.index), 'role="tab" sin aria-controls');
  if (!/aria-labelledby=/.test(src)) fail('panel-sin-labelledby', f, lineOf(src, m.index), 'tabpanel sin aria-labelledby');
}
if (fails === bA) ok('pestañas con tabpanel, aria-controls y aria-labelledby');

// 2. Formularios clave: el error del campo se vincula (aria-invalid + aria-describedby) y se anuncia (role="alert").
const bB = fails;
for (const rel of ['app/login/page.tsx', 'components/NewProject.tsx', 'components/DecisionMatrixEditor.tsx', 'components/GeoClassesEditor.tsx', 'components/GeoPointsPanel.tsx']) {
  const f = join(ROOT, rel);
  const src = strip(readFileSync(f, 'utf8'));
  if (!/aria-invalid=/.test(src)) fail('error-sin-invalid', f, 1, 'formulario clave sin aria-invalid en sus campos');
  if (!/aria-describedby=/.test(src)) fail('error-sin-describedby', f, 1, 'formulario clave sin aria-describedby hacia el mensaje de error');
  if (!/role=["']alert["']|aria-live=/.test(src)) fail('error-sin-live', f, 1, 'formulario clave sin role="alert" ni aria-live');
}
if (fails === bB) ok('formularios clave: aria-invalid + aria-describedby + región viva');

// 3. Avisos temporales: ningún mensaje se borra solo antes de 5 s (2.2.1); el toast se pausa y tiene región viva montada.
const bC = fails;
for (const f of tsx) {
  const src = strip(readFileSync(f, 'utf8'));
  for (const m of src.matchAll(/setTimeout\(\s*\(\)\s*=>\s*set(?:Toast\w*|Msg|Copied\w*|Flash\w*|Notice\w*)\(\s*(?:null|''|""|false)\s*\)\s*,\s*(\d+)\s*\)/g)) {
    if (Number(m[1]) < 5000) fail('aviso-corto', f, lineOf(src, m.index!), `aviso que se borra solo a los ${m[1]} ms (mínimo 5000)`);
  }
}
const smmFile = join(ROOT, 'components/ScientificMethodModal.tsx');
const smm = strip(readFileSync(smmFile, 'utf8'));
if (!/toastPaused/.test(smm) || !/<div className="sr-only" role="status" aria-live="polite">/.test(smm)) {
  fail('toast', smmFile, 1, 'el toast debe pausarse con el puntero y tener región viva siempre montada');
}
if (/setTimeout\(\(\) => setToastMsg\(null\), (?:\d{1,3}|[1-4]\d{3})\)/.test(smm)) fail('toast', smmFile, 1, 'el toast dura menos de 5 s');
if (fails === bC) ok('avisos temporales: ≥ 5 s, pausa con el puntero y región viva montada');

// 4. Primera celda de fila = <th scope="row"> en tablas de datos (nombre de alternativa/criterio).
const bD = fails;
for (const f of tsx) {
  const src = strip(readFileSync(f, 'utf8'));
  for (const m of src.matchAll(/<tr\b[^>]*>\s*<td\b([^>]*)>/g)) {
    if (/colSpan=|className="[^"]*\b(n|mono|na-cell)\b/.test(m[1])) continue;
    fail('fila-sin-th', f, lineOf(src, m.index!), 'primera celda de la fila es <td>: usa <th scope="row">');
  }
}
if (!/tbody th\[scope=row\]/.test(global)) fail('fila-sin-th', join(ROOT, 'app/globals.css'), 1, 'falta el estilo de tbody th[scope=row]');
if (fails === bD) ok('tablas: primera celda de fila como <th scope="row">');

// 5. Encabezados: ningún archivo salta de nivel (h5 sin h4).
const bE = fails;
for (const f of tsx) {
  const src = strip(readFileSync(f, 'utf8'));
  const hs = [...src.matchAll(/<h([1-6])\b/g)].map((m) => ({ n: Number(m[1]), at: m.index! }));
  if (!hs.length) continue;
  const levels = new Set(hs.map((h) => h.n));
  for (const h of hs) {
    if (h.n >= 5 && !levels.has(h.n - 1)) fail('encabezado-salto', f, lineOf(src, h.at), `<h${h.n}> sin <h${h.n - 1}> en el archivo`);
  }
}
if (fails === bE) ok('encabezados sin saltos evidentes por archivo');

// Contraste (texto normal 4.5:1; componentes de interfaz 3:1) de los pares de tokens más usados.
function lum(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const pairs: [string, string, string, number][] = [
  ['muted claro / fondo', '#5A6A80', '#F8FAFC', 4.5], ['muted claro / surface2', '#5A6A80', '#F1F5F9', 4.5],
  ['muted claro / acento-soft B', '#5A6A80', '#E0F2FE', 4.5],
  ['muted oscuro / fondo', '#94A3B8', '#0B0F17', 4.5], ['muted oscuro / surface2', '#94A3B8', '#162032', 4.5],
  ['acento B claro / blanco', '#0369A1', '#FFFFFF', 4.5], ['blanco / acento B (botón)', '#FFFFFF', '#0369A1', 4.5],
  ['acento A claro / blanco', '#4F46E5', '#FFFFFF', 4.5], ['acento A claro / pa-soft', '#4F46E5', '#EEF2FF', 4.5],
  ['blanco / acento A (botón)', '#FFFFFF', '#4F46E5', 4.5],
  ['acento A oscuro / surface', '#818CF8', '#111827', 4.5], ['texto botón A oscuro', '#0B0F17', '#818CF8', 4.5],
  ['acento B oscuro / surface', '#00E5FF', '#111827', 4.5], ['texto botón B oscuro', '#0B0F17', '#00E5FF', 4.5],
  ['warn-text claro / warn-soft', '#92400E', '#FEF3C7', 4.5], ['pass-text claro / pass-soft', '#047857', '#ECFDF5', 4.5],
  ['warn oscuro / warn-soft', '#FBBF24', '#451A03', 4.5], ['pass oscuro / pass-soft', '#34D399', '#064E3B', 4.5],
  ['geovisor: acento fuerte / blanco', '#4D7C0F', '#FFFFFF', 4.5], ['geovisor: foco claro / blanco', '#1D4ED8', '#FFFFFF', 3],
  ['borde de campo claro / surface2 (3:1)', '#7B8BA1', '#F1F5F9', 3], ['borde de campo oscuro / surface2 (3:1)', '#64748B', '#162032', 3],
  ['método AHP texto', '#6D28D9', '#FFFFFF', 4.5], ['método TOPSIS texto', '#0E7490', '#FFFFFF', 4.5], ['método VIKOR texto', '#047857', '#FFFFFF', 4.5],
  ['método PROMETHEE texto', '#BE123C', '#FFFFFF', 4.5], ['método ELECTRE texto', '#B45309', '#FFFFFF', 4.5],
  ['método SAW texto', '#C2410C', '#FFFFFF', 4.5], ['método Fuzzy texto', '#0F766E', '#FFFFFF', 4.5],
];
const b5 = fails;
for (const [name, fg, bg, min] of pairs) {
  const r = ratio(fg, bg);
  if (r < min) fail('contraste', 'src/app/globals.css', 1, `${name}: ${r.toFixed(2)}:1 < ${min}:1`);
}
// Los valores de arriba son copia de los tokens: si alguien los cambia en el CSS, esta lista debe seguirlos.
for (const [tok, val] of [['--pa', '#4F46E5'], ['--field-line', '#7B8BA1'], ['--muted', '#5A6A80'], ['--pb', '#0369A1']] as const) {
  if (!new RegExp(`${tok}:${val}`, 'i').test(global)) fail('contraste', 'src/app/globals.css', 1, `el token ${tok} ya no vale ${val}: actualiza los pares de contraste`);
}
if (fails === b5) ok(`contraste de ${pairs.length} pares de tokens`);

// ---- Modo presentación (U4): contraste ≥ 7:1 en texto y ≥ 3:1 en bordes, en claro y oscuro, leído de present.css ----
{
  const bP = fails;
  const presentFile = join(ROOT, 'app/present.css');
  const pcss = readFileSync(presentFile, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const layoutSrc = readFileSync(join(ROOT, 'app/layout.tsx'), 'utf8');
  if (!/import\s+['"]\.\/present\.css['"]/.test(layoutSrc)) fail('presente', 'src/app/layout.tsx', 1, 'el layout no importa present.css');
  if (!/PRESENT_BOOT_SCRIPT/.test(layoutSrc) || !/suppressHydrationWarning/.test(layoutSrc)) fail('presente', 'src/app/layout.tsx', 1, 'falta el script de arranque o suppressHydrationWarning en <html>');
  const tokensOf = (selector: string): Record<string, string> => {
    const out: Record<string, string> = {};
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|[}\\s])${esc}\\s*\\{([^{}]*)\\}`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(pcss))) for (const t of m[1].matchAll(/(--[\w-]+)\s*:\s*(#[0-9A-Fa-f]{6})\b/g)) out[t[1]] = t[2];
    return out;
  };
  const scopes: [string, Record<string, string>, Record<string, string>][] = [
    ['claro', tokensOf(':root[data-present="1"]'), tokensOf(':root[data-present="1"] .gv-wrap')],
    ['oscuro (sistema)', tokensOf(':root[data-present="1"]:not([data-theme="light"])'), tokensOf(':root[data-present="1"]:not([data-theme="light"]) .gv-wrap')],
    ['oscuro (forzado)', tokensOf(':root[data-present="1"][data-theme="dark"]'), tokensOf(':root[data-present="1"][data-theme="dark"] .gv-wrap')],
  ];
  // Los dos bloques oscuros deben decir lo mismo (no hay forma de compartirlos en CSS).
  for (const k of new Set([...Object.keys(scopes[1][1]), ...Object.keys(scopes[2][1])])) {
    if (scopes[1][1][k] !== scopes[2][1][k]) fail('presente', presentFile, 1, `${k}: el bloque oscuro del sistema y el forzado difieren`);
  }
  const BG = ['--bg', '--surface', '--surface2', '--pa-soft', '--pb-soft', '--pass-soft', '--warn-soft', '--geo-accent-soft'];
  const TEXT = ['--ink', '--muted', '--pa', '--pb', '--pass-text', '--warn-text', '--warn-t', '--pass-t',
    '--mt-ahp', '--mt-topsis', '--mt-vikor', '--mt-promethee', '--mt-electre', '--mt-saw', '--mt-fuzzy'];
  let nPairs = 0;
  for (const [name, t, g] of scopes) {
    for (const k of [...BG, ...TEXT, '--line', '--field-line', '--pa-ink', '--pb-ink', '--on-warn-text', '--warn', '--pass']) {
      if (!t[k]) fail('presente', presentFile, 1, `${name}: falta el token ${k}`);
    }
    for (const k of ['--gv-accent-strong', '--gv-warn-ink', '--gv-focus', '--gv-ok-bg', '--gv-ok-fg']) {
      if (!g[k]) fail('presente', presentFile, 1, `${name}: falta ${k} en .gv-wrap`);
    }
    const chk = (label: string, fg?: string, bg?: string, min = 7) => {
      if (!fg || !bg) return;
      nPairs++;
      const r = ratio(fg, bg);
      if (r < min) fail('contraste-presentacion', presentFile, 1, `${name}: ${label} ${r.toFixed(2)}:1 < ${min}:1 (${fg} sobre ${bg})`);
    };
    for (const k of TEXT) for (const b of BG) chk(`${k} / ${b}`, t[k], t[b]);
    for (const k of ['--gv-accent-strong', '--gv-warn-ink']) for (const b of BG) chk(`${k} / ${b}`, g[k], t[b]);
    chk('--gv-focus / --bg (3:1)', g['--gv-focus'], t['--bg'], 3);
    chk('--gv-ok-fg / --gv-ok-bg', g['--gv-ok-fg'], g['--gv-ok-bg']);
    chk('texto del botón A', t['--pa-ink'], t['--pa']);
    chk('texto del botón B', t['--pb-ink'], t['--pb']);
    chk('texto del botón de aviso', t['--on-warn-text'], t['--warn-text']);
    for (const k of ['--line', '--field-line', '--warn', '--pass']) { chk(`${k} / --bg (3:1)`, t[k], t['--bg'], 3); chk(`${k} / --surface2 (3:1)`, t[k], t['--surface2'], 3); }
    chk('--field-line / --surface2 (4.5:1)', t['--field-line'], t['--surface2'], 4.5);
  }
  // La escala base no puede bajar de ~125 % ni el foco de 4 px.
  if (!/--pz:1\.25\b/.test(pcss) || !/calc\(15px \* 1\.25 \/ var\(--pz\)\)/.test(pcss)) fail('presente', presentFile, 1, 'la escala base debe llegar a 125 %');
  if (!/:focus-visible\{outline:4px solid/.test(pcss.replace(/\s+/g, ' ').replace(/\s*\{\s*/g, '{'))) fail('presente', presentFile, 1, 'el foco del modo presentación debe ser de 4 px');
  if (!/\.gv-hint:not\(\.warn\)/.test(pcss) || /\.gv-hint\.warn[^{]*\{[^}]*display\s*:\s*none/.test(pcss)) fail('presente', presentFile, 1, 'los avisos .warn no deben ocultarse');
  if (fails === bP) ok(`modo presentación: ${nPairs} pares ≥ 7:1 / 3:1 en claro y oscuro, escala, foco y avisos conservados`);
}

console.log(`${checks} grupos de verificación, ${fails} fallas`);
if (fails) process.exit(1);
