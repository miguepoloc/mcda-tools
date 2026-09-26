import { analyze, expertMatrix, indexJudgments, sheetItems } from './ahp.ts';
import type { AdminAhpRawProject, AdminUserActivity } from './types.ts';

export type AhpConsistencySummary = { total_matrices: number; inconsistentes: number; pct_inconsistentes: number };

/** Corre la MISMA matemática de ahp.ts (expertMatrix/analyze, la que ya usa ExpertFlow.tsx en
 * tiempo real) sobre TODOS los juicios de la plataforma — una matriz por (proyecto, experto, hoja)
 * que tenga al menos un juicio — en vez de reimplementar la iteración de eigenvector en SQL. */
export function computeAhpConsistency(raw: AdminAhpRawProject[]): AhpConsistencySummary {
  let total = 0;
  let inconsistentes = 0;
  for (const project of raw) {
    const idx = indexJudgments(project.judgments);
    for (const bySheet of Object.values(idx)) {
      for (const [sheet, map] of Object.entries(bySheet)) {
        const items = sheetItems(sheet, project.criteria, project.alternatives);
        if (items.length < 2) continue;
        const { ok } = analyze(expertMatrix(items, map));
        total += 1;
        if (!ok) inconsistentes += 1;
      }
    }
  }
  return { total_matrices: total, inconsistentes, pct_inconsistentes: total ? Math.round((inconsistentes / total) * 100) : 0 };
}

/** Puntos SVG para un sparkline simple, normalizados al alto/ancho dados. */
export function sparklinePoints(values: number[], width = 120, height = 32, pad = 3): string {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = height - pad - ((v - min) / range) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

// ───────────────────────── Fechas (es-CO, America/Bogota) ─────────────────────────
// Antes se cortaba el ISO (`slice(0, 10)`): eso muestra la fecha en UTC, y una acción a las 21:00 en Bogotá
// (02:00 UTC del día siguiente) aparecía con la fecha de mañana. Todo el backoffice se muestra en hora de Bogotá.

export const ADMIN_TZ = 'America/Bogota';

// en-CA + partes: el orden y los separadores no dependen de la versión de ICU (es-CO cambia «sept.»/«sep.»).
const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: ADMIN_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function bogota(iso: string): { y: string; m: string; d: string; hh: string; mm: string } | null {
  const t = new Date(iso);
  if (!iso || Number.isNaN(t.getTime())) return null;
  const o: Record<string, string> = {};
  for (const p of partsFmt.formatToParts(t)) o[p.type] = p.value;
  return { y: o.year, m: o.month, d: o.day, hh: o.hour, mm: o.minute };
}

/** «25/09/2026» en hora de Bogotá. «—» si la fecha no es válida (nunca lanza). */
export function fmtDate(iso: string): string {
  const b = bogota(iso);
  return b ? `${b.d}/${b.m}/${b.y}` : '—';
}
/** «21:30» en hora de Bogotá (24 h). */
export function fmtTime(iso: string): string {
  const b = bogota(iso);
  return b ? `${b.hh}:${b.mm}` : '—';
}
/** «25/09/2026 21:30» en hora de Bogotá. */
export function fmtDateTime(iso: string): string {
  const b = bogota(iso);
  return b ? `${b.d}/${b.m}/${b.y} ${b.hh}:${b.mm}` : '—';
}

// ───────────────────────── Usuarios (pestaña «Usuarios» del backoffice) ─────────────────────────

/** Sin login en más de estos días = «inactivo». Ajustable aquí; la UI lo lee de esta constante. */
export const INACTIVE_DAYS = 14;

export type UserFilter = 'todos' | 'suspendidas' | 'pausadas' | 'sin_confirmar' | 'sin_login' | 'inactivos' | 'sin_proyectos';
export type UserSortKey = 'nombre' | 'creado' | 'ultimo_acceso' | 'proyectos';
/** Filtros que sí admite `?filtro=` en la URL (los enlaces de «Atención» del Resumen apuntan a ellos). */
export const USER_FILTERS: UserFilter[] = ['suspendidas', 'pausadas', 'sin_confirmar', 'sin_login', 'inactivos', 'sin_proyectos'];
export type UserSort = { key: UserSortKey; dir: 'asc' | 'desc' };

export const daysSince = (iso: string, now = Date.now()) => Math.floor((now - new Date(iso).getTime()) / 86_400_000);

/** Días de CALENDARIO (en Bogotá) entre dos instantes: «ayer a las 23:00» es «hace 1 día» aunque hayan pasado 2 h. */
function calendarDaysBetween(iso: string, now: number): number {
  const a = bogota(iso), b = bogota(new Date(now).toISOString());
  if (!a || !b) return 0;
  return Math.round((Date.UTC(+b.y, +b.m - 1, +b.d) - Date.UTC(+a.y, +a.m - 1, +a.d)) / 86_400_000);
}

/** «hoy», «hace 1 día», «hace 12 días», «hace 3 meses», «hace 1 año». Una fecha inválida o futura no rompe nada. */
export function ago(iso: string, now = Date.now()): string {
  const d = calendarDaysBetween(iso, now);
  if (d <= 0) return 'hoy';
  if (d === 1) return 'hace 1 día';
  if (d < 60) return `hace ${d} días`;
  if (d < 365) return `hace ${Math.floor(d / 30)} meses`;
  const y = Math.floor(d / 365);
  return y === 1 ? 'hace 1 año' : `hace ${y} años`;
}

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function matchesFilter(u: AdminUserActivity, f: UserFilter, now = Date.now()): boolean {
  switch (f) {
    case 'todos': return true;
    case 'suspendidas': return u.estado === 'suspendida';
    case 'pausadas': return u.estado === 'pausada';
    case 'sin_confirmar': return !u.correo_confirmado;
    case 'sin_login': return u.ultimo_acceso == null;
    case 'inactivos': return u.ultimo_acceso != null && daysSince(u.ultimo_acceso, now) > INACTIVE_DAYS;
    // Para el curso: «¿quién aún no ha creado su primer proyecto?». Las cuentas admin (el docente) no cuentan.
    case 'sin_proyectos': return u.proyectos === 0 && u.rol !== 'admin';
  }
}

/** Busca por nombre o correo, sin tildes ni mayúsculas, y aplica el filtro de estado. */
export function filterUsers(users: AdminUserActivity[], query: string, filter: UserFilter, now = Date.now()): AdminUserActivity[] {
  const q = norm(query.trim());
  return users.filter((u) => matchesFilter(u, filter, now) && (!q || norm(`${u.nombre ?? ''} ${u.email}`).includes(q)));
}

export function countByFilter(users: AdminUserActivity[], now = Date.now()): Record<UserFilter, number> {
  const c: Record<UserFilter, number> = { todos: users.length, suspendidas: 0, pausadas: 0, sin_confirmar: 0, sin_login: 0, inactivos: 0, sin_proyectos: 0 };
  for (const u of users) for (const f of USER_FILTERS) if (matchesFilter(u, f, now)) c[f]++;
  return c;
}

/** Orden estable. «Nunca ha entrado» cuenta como el más antiguo: primero al ordenar ascendente. */
export function sortUsers(users: AdminUserActivity[], sort: UserSort): AdminUserActivity[] {
  const val = (u: AdminUserActivity): string | number => {
    if (sort.key === 'nombre') return norm(u.nombre || u.email);
    if (sort.key === 'proyectos') return u.proyectos;
    const iso = sort.key === 'creado' ? u.creado : u.ultimo_acceso;
    return iso ? new Date(iso).getTime() : -Infinity;
  };
  const m = sort.dir === 'asc' ? 1 : -1;
  return users.map((u, i) => ({ u, i })).sort((a, b) => {
    const x = val(a.u), y = val(b.u);
    return (x < y ? -1 : x > y ? 1 : 0) * m || a.i - b.i;
  }).map((r) => r.u);
}

const ESTADO_LABEL: Record<AdminUserActivity['estado'], string> = { activa: 'Activa', pausada: 'Desactivada', suspendida: 'Suspendida' };

/** Una celda de CSV. Se entrecomilla si lleva `;`, comillas o saltos de línea, y se neutraliza la inyección de
 * fórmulas (un nombre de perfil como «=HYPERLINK(…)» se ejecutaría al abrir el archivo en Excel/Sheets): el
 * nombre lo escribe el propio usuario, así que no es de fiar. */
export function csvCell(v: string | number | boolean | null | undefined): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** CSV de las cuentas (separador `;` y BOM UTF-8 al guardarlo: es lo que abre bien Excel en configuración regional
 * de Colombia). Fechas en hora de Bogotá. Solo lo que ya se ve en la tabla: sin nada nuevo que exponer. */
export function usersToCsv(users: AdminUserActivity[]): string {
  const head = ['Nombre', 'Correo', 'Rol', 'Estado', 'Correo confirmado', 'Registrada', 'Último login', 'Proyectos', 'Suspendida/desactivada desde'];
  const rows = users.map((u) => [
    u.nombre ?? '', u.email, u.rol === 'admin' ? 'Admin' : 'Usuario', ESTADO_LABEL[u.estado], u.correo_confirmado ? 'Sí' : 'No',
    fmtDateTime(u.creado), u.ultimo_acceso ? fmtDateTime(u.ultimo_acceso) : 'Nunca', u.proyectos,
    (u.suspendida_el ?? u.pausada_el) ? fmtDateTime((u.suspendida_el ?? u.pausada_el) as string) : '',
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
}

/** Cada cambio de pestaña del backoffice registra un acceso (admin_stats). Para que «accesos recientes» no se
 * llene de ruido, se juntan los consecutivos del mismo correo separados por menos de `gapMin` minutos. */
export function collapseAccesses(list: { email: string; fecha: string }[], gapMin = 30): { email: string; fecha: string; veces: number }[] {
  const out: { email: string; fecha: string; veces: number; oldest: number }[] = [];
  for (const a of list) {
    const t = new Date(a.fecha).getTime();
    const last = out[out.length - 1];
    if (last && last.email === a.email && last.oldest - t <= gapMin * 60_000) { last.veces++; last.oldest = t; }
    else out.push({ email: a.email, fecha: a.fecha, veces: 1, oldest: t });
  }
  return out.map(({ oldest: _o, ...r }) => r);
}
