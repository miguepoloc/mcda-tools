// Vista embebida (R4): ruta, parámetros, código <iframe>, vistas disponibles según lo publicado, cabeceras de enmarcado
// y texto de Open Graph.
import { clampSize, embedPath, embedUrl, embedViews, iframeCode, isEmbedPath, parseEmbedParams, resolvePanel, socialText, frameHeaders, EMBED_SIZE } from '../src/lib/embed.ts';

let fails = 0;
const ok = (n: string, c: boolean, e = '') => { if (!c) { fails++; console.error('FALLA', n, e); } else console.log('ok   ', n, e); };

// ---- ruta y URL
ok('ruta embed', embedPath('abc123') === '/p/abc123/embed');
ok('el token se codifica', embedPath('a/b?c') === '/p/a%2Fb%3Fc/embed');
ok('url por defecto sin parámetros', embedUrl('https://mcda.tools', 'abc') === 'https://mcda.tools/p/abc/embed');
ok('url con estilo, base y panel', embedUrl('https://mcda.tools', 'abc', { style: 'classes', base: 'osm', panel: 'points' }) === 'https://mcda.tools/p/abc/embed?style=classes&base=osm&panel=points');
ok('url omite lo que es el valor por defecto', embedUrl('https://x', 't', { style: 'continuous', base: 'sat', panel: 'map' }) === 'https://x/p/t/embed');
ok('base desconocida se descarta', embedUrl('https://x', 't', { base: 'evil' as never }) === 'https://x/p/t/embed');

// ---- parámetros
const d = parseEmbedParams({});
ok('por defecto: continuo, satélite, mapa', d.style === 'continuous' && d.base === 'sat' && d.panel === 'map');
const q = parseEmbedParams({ style: 'classes', base: 'topo', panel: 'zones' });
ok('lee estilo, base y panel', q.style === 'classes' && q.base === 'topo' && q.panel === 'zones');
const bad = parseEmbedParams({ style: '<script>', base: 'http://evil', panel: ['points', 'zones'] });
ok('valores desconocidos caen al por defecto', bad.style === 'continuous' && bad.base === 'sat');
ok('un arreglo toma el primero', bad.panel === 'points');

// ---- tamaño
ok('tamaño dentro de límites', clampSize(800, EMBED_SIZE.minW, EMBED_SIZE.maxW, 1) === 800);
ok('tamaño muy chico → mínimo', clampSize(10, EMBED_SIZE.minW, EMBED_SIZE.maxW, 1) === EMBED_SIZE.minW);
ok('tamaño enorme → máximo', clampSize(99999, EMBED_SIZE.minW, EMBED_SIZE.maxW, 1) === EMBED_SIZE.maxW);
ok('tamaño no numérico → por defecto', clampSize('abc', 240, 2000, 777) === 777 && clampSize('', 240, 2000, 777) === 777 && clampSize(NaN, 240, 2000, 777) === 777);

// ---- <iframe>
const code = iframeCode({ url: 'https://mcda.tools/p/abc/embed', title: 'Mi "mapa" <b>', width: '100%', height: 520 });
ok('iframe con src, ancho y alto', code.startsWith('<iframe src="https://mcda.tools/p/abc/embed"') && code.includes('width="100%"') && code.includes('height="520"'));
ok('iframe escapa el título', code.includes('&quot;mapa&quot;') && code.includes('&lt;b&gt;') && !code.includes('<b>'));
ok('iframe escapa la URL', !iframeCode({ url: 'https://x/"><script>', title: 't', width: 500, height: 400 }).includes('<script>'));
ok('iframe limita ancho y alto', (() => { const c = iframeCode({ url: 'u', title: 't', width: 99999, height: 5 }); return c.includes(`width="${EMBED_SIZE.maxW}"`) && c.includes(`height="${EMBED_SIZE.minH}"`); })());
ok('iframe: sin borde, lazy y fullscreen', code.includes('border:0') && code.includes('loading="lazy"') && code.includes('allowfullscreen'));

// ---- vistas según lo publicado
const pts = [{ name: 'A', lat: 1, lon: 2, status: 'ok', rank: 1, pct: 80, cls: 3 }];
const zones = { layer: 'z', rows: [{ name: 'Z1', meanPct: 50, ha: 10, classPct: [50, 50] }] };
ok('sin puntos ni zonas: solo mapa', embedViews({}).join() === 'map');
ok('showPoints apagado: no hay puntos aunque viajen', embedViews({ showPoints: false, points: pts }).join() === 'map');
ok('showPoints encendido: puntos', embedViews({ showPoints: true, points: pts }).join() === 'map,points');
ok('showZones encendido: zonas', embedViews({ showZones: true, zones }).join() === 'map,zones');
ok('ambos', embedViews({ showPoints: true, points: pts, showZones: true, zones }).join() === 'map,points,zones');
ok('un panel no publicado se resuelve a mapa', resolvePanel('points', {}) === 'map' && resolvePanel('zones', { showPoints: true, points: pts }) === 'map');
ok('un panel publicado se respeta', resolvePanel('points', { showPoints: true, points: pts }) === 'points');

// ---- enmarcado: solo la ruta embed
ok('embed con y sin barra final', isEmbedPath('/p/abc/embed') && isEmbedPath('/p/abc/embed/'));
ok('no son embed', !isEmbedPath('/p/abc') && !isEmbedPath('/p/abc/embed/x') && !isEmbedPath('/projects/abc/embed') && !isEmbedPath('/p//embed') && !isEmbedPath('/dashboard') && !isEmbedPath('/e/abc') && !isEmbedPath('/p/a/b/embed'));
const h = frameHeaders('/p/abc/embed');
ok('embed: frame-ancestors * y sin X-Frame-Options', h['Content-Security-Policy'] === 'frame-ancestors *' && !('X-Frame-Options' in h));
for (const path of ['/', '/p/abc', '/dashboard', '/projects/xyz', '/admin', '/e/tok', '/login', '/p/abc/opengraph-image']) {
  const r = frameHeaders(path);
  ok(`restrictivo en ${path}`, r['X-Frame-Options'] === 'SAMEORIGIN' && r['Content-Security-Policy'] === "frame-ancestors 'self'");
}

// ---- Open Graph
const s = socialText({ title: 'Cacao SNSM', objective: 'Zonas aptas para cacao en la vertiente norte', spatial: true });
ok('título con la marca', s.title === 'Cacao SNSM · Plataforma MCDA');
ok('descripción de mapa con objetivo', s.description.startsWith('Mapa de aptitud (AHP + SIG). Zonas aptas'));
ok('decisión sin objetivo', socialText({ title: 'X', objective: '' }).description === 'Resultados de decisión multicriterio publicado en la Plataforma MCDA.');
ok('proyecto no disponible → genérico', socialText(null).title === 'Plataforma MCDA' && socialText(null).description.length > 20);
const long = socialText({ title: 'T'.repeat(500), objective: 'o '.repeat(500) });
ok('texto largo se recorta', long.title.length <= 110 && long.description.length <= 230);

if (fails) { console.error(`\n${fails} verificaciones fallaron`); process.exit(1); }
console.log('\ncheck-geo-embed: todo en orden');
