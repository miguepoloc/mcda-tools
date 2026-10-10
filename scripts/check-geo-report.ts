// Composición de mapa (R1) e informe ejecutivo de mapas (R2): lógica pura — formato de cifras, proyección, teselas, escala
// gráfica, distribución de la lámina, leyenda de N clases, regla de puntos sin puesto, PDF mínimo y armado del informe.
import {
  composeFileName, defaultOptions, directionLine, fitView, fmtDateEs, fmtNum, fmtPct, footerLines, frameLayout, geomPaths, legendRows,
  metersPerPixel, niceScale, pickZoom, planComposition, project, splitPoints, tileUrl, tilesFor, unrankedNote, wrapLines, mercX, mercY,
  type ComposeAvailability,
} from '../src/lib/geo/compose.ts';
import { jpegToPdf } from '../src/lib/geo/pdfImage.ts';
import { buildGeoReport } from '../src/lib/geo/report.ts';
import { buildGeoMethodologyParagraph } from '../src/lib/methodologyText.ts';
import { APP_DOI, APP_VERSION } from '../src/lib/version.ts';
import type { GeoSummary } from '../src/lib/geoExcel.ts';
import type { AhpSummary } from '../src/lib/geo/ahpSummary.ts';

let fails = 0;
const ok = (c: boolean, n: string) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + n); if (!c) fails++; };
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

// ---------------------------------------------------------------- formato de cifras
ok(fmtNum(1234.5, 1) === '1.234,5' && fmtNum(0.05, 1) === '0,1' && fmtNum(1234567, 0) === '1.234.567', 'fmtNum: miles con punto y decimales con coma');
ok(fmtNum(-12.34, 1) === '-12,3' && fmtNum(-0.01, 1) === '0,0' && fmtNum(NaN) === '—', 'fmtNum: negativos, -0 y NaN');
ok(fmtPct(12.345) === '12,3 %' && fmtPct(100, 0) === '100 %', 'fmtPct');
ok(fmtDateEs('2026-10-10') === '10 de octubre de 2026' && fmtDateEs('2026-01-05') === '5 de enero de 2026', 'fmtDateEs');

// ---------------------------------------------------------------- Mercator y ventana
ok(near(mercX(-180), 0) && near(mercX(180), 1) && near(mercY(0), 0.5), 'mercX/mercY: extremos y ecuador');
{
  const b = { west: -74.2, south: 10.8, east: -73.9, north: 11.3 };
  const v = fitView(b, 1000, 700, 0.05);
  const [x0, y0] = project(v, b.west, b.north), [x1, y1] = project(v, b.east, b.south);
  ok(x0 >= 0 && y0 >= 0 && x1 <= 1000 && y1 <= 700, 'fitView: el área cabe en la caja');
  ok(near((x0 + x1) / 2, 500, 1e-3) && near((y0 + y1) / 2, 350, 1e-3), 'fitView: el área queda centrada');
  ok(x1 - x0 > 0.85 * 1000 || y1 - y0 > 0.85 * 700, 'fitView: aprovecha la caja (≥ 85 % en un eje)');
  const eq = fitView({ west: -180, south: -1, east: 180, north: 1 }, 256, 10, 0);
  ok(near(metersPerPixel({ ...eq, latC: 0 }), 40075016.686 / 256, 1), 'metersPerPixel: 1 tesela mundial = 156 543 m/px');
}

// ---------------------------------------------------------------- teselas
{
  const b = { west: -74.2, south: 10.8, east: -73.9, north: 11.3 };
  const v = fitView(b, 1000, 700, 0.05);
  const z = pickZoom(v, 18, 48);
  const tiles = tilesFor(v, z, 'https://t/{s}/{z}/{x}/{y}.png', 'abc');
  ok(tiles.length > 0 && tiles.length <= 48, `pickZoom/tilesFor: ${tiles.length} teselas a zoom ${z} (≤ 48)`);
  ok(tiles.every((t) => t.url.includes(`/${t.z}/${t.x}/${t.y}.png`) && /\/\/t\/[abc]\//.test(t.url)), 'tileUrl: sustituye z, x, y y subdominio');
  const minX = Math.min(...tiles.map((t) => t.px)), maxX = Math.max(...tiles.map((t) => t.px + t.size));
  const minY = Math.min(...tiles.map((t) => t.py)), maxY = Math.max(...tiles.map((t) => t.py + t.size));
  ok(minX <= 0 && minY <= 0 && maxX >= 1000 && maxY >= 700, 'tilesFor: las teselas cubren toda la ventana');
  ok(pickZoom(v, 5, 48) <= 5, 'pickZoom: respeta el zoom máximo del mapa base');
  ok(tileUrl('https://x/{z}/{x}/{y}{r}.png', 3, 1, 2, '') === 'https://x/3/1/2.png', 'tileUrl: {r} vacío y sin subdominios');
}

// ---------------------------------------------------------------- escala gráfica
{
  const a = niceScale(10, 200);
  ok(a.meters === 2000 && near(a.px, 200) && a.label === '2 km', `niceScale 10 m/px, 200 px → ${a.label}`);
  const b = niceScale(0.7, 100);
  ok(b.meters === 50 && b.label === '50 m' && b.px <= 100, `niceScale 0,7 m/px, 100 px → ${b.label}`);
  const c = niceScale(300, 150);
  ok(c.meters === 20000 && c.label === '20 km', `niceScale 300 m/px, 150 px → ${c.label}`);
  ok(niceScale(0, 100).px === 0 && niceScale(5, 0).label === '', 'niceScale: entradas degeneradas no explotan');
  for (const m of [0.3, 1, 7, 33, 150, 999, 12000]) {
    const r = niceScale(m, 180);
    const mant = r.meters / 10 ** Math.floor(Math.log10(r.meters));
    ok(r.px <= 180 + 1e-9 && r.px > 180 / 5 - 1e-9 && [1, 2, 5].some((k) => near(mant, k, 1e-9)), `niceScale ${m} m/px: ${r.label} cabe y es 1/2/5 × 10ⁿ`);
  }
}

// ---------------------------------------------------------------- lámina
{
  const b = { west: -74.2, south: 10.8, east: -73.9, north: 11.3 };
  const a = frameLayout(1600, b, 0), c = frameLayout(3600, b, 0);
  ok(near(c.W / a.W, 2.25) && near(c.H / a.H, 2.25, 0.02), 'frameLayout: 3600 px es la misma lámina a 2,25×');
  const tall = frameLayout(1600, b, 3000);
  ok(tall.legend.h >= 3000 && tall.map.h === tall.legend.h && tall.H > a.H, 'frameLayout: crece si la leyenda necesita más alto (nada se corta)');
  ok(a.map.x + a.map.w < a.legend.x && a.legend.x + a.legend.w <= a.W && a.footer.y >= a.map.y + a.map.h, 'frameLayout: mapa, leyenda y pie no se solapan');
  const wide = frameLayout(1600, { west: 0, south: 0, east: 20, north: 0.5 }, 0);
  ok(wide.map.h >= wide.map.w * 0.55 - 1, 'frameLayout: un área muy alargada no deja un mapa diminuto');
}

// ---------------------------------------------------------------- leyenda de N clases
const mkSummary = (n: number, direction: 'risk' | 'suitability', withZones = true): GeoSummary => {
  const names = Array.from({ length: n }, (_, i) => `Clase ${i + 1}`);
  const ranges = names.map((label, i) => ({ label, from: i / n, to: (i + 1) / n }));
  return {
    title: 'Riesgo de inundación — Palmor', objective: 'Priorizar zonas para la boya', date: '2026-10-10', crs: 'EPSG:32618', resM: 50, width: 400, height: 300,
    cr: 0.0086, nExperts: 3, weightsOrigin: 'Panel de expertos (AHP, media geométrica)',
    criteria: [
      { name: 'Pendiente', weight: 0.5, effective: 0.625, layer: 'Pendiente (°)', rule: 'Menos es mejor: 1 hasta 12, 0 desde 45', veto: 'Veto si valor >= 45' },
      { name: 'Distancia al río', weight: 0.3, effective: 0.375, layer: 'Distancia', rule: 'Más es mejor: 0 hasta 100, 1 desde 500', veto: '—' },
      { name: 'Sin mapa aún', weight: 0.2, effective: 0, layer: '—', rule: '—', veto: '—' },
    ],
    direction, ranges,
    classes: [...names.map((label, i) => ({ label: label + (i === n - 1 ? ' (incluye 12 ha condición crítica)' : ''), ha: 100 + i * 10.55, pct: 100 / n })).reverse(), { label: 'Exclusión (fuera del cálculo)', ha: 33.3, pct: 0 }],
    coverage: { valid: 1000, partial: 50, none: 0 },
    layers: [{ key: 'pend', label: 'Pendiente', role: 'criterion', origin: 'Paquete del catálogo', source: 'SRTM', unit: '°', min: 0, max: 60 }],
    points: [
      { rank: 1, name: 'Punto A', lat: 11.1, lon: -74, pct: 81, classLabel: 'Clase 3', state: 'Evaluado' },
      { rank: 2, name: 'Punto B', lat: 11.0, lon: -74.1, pct: 40, classLabel: 'Clase 2', state: 'Evaluado' },
      { rank: null, name: 'Punto fuera', lat: 5, lon: -70, pct: null, classLabel: 'Fuera del área evaluada', state: 'Fuera del área evaluada' },
    ],
    pointsOrder: 'Mayor riesgo primero',
    ...(withZones ? {
      zones: {
        layer: 'Veredas', order: 'Mayor riesgo primero', classNames: names, extremeName: names[n - 1],
        rows: [
          { name: 'Vereda 1', meanPct: 62.34, ha: 80, exclHa: 2, classPct: names.map(() => 100 / n), points: 2, pop: { byClass: names.map((_, i) => 100 * (i + 1)), evaluated: 500, notEvaluated: 20, extremePct: 12.5 } },
          { name: 'Vereda 2', meanPct: null, ha: 0, exclHa: 9, classPct: names.map(() => null), points: 0, pop: { byClass: names.map(() => 0), evaluated: 0, notEvaluated: 40, extremePct: null } },
        ],
      },
    } : {}),
  } as GeoSummary;
};
for (const [n, dir] of [[2, 'suitability'], [3, 'risk'], [5, 'risk'], [8, 'suitability']] as const) {
  const s = mkSummary(n, dir);
  const rows = legendRows({ classes: s.classes, ranges: s.ranges! });
  ok(rows.length === n + 1, `leyenda N=${n}: ${n} clases + exclusión`);
  ok(rows[0].code === n && rows[n - 1].code === 1 && rows[n].code === 0 && rows[n].kind === 'exclusion', `leyenda N=${n}: de la clase más alta a la más baja, exclusión al final`);
  ok(rows[0].range.startsWith('≥') && rows[n - 1].range.startsWith('<'), `leyenda N=${n}: extremos con ≥ y <`);
  ok(rows.slice(0, n).every((r) => /\d,\d %/.test(r.value) && /ha/.test(r.value)), `leyenda N=${n}: % del área evaluada y hectáreas`);
}
ok(/valor alto es más riesgo/.test(directionLine('risk')) && /más apto/.test(directionLine('suitability')), 'directionLine según dirección');

// ---------------------------------------------------------------- puntos sin puesto
{
  const pts = [{ rank: 1 }, { rank: null }, { rank: 2 }, { rank: null }];
  const { ranked, unranked } = splitPoints(pts);
  ok(ranked.length === 2 && unranked.length === 2, 'splitPoints: con puesto / sin puesto');
  ok(unrankedNote(0) === null && /1 punto sin puesto/.test(unrankedNote(1)!) && /3 puntos sin puesto/.test(unrankedNote(3)!), 'unrankedNote: singular, plural y ninguno');
}

// ---------------------------------------------------------------- plan: lo pedido contra lo que existe
{
  const avail: ComposeAvailability = { result: true, zones: false, points: 0, references: [{ id: 'r1', name: 'Veredas' }] };
  const o = { ...defaultOptions('Título', avail, 'osm', '2026-10-10'), zones: true, points: true, referenceIds: ['r1', 'ya-no-existe'], title: '   ' };
  const p = planComposition(o, avail);
  ok(!p.opts.zones && !p.opts.points && p.opts.referenceIds.join() === 'r1', 'planComposition: omite zonas/puntos/referencias inexistentes');
  ok(p.opts.title === 'Mapa sin título' && p.warnings.length === 2, 'planComposition: título vacío y avisos de lo omitido');
  ok(!planComposition({ ...o, result: true }, { ...avail, result: false }).opts.result, 'planComposition: sin resultado calculado no se dibuja');
  const d = defaultOptions('T', { ...avail, points: 4, zones: true }, 'osm', '2026-10-10');
  ok(d.result && d.style === 'classes' && !d.zones && d.points && d.referenceIds.length === 1 && d.width === 2400, 'defaultOptions: resultado por clases, referencia y puntos sí; zonas no');
  ok(composeFileName('mapa', 2400, 'pdf') === 'mapa_composicion_2400px.pdf', 'composeFileName');
}

// ---------------------------------------------------------------- pie y texto
{
  const lines = footerLines({ basemapAttr: '© OpenStreetMap', sources: ['SRTM', 'SRTM', ' ', 'CHIRPS'], dataAttribution: 'IGAC', date: '2026-10-10', appName: 'MCDA Tools', version: APP_VERSION, doi: APP_DOI });
  const all = lines.join(' ');
  ok(all.includes('© OpenStreetMap') && all.includes('IGAC') && all.includes('SRTM; CHIRPS') && !/SRTM; SRTM/.test(all), 'footerLines: base, datos sin duplicados');
  ok(all.includes(`v${APP_VERSION}`) && all.includes(APP_DOI) && all.includes('10 de octubre de 2026'), 'footerLines: versión y DOI de version.ts, fecha');
  ok(/Sin mapa base/.test(footerLines({ basemapAttr: null, sources: [], date: '2026-10-10', appName: 'x', version: '1', doi: 'd' })[0]), 'footerLines: sin mapa base se dice');
  const long = 'Un texto largo '.repeat(30).trim();
  const w = wrapLines(long, 200, (s) => s.length * 6);
  ok(w.length > 1 && w.every((l) => l.length * 6 <= 200) && w.join(' ') === long, 'wrapLines: parte por ancho sin perder ni truncar texto');
  ok(wrapLines('supercalifragilisticoespialidoso corto', 50, (s) => s.length * 6).join(' ') === 'supercalifragilisticoespialidoso corto', 'wrapLines: una palabra más ancha va sola');
}

// ---------------------------------------------------------------- geometrías
{
  const p = geomPaths({ type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]], [[0.2, 0.2], [0.4, 0.2], [0.2, 0.4], [0.2, 0.2]]], [[[5, 5], [6, 5], [6, 6], [5, 5]]]] });
  ok(p.rings.length === 3 && p.lines.length === 0 && p.points.length === 0, 'geomPaths: MultiPolygon con huecos y varias partes');
  const q = geomPaths({ type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [1, 2] }, { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, { type: 'MultiPoint', coordinates: [[3, 3], [4, 4]] }] });
  ok(q.points.length === 3 && q.lines.length === 1, 'geomPaths: colección con puntos y líneas');
  ok(geomPaths(null).rings.length === 0, 'geomPaths: geometría nula');
}

// ---------------------------------------------------------------- PDF mínimo
{
  const jpeg = new Uint8Array(1000).map((_, i) => (i * 31) & 0xff);
  jpeg[0] = 0xff; jpeg[1] = 0xd8;
  const pdf = jpegToPdf(jpeg, 2400, 1800, { title: 'Mapa de riesgo — Año' });
  const txt = new TextDecoder('latin1').decode(pdf);
  ok(txt.startsWith('%PDF-1.4') && txt.trimEnd().endsWith('%%EOF'), 'PDF: cabecera y fin');
  const sx = Number(/startxref\n(\d+)\n/.exec(txt)![1]);
  ok(txt.slice(sx, sx + 4) === 'xref', 'PDF: startxref apunta a la tabla xref');
  const offs = [...txt.slice(sx).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
  ok(offs.length === 6 && offs.every((o, i) => txt.slice(o, o + 8).startsWith(`${i + 1} 0 obj`)), 'PDF: cada objeto está en el desplazamiento de la xref');
  ok(/\/Width 2400 \/Height 1800/.test(txt) && /\/Filter \/DCTDecode \/Length 1000/.test(txt), 'PDF: imagen JPEG con su tamaño');
  const mb = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(txt)!;
  ok(Number(mb[1]) > Number(mb[2]), 'PDF: imagen apaisada = página A4 horizontal');
  const portrait = new TextDecoder('latin1').decode(jpegToPdf(jpeg, 1000, 1600));
  const pm = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(portrait)!;
  ok(Number(pm[1]) < Number(pm[2]), 'PDF: imagen vertical = A4 vertical');
  let found = false;
  for (let i = 0; i + jpeg.length <= pdf.length && !found; i++) { if (pdf[i] === 0xff && pdf[i + 1] === 0xd8 && pdf[i + 500] === jpeg[500] && pdf[i + 999] === jpeg[999]) found = true; }
  ok(found, 'PDF: los bytes del JPEG van intactos');
  ok(/\/Title <FEFF/.test(txt), 'PDF: título en UTF-16BE (admite tildes)');
}

// ---------------------------------------------------------------- informe
const ahp = (): AhpSummary => ({
  method: 'eigenvector', names: ['Pendiente', 'Distancia al río', 'Sin mapa aún'], matrix: [[1, 2, 3], [0.5, 1, 2], [1 / 3, 0.5, 1]], weights: [0.5, 0.3, 0.2],
  lambda: 3.0092, ci: 0.0046, ri: 0.58, cr: 0.0086, consensus: { sStar: 0.82, category: 'high' },
  uncertainty: { minus: [0.01, 0.02, 0.01], plus: [0.012, 0.02, 0.01], accepted: 900, runs: 1000, delta: 0.5 },
  experts: [{ label: 'Experto 1', weights: [0.5, 0.3, 0.2], cr: 0.01 }, { label: 'Experto 2', weights: [0.5, 0.3, 0.2], cr: 0.12 }, { label: 'Experto 3', weights: [0.5, 0.3, 0.2], cr: 0.02 }],
});
for (const [n, dir] of [[3, 'suitability'], [5, 'risk'], [8, 'risk']] as const) {
  const s = mkSummary(n, dir);
  const r = buildGeoReport({ summary: s, ahp: ahp(), hasMap: true });
  const ids = r.sections.map((x) => x.id).join(',');
  ok(ids === 'objective,weights,rules,map,classes,zones,points,methodology,citation', `informe N=${n} ${dir}: secciones en orden (${ids})`);
  const cls = r.sections.find((x) => x.id === 'classes')!.tables[0];
  ok(cls.rows.length === n + 1, `informe N=${n}: tabla de área por clase con ${n} clases + exclusión`);
  ok(cls.rows[0][2] === fmtNum(s.classes[0].ha, s.classes[0].ha >= 100 ? 0 : 1) && cls.rows[0][3] === fmtPct(s.classes[0].pct), `informe N=${n}: ha y % salen de GeoSummary sin recalcular`);
  ok(cls.rows[n][1] === '—' && cls.rows[n][3] === '—', `informe N=${n}: la exclusión no lleva % ni rango`);
  const text = JSON.stringify(r);
  ok(dir === 'risk' ? /Índice de riesgo/.test(text) && /más riesgo/.test(text) : /Índice de idoneidad/.test(text) && /más apto/.test(text), `informe N=${n}: textos de la dirección ${dir}`);
}
{
  const s = mkSummary(4, 'risk');
  const r = buildGeoReport({ summary: s, ahp: ahp(), hasMap: true });
  const w = r.sections.find((x) => x.id === 'weights')!;
  ok(w.paragraphs.some((p) => p.includes('CR = 0,0086') && p.includes('aceptable')), 'informe: CR de criterios y su lectura');
  ok(w.paragraphs.some((p) => p.includes('S* = 82,0 %') && p.includes('alto')), 'informe: consenso del panel');
  ok(w.tables[0].rows[2][2] === 'Sin mapa', 'informe: un criterio sin mapa dice «Sin mapa», no 0 %');
  ok(w.tables[0].head.includes('− Δ'), 'informe: incertidumbre de los pesos');
  const ex = w.tables[1];
  ok(ex.rows.map((x) => x[0]).join() === 'Experto 1,Experto 2,Experto 3' && ex.rows[1][2].startsWith('Revisar'), 'informe: expertos sin nombre, con su CR');
  const pts = r.sections.find((x) => x.id === 'points')!.tables[0];
  ok(pts.rows[2][0] === 'Sin puesto' && pts.rows[2][4] === 'Sin índice' && pts.rows[0][0] === '1', 'informe: puntos sin puesto dicen «Sin puesto» y «Sin índice», nunca 0');
  const z = r.sections.find((x) => x.id === 'zones')!;
  ok(z.tables[0].rows[1][1] === 'Sin área evaluada' && z.tables[0].rows[1][4] === '—', 'informe: zona sin área evaluada, sin 0 %');
  ok(z.tables.length === 2 && z.tables[1].rows[0][1] === '100' && z.tables[1].rows[0].at(-1) === '12,5 %', 'informe: exposición de población por clase y % en la clase extrema');
  const m = r.sections.find((x) => x.id === 'methodology')!;
  ok(m.paragraphs.length === 2 && m.paragraphs.every((p) => p.includes(APP_VERSION) && p.includes(APP_DOI)), 'informe: metodología es/en con versión y DOI de version.ts');
  ok(/El mapa se elaboró/.test(m.paragraphs[0]) && /The map was produced/.test(m.paragraphs[1]), 'informe: párrafo en español e inglés');
  ok(r.version.version === APP_VERSION && r.version.doi === APP_DOI, 'informe: versión y DOI de version.ts');
  ok(r.sections.find((x) => x.id === 'citation')!.paragraphs[0].includes(APP_DOI) && r.sections.find((x) => x.id === 'citation')!.paragraphs[0].includes(APP_VERSION), 'informe: cita con versión y DOI');
  ok(!/Miguel|Polo/.test(JSON.stringify(r.sections.filter((x) => x.id !== 'citation'))), 'informe: ningún nombre de persona fuera de la cita');
  ok(r.banners.length === 0, 'informe: sin avisos con juicios consistentes');
}
{
  const s = { ...mkSummary(3, 'suitability', false), cr: 0.14, points: undefined };
  const r = buildGeoReport({ summary: s, ahp: null, exploring: true, exampleData: true });
  ok(r.banners.length === 3 && r.banners.some((b) => /EJEMPLO/.test(b.text)) && r.banners.some((b) => /EXPLORADOS/.test(b.text)) && r.banners.some((b) => /inconsistentes/.test(b.text)), 'informe: avisos de ejemplo, pesos explorados y CR ≥ 0,10');
  ok(!r.sections.some((x) => x.id === 'zones' || x.id === 'points'), 'informe: sin zonas ni puntos no hay esas secciones');
  ok(r.sections.find((x) => x.id === 'weights')!.paragraphs.some((p) => /NO aceptable/.test(p)), 'informe: CR ≥ 0,10 se declara no aceptable');
  const none = buildGeoReport({ summary: { ...mkSummary(3, 'suitability', false), nExperts: 0 }, ahp: null });
  ok(none.sections.find((x) => x.id === 'weights')!.paragraphs.some((p) => /pesan lo mismo/.test(p)), 'informe: sin expertos, pesos iguales');
  ok(/CR no aplica|pesos iguales/.test(buildGeoMethodologyParagraph({ criteria: [{ name: 'A', weight: 0.5 }, { name: 'B', weight: 0.5 }], expertCount: 0, direction: 'suitability', nClasses: 3 }, 'es')), 'metodología de mapas: sin expertos');
}

if (fails) { console.error(`\n${fails} verificación(es) fallaron`); process.exit(1); }
console.log('\nTodo OK');
