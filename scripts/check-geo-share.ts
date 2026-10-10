// Pestañas Exportar/Compartir del geovisor: grupos de descargas, estado de publicación y filas de visibilidad.
import { exportGroups, publicLink, publishView, viewerRows, type ExportCtx } from '../src/lib/geo/share.ts';
import { publishParts, type SigInput } from '../src/lib/geo/publishSig.ts';

let fails = 0;
const ok = (n: string, c: boolean, e = '') => { if (!c) { fails++; console.error('FALLA', n, e); } else console.log('ok   ', n, e); };

const ctx = (o: Partial<ExportCtx> = {}): ExportCtx => ({ noun: 'idoneidad', crs: 'EPSG:32618', classNames: ['Baja', 'Media', 'Alta'], critical: 'No apta', parcels: null, hasPoints: false, hasZones: false, ...o });
const keys = (c: ExportCtx, id: string) => exportGroups(c).find((g) => g.id === id)!.items.map((i) => i.k);

// ---- grupos de descargas
const g = exportGroups(ctx());
ok('4 grupos en orden', g.map((x) => x.id).join() === 'informe,sig,mas,todo');
ok('informe: componer, informe, excel', keys(ctx(), 'informe').join() === 'compose,report,xls');
ok('sig: tif y kmz', keys(ctx(), 'sig').join() === 'tif,kmz');
ok('todo: zip primario', g[3].items.length === 1 && g[3].items[0].k === 'zip' && !!g[3].items[0].primary);
ok('«Más formatos» plegado, los demás no', g.filter((x) => x.folded).map((x) => x.id).join() === 'mas');
ok('sin parcelas/puntos/zonas: no aparecen', keys(ctx(), 'mas').join() === 'cls,csv,png,pngr');
ok('con parcelas aparecen ptif y pcsv', keys(ctx({ parcels: { n: 3, minHa: 5, label: 'parcela contigua' } }), 'mas').includes('ptif'));
ok('parcelas con n=0 no aparecen', !keys(ctx({ parcels: { n: 0, minHa: 5, label: 'x' } }), 'mas').includes('pcsv'));
ok('con puntos y zonas aparecen sus CSV', ['rank', 'zcsv'].every((k) => keys(ctx({ hasPoints: true, hasZones: true }), 'mas').includes(k as never)));
ok('claves únicas', (() => { const all = exportGroups(ctx({ hasPoints: true, hasZones: true, parcels: { n: 1, minHa: 1, label: 'x' } })).flatMap((x) => x.items.map((i) => i.k)); return new Set(all).size === all.length; })());
ok('cada ítem: nombre y UNA línea corta', exportGroups(ctx({ hasPoints: true, hasZones: true })).flatMap((x) => x.items).every((i) => i.label && i.desc.length > 0 && i.desc.length <= 140 && !i.desc.includes('\n')));
ok('componer e informe abren diálogo', g[0].items[0].opens === true && g[0].items[1].opens === true && !g[0].items[2].opens);
ok('el GeoTIFF nombra el sustantivo y el CRS', g[1].items[0].label.includes('idoneidad') && g[1].items[0].desc.includes('EPSG:32618'));
ok('clases numeradas en el GeoTIFF de clases', g[2].items[0].desc.startsWith('1 baja · 2 media · 3 alta · 0 no apta'));

// ---- estado de publicación
const grid = { width: 10, height: 8, resM: 250, haPerPixel: 6.25, crs: 'EPSG:32618' } as never;
const base = (): SigInput => ({
  criteria: [{ id: 'c1' }, { id: 'c2' }], weights: [0.6, 0.4],
  rules: { c1: { layerKey: 'temp', fn: { type: 'up', a: 0, b: 10 } as never } },
  thresholds: { alta: 0.7, media: 0.45 }, layers: { temp: { role: 'criterion', min: 0, max: 30, bytes: 10 } }, grid,
});
const P0 = publishParts(base());
const st = (parts = P0) => ({ updated_at: '2026-01-01T00:00:00Z', sig: 'viejo', parts });
ok('sin publicar', publishView(null, P0, 'x').state === 'never');
ok('al día', publishView(st(), P0, 'x').state === 'current' && publishView(st(), P0, 'x').label === 'Al día');
const w = base(); w.rules.c2 = { layerKey: 'temp', fn: { type: 'up', a: 0, b: 10 } as never };
const v = publishView(st(), publishParts(w), 'x');
ok('desactualizada dice qué cambió', v.state === 'stale' && v.label.startsWith('Hay cambios sin publicar: ') && v.label.includes('pesos') && v.label.includes('reglas'), v.label);
const pw = base(); pw.points = { show: true, list: [{ name: 'A', lat: 1, lon: 2 }] };
ok('puntos: lo publicado sin puntos se marca', publishView(st(), publishParts(pw), 'x').changed.join() === 'puntos');
const old = { updated_at: '2026-01-01T00:00:00Z', sig: 'abc', parts: null };
ok('publicación antigua: compara el hash', publishView(old, P0, 'abc').state === 'current' && publishView(old, P0, 'zzz').state === 'stale');
ok('antigua desactualizada: aviso genérico', publishView(old, P0, 'zzz').changed.length === 0 && publishView(old, P0, 'zzz').label.includes('pesos, reglas o capas'));
ok('parts null (cargando) con firma por partes: al día', publishView(st(), null, 'x').state === 'current');
ok('el botón cambia de nombre', publishView(null, P0, 'x').action === 'Publicar el mapa' && publishView(st(), P0, 'x').action === 'Actualizar el mapa publicado');

// ---- qué ve quien abra el enlace
const rows = (o: Partial<Parameters<typeof viewerRows>[0]> = {}) => viewerRows({ showPoints: false, showZones: false, nPoints: 3, zonesReady: true, hasPop: false, published: false, ...o });
ok('3 filas, la del mapa fija y marcada', rows().length === 3 && rows()[0].locked === true && rows()[0].checked === true);
ok('sin interruptores no hay advertencias', rows().every((r) => !r.warn));
ok('puntos: advertencia de privacidad con la cuenta', rows({ showPoints: true })[1].warn?.includes('tus 3 puntos') === true);
ok('un solo punto en singular', rows({ showPoints: true, nPoints: 1 })[1].warn?.includes('tu punto') === true);
ok('zonas sin capa: pide elegirla', rows({ showZones: true, zonesReady: false })[2].warn?.includes('pestaña «Zonas»') === true);
ok('zonas con población lo dice', rows({ showZones: true, hasPop: true })[2].warn?.includes('personas evaluadas') === true);
ok('el aviso nombra el botón según haya publicación', rows({ showPoints: true, published: true })[1].warn?.includes('«Actualizar el mapa publicado»') === true && rows({ showPoints: true })[1].warn?.includes('«Publicar el mapa»') === true);
ok('enlace público', publicLink('https://mcda.tools', 'abc') === 'https://mcda.tools/p/abc');

if (fails) { console.error(`\n${fails} verificaciones fallaron`); process.exit(1); }
console.log('\ncheck-geo-share: OK');
