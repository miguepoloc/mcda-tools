// Importación de puntos: CSV (coma, «;», coma decimal, x/y), GeoJSON Point/MultiPoint y tope de 300.
import { mergeImported, parseCsvPoints, parseDecimal, pointsFromFc } from '../src/lib/geo/pointsImport.ts';
import { MAX_POINTS, type GeoPoint } from '../src/lib/geo/points.ts';

let fails = 0;
const ok = (c: boolean, n: string) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + n); if (!c) fails++; };

// --- números
ok(parseDecimal('4,5') === 4.5 && parseDecimal('-74.25') === -74.25 && parseDecimal(' 11,0 ') === 11 && Number.isNaN(parseDecimal('4,5,6')) && Number.isNaN(parseDecimal('abc')) && Number.isNaN(parseDecimal('')), 'parseDecimal: punto y coma decimal');

// --- CSV con coma
{
  const r = parseCsvPoints('nombre,lat,lon\nA,11.2,-74.1\nB,10.5,-73.9\n');
  ok(r.rows.length === 2 && r.errors.length === 0 && r.rows[0].name === 'A' && r.rows[1].lon === -73.9, 'CSV con coma');
}
// --- CSV con «;» y coma decimal, BOM, CRLF, tildes en la cabecera
{
  const r = parseCsvPoints('﻿Nombre;Latitud;Longitud\r\nBoya 1;11,2345;-74,1\r\nBoya 2;10,5;-73,9\r\n');
  ok(r.rows.length === 2 && r.rows[0].lat === 11.2345 && r.rows[0].lon === -74.1 && r.rows[0].name === 'Boya 1', 'CSV con «;», coma decimal, BOM y CRLF');
}
// --- x,y sin nombre
{
  const r = parseCsvPoints('x,y\n-74.1,11.2\n-73.9,10.5');
  ok(r.rows.length === 2 && r.rows[0].lon === -74.1 && r.rows[0].lat === 11.2 && r.rows[0].name === '', 'CSV x,y (x = longitud) sin nombre');
}
// --- campo entre comillas con el separador y comillas dobles
{
  const r = parseCsvPoints('nombre,lat,lon\n"Playa, norte",11.2,-74.1\n"Punto ""A""",10,-73');
  ok(r.rows.length === 2 && r.rows[0].name === 'Playa, norte' && r.rows[1].name === 'Punto "A"', 'CSV con comillas');
}
// --- filas inválidas con su número de línea
{
  const r = parseCsvPoints('nombre,lat,lon\nok,11,-74\nmal,abc,-74\nlejos,95,-74\nvuelta,120,11\nfalta,5,\n\nlon,5,200\nbien,1,2');
  const lines = r.errors.map((e) => e.line);
  ok(r.rows.length === 2, `CSV: filas válidas ${r.rows.length}`);
  ok(JSON.stringify(lines) === JSON.stringify([3, 4, 5, 6, 8]), `CSV: líneas con error ${JSON.stringify(lines)}`);
  ok(/no es un número/.test(r.errors[0].msg) && /fuera de rango/.test(r.errors[1].msg) && /invertiste/.test(r.errors[2].msg) && /falta/.test(r.errors[3].msg) && /longitud 200/.test(r.errors[4].msg), 'CSV: mensajes de error en español');
}
// --- sin columnas lat/lon
{
  const r = parseCsvPoints('a,b\n1,2');
  ok(r.rows.length === 0 && r.errors.length === 1 && r.errors[0].line === 1, 'CSV sin columnas de coordenadas: un error claro');
  ok(parseCsvPoints('').errors.length === 1 && parseCsvPoints('nombre,lat,lon\n').errors.length === 1, 'CSV vacío o solo cabecera');
}
// --- GeoJSON
{
  const fc = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { name: 'P1', otro: 'x' }, geometry: { type: 'Point', coordinates: [-74.1, 11.2, 12] } },
      { type: 'Feature', properties: { name: 'Multi' }, geometry: { type: 'MultiPoint', coordinates: [[-74, 11], [-73.5, 10.5]] } },
      { type: 'Feature', properties: { name: 'Poligono' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } },
      { type: 'Feature', properties: { name: 'Mal' }, geometry: { type: 'Point', coordinates: [-74, 300] } },
    ],
  };
  const r = pointsFromFc(fc);
  ok(r.rows.length === 3 && r.rows[0].name === 'P1' && r.rows[0].lat === 11.2 && r.rows[1].name === 'Multi 1' && r.rows[2].name === 'Multi 2', 'GeoJSON Point + MultiPoint (altitud ignorada, nombres numerados)');
  ok(r.errors.length === 2 && r.errors.some((e) => e.line === 4 && /fuera de rango/.test(e.msg)) && r.errors.some((e) => e.line === null && /no son puntos/.test(e.msg)), 'GeoJSON: polígonos omitidos y rango validado');
  ok(r.nameField === 'name' && r.nameFields.includes('otro'), 'GeoJSON: propiedad de nombre detectada y opciones');
  const r2 = pointsFromFc(fc, 'otro');
  ok(r2.rows[0].name === 'x' && r2.rows[1].name === '', 'GeoJSON: propiedad de nombre elegida por el usuario');
  ok(pointsFromFc({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { NOMBRE: 'Mayus' }, geometry: { type: 'Point', coordinates: [1, 2] } }] }).rows[0].name === 'Mayus', 'GeoJSON: NOMBRE en mayúsculas');
  ok(pointsFromFc({ nope: 1 }).errors.length === 1, 'GeoJSON inválido');
}
// --- tope de 300 y nombres por defecto
{
  const rows = Array.from({ length: 350 }, (_, i) => ({ name: '', lat: i / 10, lon: 0 }));
  const base: GeoPoint[] = [{ id: 'a', name: 'Punto 7', lat: 0, lon: 0 }];
  const m = mergeImported(base, rows);
  ok(m.points.length === MAX_POINTS && m.added === MAX_POINTS - 1 && m.dropped === 350 - (MAX_POINTS - 1), `tope de ${MAX_POINTS}: agrega ${m.added}, descarta ${m.dropped}`);
  ok(m.points[1].name === 'Punto 8' && m.points[2].name === 'Punto 9', 'nombres por defecto continúan tras el mayor «Punto N»');
  ok(new Set(m.points.map((p) => p.id)).size === m.points.length, 'ids únicos');
  const full = mergeImported(m.points, rows.slice(0, 5));
  ok(full.added === 0 && full.dropped === 5 && full.points.length === MAX_POINTS, 'con la lista llena no agrega');
}
console.log(fails === 0 ? '\nTodo OK (check-geo-points-import)' : `\n${fails} fallas`);
process.exit(fails ? 1 : 0);
