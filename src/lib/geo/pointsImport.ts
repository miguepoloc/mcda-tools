/** Importación de puntos desde texto: CSV (columnas nombre,lat,lon o x,y; separador coma, punto y coma o tabulador;
 * coma decimal) y GeoJSON (Point / MultiPoint). Puro: la lectura de archivos (GeoJSON, KML, zip…) la hace
 * `parse.ts` en el cliente y entrega la FeatureCollection a `pointsFromFc`. Ver `scripts/check-geo-points-import.ts`. */
import { MAX_POINTS, newPointId, nextPointName, round6, type GeoPoint } from './points.ts';

export type ImportRow = { name: string; lat: number; lon: number };
/** `line` = línea del archivo (la cabecera es la 1) o número de entidad en GeoJSON; null = aviso general. */
export type ImportError = { line: number | null; msg: string };
export type ImportResult = {
  rows: ImportRow[];
  errors: ImportError[];
  /** GeoJSON: propiedades de texto disponibles para elegir como nombre. */
  nameFields: string[];
  /** GeoJSON: la propiedad que se usó como nombre ('' si ninguna). */
  nameField: string;
};

export const MAX_IMPORT_ROWS = 5000;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const NAME_KEYS = ['nombre', 'name', 'punto', 'id', 'etiqueta', 'label', 'sitio', 'estacion', 'site'];
const LAT_KEYS = ['lat', 'latitud', 'latitude', 'y'];
const LON_KEYS = ['lon', 'lng', 'long', 'longitud', 'longitude', 'x'];

/** Número con punto o coma decimal («4,5» o «4.5»); NaN si no es un número limpio. */
export function parseDecimal(raw: string): number {
  const s = raw.trim().replace(/\s+/g, '');
  if (!s) return NaN;
  if (/^[-+−]?\d+,\d+$/.test(s)) return Number(s.replace('−', '-').replace(',', '.'));
  if (/^[-+−]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return Number(s.replace('−', '-'));
  return NaN;
}

/** Divide el texto en registros respetando comillas (un campo entre comillas puede llevar el separador). */
function splitRecords(text: string, delim: string): { line: number; cells: string[] }[] {
  const out: { line: number; cells: string[] }[] = [];
  let cells: string[] = [], cur = '', q = false, line = 1, start = 1;
  const endRecord = () => {
    cells.push(cur);
    if (cells.some((c) => c.trim() !== '')) out.push({ line: start, cells });
    cells = []; cur = '';
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else { if (ch === '\n') line++; cur += ch; }
    } else if (ch === '"') q = true;
    else if (ch === delim) { cells.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRecord(); line++; start = line;
    } else cur += ch;
  }
  if (cur !== '' || cells.length) endRecord();
  return out;
}

const empty = (): ImportResult => ({ rows: [], errors: [], nameFields: [], nameField: '' });

function rangeError(lat: number, lon: number): string | null {
  if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) return `latitud ${lat} fuera de rango (−90 a 90): ¿invertiste latitud y longitud?`;
  if (Math.abs(lat) > 90) return `latitud ${lat} fuera de rango (−90 a 90)`;
  if (Math.abs(lon) > 180) return `longitud ${lon} fuera de rango (−180 a 180)`;
  return null;
}

export function parseCsvPoints(input: string): ImportResult {
  const res = empty();
  const text = input.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  const delim = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';
  const recs = splitRecords(text, delim);
  if (!recs.length) { res.errors.push({ line: null, msg: 'El archivo está vacío.' }); return res; }
  const head = recs[0].cells.map(fold);
  const find = (keys: string[]) => { for (const k of keys) { const i = head.indexOf(k); if (i >= 0) return i; } return -1; };
  const iLat = find(LAT_KEYS), iLon = find(LON_KEYS), iName = find(NAME_KEYS);
  if (iLat < 0 || iLon < 0) {
    res.errors.push({ line: 1, msg: 'No encuentro las columnas de latitud y longitud en la primera fila. Usa una cabecera como «nombre,lat,lon» (o «x,y»: x = longitud, y = latitud).' });
    return res;
  }
  const body = recs.slice(1);
  for (let k = 0; k < body.length; k++) {
    const { line, cells } = body[k];
    if (res.rows.length + res.errors.length >= MAX_IMPORT_ROWS) { res.errors.push({ line, msg: `El archivo tiene más de ${MAX_IMPORT_ROWS} filas: se ignoran las siguientes.` }); break; }
    const latRaw = cells[iLat] ?? '', lonRaw = cells[iLon] ?? '';
    if (latRaw.trim() === '' || lonRaw.trim() === '') { res.errors.push({ line, msg: 'falta la latitud o la longitud' }); continue; }
    const lat = parseDecimal(latRaw), lon = parseDecimal(lonRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      res.errors.push({ line, msg: `«${(Number.isFinite(lat) ? lonRaw : latRaw).trim()}» no es un número (usa punto o coma decimal)` });
      continue;
    }
    const bad = rangeError(lat, lon);
    if (bad) { res.errors.push({ line, msg: bad }); continue; }
    res.rows.push({ name: iName >= 0 ? (cells[iName] ?? '').trim() : '', lat: round6(lat), lon: round6(lon) });
  }
  if (!res.rows.length && !res.errors.length) res.errors.push({ line: null, msg: 'El archivo no tiene filas de datos debajo de la cabecera.' });
  return res;
}

type FcLike = { features?: { geometry?: { type?: string; coordinates?: unknown } | null; properties?: Record<string, unknown> | null }[] };

/** Puntos de una FeatureCollection (Point / MultiPoint). `nameField` = propiedad con el nombre; si falta se busca
 * name / nombre / NAME (sin distinguir mayúsculas). Lo que no es punto se omite con un aviso. */
export function pointsFromFc(fc: unknown, nameField?: string): ImportResult {
  const res = empty();
  const feats = (fc as FcLike | null)?.features;
  if (!Array.isArray(feats)) { res.errors.push({ line: null, msg: 'No es una FeatureCollection de GeoJSON.' }); return res; }
  const fields = new Set<string>();
  for (const f of feats) for (const [k, v] of Object.entries(f?.properties ?? {})) if (typeof v === 'string' || typeof v === 'number') fields.add(k);
  res.nameFields = [...fields];
  const auto = res.nameFields.find((k) => NAME_KEYS.includes(fold(k)) && fold(k) !== 'id') ?? res.nameFields.find((k) => fold(k) === 'id') ?? '';
  const key = nameField !== undefined && nameField !== '' ? nameField : auto;
  res.nameField = key;
  let skipped = 0;
  feats.forEach((f, i) => {
    const g = f?.geometry;
    const coords: unknown[] = g?.type === 'Point' ? [g.coordinates] : g?.type === 'MultiPoint' && Array.isArray(g.coordinates) ? g.coordinates : [];
    if (!coords.length) { skipped++; return; }
    const raw = key ? f?.properties?.[key] : undefined;
    const base = raw === undefined || raw === null ? '' : String(raw).trim();
    coords.forEach((c, j) => {
      if (res.rows.length + res.errors.length >= MAX_IMPORT_ROWS) return;
      const a = c as unknown[];
      const lon = Array.isArray(a) ? Number(a[0]) : NaN, lat = Array.isArray(a) ? Number(a[1]) : NaN;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) { res.errors.push({ line: i + 1, msg: 'coordenadas no numéricas' }); return; }
      const bad = rangeError(lat, lon);
      if (bad) { res.errors.push({ line: i + 1, msg: bad.replace('¿invertiste latitud y longitud?', 'GeoJSON usa [longitud, latitud]; ¿está en otro sistema de coordenadas?') }); return; }
      const name = base && coords.length > 1 ? `${base} ${j + 1}` : base;
      res.rows.push({ name, lat: round6(lat), lon: round6(lon) });
    });
  });
  if (skipped) res.errors.push({ line: null, msg: `${skipped} entidad(es) no son puntos (líneas o polígonos) y se omiten.` });
  if (!res.rows.length && !res.errors.length) res.errors.push({ line: null, msg: 'El archivo no trae puntos.' });
  return res;
}

/** Agrega las filas a los puntos existentes respetando el tope; los sin nombre reciben «Punto N». */
export function mergeImported(existing: GeoPoint[], rows: ImportRow[]): { points: GeoPoint[]; added: number; dropped: number } {
  const room = Math.max(0, MAX_POINTS - existing.length);
  const take = rows.slice(0, room);
  const points = existing.slice();
  for (const r of take) points.push({ id: newPointId(), name: r.name || nextPointName(points), lat: r.lat, lon: r.lon });
  return { points, added: take.length, dropped: rows.length - take.length };
}
