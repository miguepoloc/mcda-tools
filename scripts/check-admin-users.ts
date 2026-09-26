// Comprueba el filtrado, la búsqueda, el orden, las fechas (hora de Bogotá) y el CSV de la tabla de usuarios
// del backoffice (lib/admin.ts).
import { ago, countByFilter, csvCell, filterUsers, fmtDate, fmtDateTime, fmtTime, sortUsers, usersToCsv } from '../src/lib/admin.ts';
import type { AdminUserActivity } from '../src/lib/types.ts';

const NOW = Date.parse('2026-09-25T12:00:00Z');
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const u = (id: string, o: Partial<AdminUserActivity>): AdminUserActivity => ({
  id, email: `${id}@x.co`, nombre: null, rol: 'user', estado: 'activa', correo_confirmado: true,
  creado: day(30), ultimo_acceso: day(1), suspendida_el: null, pausada_el: null, proyectos: 0, ...o,
});
const users = [
  u('ana', { nombre: 'Ángela Muñoz', ultimo_acceso: day(0) }),
  u('bob', { nombre: 'Bob', ultimo_acceso: day(20) }),
  u('cy', { nombre: 'Cy', ultimo_acceso: null, correo_confirmado: false }),
  u('dan', { nombre: 'Dan', estado: 'suspendida', ultimo_acceso: day(3), suspendida_el: day(2) }),
  u('eva', { nombre: 'Eva', estado: 'pausada', ultimo_acceso: day(5), pausada_el: day(4), proyectos: 3 }),
  u('fay', { nombre: 'Fay', rol: 'admin', ultimo_acceso: day(6), proyectos: 0 }),
];
let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.error('FALLA:', m); } else console.log('ok  ', m); };
const ids = (l: AdminUserActivity[]) => l.map((x) => x.id).join(',');

ok(ids(filterUsers(users, '', 'todos', NOW)) === 'ana,bob,cy,dan,eva,fay', 'todos');
ok(ids(filterUsers(users, '', 'suspendidas', NOW)) === 'dan', 'filtro suspendidas');
ok(ids(filterUsers(users, '', 'pausadas', NOW)) === 'eva', 'filtro pausadas');
ok(ids(filterUsers(users, '', 'sin_login', NOW)) === 'cy', 'filtro sin login (nunca entró)');
ok(ids(filterUsers(users, '', 'sin_confirmar', NOW)) === 'cy', 'filtro correo sin confirmar');
ok(ids(filterUsers(users, '', 'inactivos', NOW)) === 'bob', 'inactivos = >14 días sin login; quien nunca entró NO cuenta como inactivo');
ok(ids(filterUsers(users, 'angela', 'todos', NOW)) === 'ana', 'búsqueda sin tildes ni mayúsculas (Ángela ← angela)');
ok(ids(filterUsers(users, 'EVA@X', 'todos', NOW)) === 'eva', 'búsqueda por correo');
ok(ids(filterUsers(users, 'bob', 'suspendidas', NOW)) === '', 'búsqueda + filtro se combinan (AND)');
const c = countByFilter(users, NOW);
ok(c.todos === 6 && c.suspendidas === 1 && c.pausadas === 1 && c.sin_login === 1 && c.sin_confirmar === 1 && c.inactivos === 1, 'contadores por filtro');
ok(ids(sortUsers(users, { key: 'ultimo_acceso', dir: 'desc' })) === 'ana,dan,eva,fay,bob,cy', 'último login desc: el más reciente primero, «nunca» al final');
ok(ids(sortUsers(users, { key: 'ultimo_acceso', dir: 'asc' })) === 'cy,bob,fay,eva,dan,ana', 'último login asc: «nunca» primero');
ok(ids(sortUsers(users, { key: 'nombre', dir: 'asc' })) === 'ana,bob,cy,dan,eva,fay', 'nombre asc ignora tildes (Ángela entre A)');
ok(ids(sortUsers(users, { key: 'creado', dir: 'asc' })) === 'ana,bob,cy,dan,eva,fay', 'orden estable cuando hay empates');
ok(ago(day(0), NOW) === 'hoy' && ago(day(1), NOW) === 'hace 1 día' && ago(day(12), NOW) === 'hace 12 días' && ago(day(95), NOW) === 'hace 3 meses', 'ago()');

// Filtro «sin proyectos» (el docente admin no cuenta) y orden por nº de proyectos.
ok(ids(filterUsers(users, '', 'sin_proyectos', NOW)) === 'ana,bob,cy,dan', 'sin proyectos: cuentas con 0 proyectos, sin contar admins');
ok(c.sin_proyectos === 4, 'contador sin proyectos');
ok(ids(sortUsers(users, { key: 'proyectos', dir: 'desc' })) === 'eva,ana,bob,cy,dan,fay', 'proyectos desc, empates estables');

// Fechas en hora de Bogotá (UTC-5): 02:30 UTC del día 26 es el 25 a las 21:30 allá (antes se mostraba el 26).
ok(fmtDate('2026-09-26T02:30:00Z') === '25/09/2026', 'fmtDate usa el día de Bogotá, no el de UTC');
ok(fmtTime('2026-09-26T02:30:00Z') === '21:30' && fmtDateTime('2026-09-26T02:30:00Z') === '25/09/2026 21:30', 'fmtTime/fmtDateTime en hora de Bogotá, 24 h');
ok(fmtDateTime('2026-01-01T05:00:00Z') === '01/01/2026 00:00', 'medianoche de Bogotá se muestra 00:00 (no 24:00)');
ok(fmtDate('no es fecha') === '—' && fmtDate('') === '—', 'fechas inválidas no lanzan');
// «hace N días» cuenta días de calendario en Bogotá: ayer a las 23:00 (04:00Z de hoy) ya es «hace 1 día».
ok(ago('2026-09-25T04:00:00Z', Date.parse('2026-09-25T15:00:00Z')) === 'hace 1 día', 'ago(): ayer 23:00 Bogotá es «hace 1 día» aunque pasen solo 11 h');
ok(ago('2026-09-25T06:00:00Z', Date.parse('2026-09-25T15:00:00Z')) === 'hoy', 'ago(): hoy 01:00 Bogotá es «hoy»');
ok(ago(day(400), NOW) === 'hace 1 año' && ago('basura', NOW) === 'hoy', 'ago(): años y entrada inválida');

// CSV: entrecomillado y sin inyección de fórmulas (el nombre lo escribe el propio usuario).
ok(csvCell('a;b') === '"a;b"' && csvCell('di "hola"') === '"di ""hola"""' && csvCell(null) === '', 'csvCell entrecomilla ; y comillas');
ok(csvCell('=HYPERLINK("x")').startsWith('"\'=') && csvCell('@x') === "'@x" && csvCell('+57') === "'+57" && csvCell(12) === '12', 'csvCell neutraliza =, +, -, @');
const csv = usersToCsv([u('ana', { nombre: '=cmd|x', creado: '2026-09-26T02:30:00Z', ultimo_acceso: null, proyectos: 2 })]).split('\r\n');
ok(csv.length === 2 && csv[0].split(';').length === 9, 'CSV: cabecera de 9 columnas + una fila');
ok(csv[1].startsWith("'=cmd|x;ana@x.co;Usuario;Activa;Sí;25/09/2026 21:30;Nunca;2;"), 'CSV: fila con hora de Bogotá, «Nunca» y fórmula neutralizada');
if (fails) process.exit(1);
console.log('Todo OK (check-admin-users.ts)');
