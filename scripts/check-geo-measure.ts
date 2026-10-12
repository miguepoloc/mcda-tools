// Regla del Geovisor (G11): distancias y áreas geodésicas, reductor de la herramienta y formato.
import { addVertex, areaUnits, clear, close, EMPTY, fmtArea, fmtLength, haversine, MAX_VERTICES, measure, pathLength, polygonArea, removeAt, selfIntersects, summaryText, toFeatureCollection, undo, wrapLon, type LL, type MeasureState } from '../src/lib/geo/measure.ts';

let fails = 0;
const ok = (c: boolean, n: string) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + n); if (!c) fails++; };
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const rel = (a: number, b: number) => Math.abs(a - b) / b;
const box = (w: number, s: number, e: number, n: number): LL[] => [{ lat: s, lon: w }, { lat: s, lon: e }, { lat: n, lon: e }, { lat: n, lon: w }];

// --- distancias
ok(near(haversine({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }), 111195, 60), '1° de latitud ≈ 111,19 km');
ok(near(haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }), 111195, 60), '1° de longitud en el ecuador ≈ 111,19 km');
ok(near(haversine({ lat: 60, lon: 0 }, { lat: 60, lon: 1 }), 55600, 100), '1° de longitud a 60° ≈ la mitad (no planar en grados)');
ok(near(haversine({ lat: 51.5074, lon: -0.1278 }, { lat: 48.8566, lon: 2.3522 }), 343500, 1500), 'Londres–París ≈ 343,5 km');
ok(haversine({ lat: 10, lon: 20 }, { lat: 10, lon: 20 }) === 0, 'distancia a sí mismo = 0');
ok(near(haversine({ lat: 3, lon: 179.5 }, { lat: 3, lon: -179.5 }), haversine({ lat: 3, lon: 0 }, { lat: 3, lon: 1 }), 1), 'cruza el antimeridiano por el lado corto');
ok(near(haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 180 }), Math.PI * 6371008.8, 1), 'media vuelta al ecuador = π·R');
ok(near(pathLength([{ lat: 0, lon: 0 }, { lat: 1, lon: 0 }, { lat: 2, lon: 0 }]), 2 * 111195, 120), 'largo de una poligonal suma tramos');

// --- áreas
const A1 = polygonArea(box(0, 0, 1, 1));
ok(rel(A1, 12308e6) < 0.002, `1°×1° en el ecuador ≈ 12 308 km² (${(A1 / 1e6).toFixed(1)})`);
const A60 = polygonArea(box(0, 60, 1, 61));
ok(A60 / 1e6 > 6080 && A60 / 1e6 < 6160, `1°×1° a 60° ≈ 6 100 km² (${(A60 / 1e6).toFixed(1)}): menor que en el ecuador`);
const tiny = polygonArea(box(-74, 11, -73.999, 11.001));
ok(rel(tiny, 12085) < 0.01, `0,001°×0,001° a 11° ≈ 12 085 m² (${tiny.toFixed(0)})`);
ok(near(polygonArea([...box(0, 0, 1, 1)].reverse()), A1, 1), 'el sentido (horario/antihorario) no cambia el área');
ok(rel(polygonArea(box(179.5, 0, 180.5, 1)), A1) < 1e-6, 'rectángulo sobre el antimeridiano = mismo área');
ok(rel(polygonArea(box(-0.5, -0.5, 0.5, 0.5)), A1) < 0.002, 'rectángulo centrado en (0,0) ≈ 12 308 km²');
ok(polygonArea([{ lat: 0, lon: 0 }, { lat: 1, lon: 1 }]) === 0, 'menos de 3 vértices: área 0');
const big = polygonArea(box(-10, -10, 10, 10));
// 4,90 M km² con aristas sobre los paralelos; ~1 % más porque aquí las aristas son círculos máximos (se abomban hacia el polo)
ok(big / 1e6 > 4.90e6 && big / 1e6 < 4.98e6, `20°×20° con aristas geodésicas ≈ 4,95 millones de km² (${(big / 1e6).toFixed(0)})`);
ok(!selfIntersects(box(0, 0, 1, 1)), 'cuadrado no se autointersecta');
ok(selfIntersects([{ lat: 0, lon: 0 }, { lat: 1, lon: 1 }, { lat: 0, lon: 1 }, { lat: 1, lon: 0 }]), 'moño sí se autointersecta');

// --- reductor
let s: MeasureState = EMPTY;
s = addVertex(s, 0, 0); s = addVertex(s, 0, 1); s = addVertex(s, 1, 1);
ok(s.pts.length === 3 && !s.closed, 'añade vértices');
ok(addVertex(s, 1, 1).pts.length === 3, 'ignora un vértice idéntico al anterior (doble clic)');
ok(addVertex(s, NaN, 1) === s && addVertex(s, 95, 1) === s, 'ignora coordenadas no válidas');
ok(addVertex(s, 2, 190).pts[3].lon === -170, 'normaliza longitudes fuera de rango');
const m3 = measure(s);
ok(m3.legs.length === 2 && near(m3.total, 2 * 111195, 120) && near(m3.last!.m, 111195, 60) && m3.area === null, 'medición abierta: parciales, total, sin área');
ok(near(m3.legs[1].cum, m3.total, 1e-6), 'el acumulado del último tramo = total');
ok(close({ pts: s.pts.slice(0, 2), closed: false }).closed === false, 'no cierra con menos de 3 vértices');
const c = close(s);
const mc = measure(c);
ok(c.closed && mc.area !== null && mc.area > 0 && mc.legs.length === 3 && near(mc.perimeter!, mc.total, 1e-6), 'cierra: área y perímetro (con tramo de cierre)');
ok(addVertex(c, 5, 5) === c, 'cerrado no admite más vértices');
ok(!undo(c).closed && undo(c).pts.length === 3, 'deshacer sobre cerrado solo lo reabre');
ok(undo(undo(c)).pts.length === 2, 'deshacer quita el último vértice');
ok(undo(EMPTY) === EMPTY, 'deshacer sin vértices no hace nada');
ok(clear().pts.length === 0 && !clear().closed, 'limpiar');
ok(!removeAt(c, 0).closed && removeAt(c, 0).pts.length === 2, 'quitar un vértice de un triángulo lo reabre');
ok(removeAt(s, 9) === s, 'índice inexistente se ignora');
let cap = EMPTY;
for (let i = 0; i < MAX_VERTICES + 20; i++) cap = addVertex(cap, (i % 90) * 0.5, i * 0.01);
ok(cap.pts.length === MAX_VERTICES, `tope de ${MAX_VERTICES} vértices`);
ok(wrapLon(181) === -179 && wrapLon(-181) === 179 && wrapLon(180) === -180 && wrapLon(30) === 30, 'wrapLon');

// --- geometría para el mapa
const fcOpen = toFeatureCollection(s);
ok(fcOpen.features.filter((f) => f.geometry?.type === 'Point').length === 3 && fcOpen.features.some((f) => f.geometry?.type === 'LineString'), 'abierta: vértices + línea');
const fcClosed = toFeatureCollection(c);
ok(fcClosed.features.some((f) => f.geometry?.type === 'Polygon') && !fcClosed.features.some((f) => f.geometry?.type === 'LineString'), 'cerrada: polígono');
ok(toFeatureCollection(EMPTY).features.length === 0 && toFeatureCollection(addVertex(EMPTY, 1, 1)).features.length === 1, 'vacía / un vértice');

// --- formato
ok(/^845 m$/.test(fmtLength(845.2)) && /km$/.test(fmtLength(12345)) && fmtLength(NaN) === '—', 'fmtLength');
ok(/ m²$/.test(fmtArea(5000)) && / ha$/.test(fmtArea(2e5)) && / km²$/.test(fmtArea(3e6)), 'fmtArea elige m², ha, km²');
const u = areaUnits(25_000);
ok(u.m2.endsWith('m²') && u.ha.includes('2,5') && u.km2.endsWith('km²'), 'areaUnits: 25 000 m² = 2,5 ha');

ok(/^Sin vértices/.test(summaryText(EMPTY)) && /^1 vértice\./.test(summaryText(addVertex(EMPTY, 1, 1))), 'summaryText: vacío y un vértice');
ok(/3 vértices\. Último tramo: .* km\. Total: .* km\./.test(summaryText(s)), 'summaryText: abierta (parcial y total)');
ok(/Área: .*Perímetro: .* km\./.test(summaryText(c)) && !/cruzan/.test(summaryText(c)), 'summaryText: cerrada (área y perímetro)');
const bow: MeasureState = { pts: [{ lat: 0, lon: 0 }, { lat: 1, lon: 1 }, { lat: 0, lon: 1 }, { lat: 1, lon: 0 }], closed: true };
ok(/cruzan/.test(summaryText(bow)), 'summaryText: avisa si los lados se cruzan');

if (fails) { console.log(`\n${fails} verificación(es) fallaron`); process.exit(1); }
console.log('\nTodas las verificaciones de la regla pasaron');
