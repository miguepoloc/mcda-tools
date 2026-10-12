// Modo presentación (U4): lectura/escritura segura de la preferencia y aplicación del atributo al <html>.
// Sin DOM ni localStorage reales: se inyectan un almacenamiento y una raíz falsos, incluidos los que lanzan.
import {
  PRESENT_ATTR, PRESENT_BOOT_SCRIPT, PRESENT_KEY, applyPresent, isPresentApplied, parsePresent, readPresent, writePresent,
  type RootLike, type StorageLike,
} from '../src/lib/present.ts';

let fails = 0;
const ok = (c: boolean, n: string) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + n); if (!c) fails++; };

const mem = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    setItem: (k, v) => { data.set(k, v); },
    removeItem: (k) => { data.delete(k); },
  };
};
const throwing: StorageLike = {
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('QuotaExceededError'); },
  removeItem() { throw new Error('SecurityError'); },
};
const fakeRoot = (): RootLike & { attrs: Map<string, string> } => {
  const attrs = new Map<string, string>();
  return {
    attrs,
    setAttribute: (n, v) => { attrs.set(n, v); },
    removeAttribute: (n) => { attrs.delete(n); },
    getAttribute: (n) => (attrs.has(n) ? attrs.get(n)! : null),
  };
};

// parsePresent: solo '1' activa
ok(parsePresent('1') === true, 'parsePresent("1") = true');
ok(parsePresent('0') === false && parsePresent('') === false && parsePresent(null) === false && parsePresent(undefined) === false, 'parsePresent: 0, vacío, null y undefined = false');
ok(parsePresent('true') === false && parsePresent(1) === false && parsePresent('1 ') === false, 'parsePresent: basura u otros tipos = false');

// lectura
const s = mem();
ok(readPresent(s) === false, 'sin valor guardado: apagado');
s.data.set(PRESENT_KEY, '1');
ok(readPresent(s) === true, 'con «1» guardado: encendido');
s.data.set(PRESENT_KEY, 'xyz');
ok(readPresent(s) === false, 'valor corrupto: apagado');
ok(readPresent(throwing) === false, 'almacenamiento que lanza al leer: apagado, sin excepción');

// escritura
const w = mem();
ok(writePresent(true, w) === true && w.data.get(PRESENT_KEY) === '1', 'encender guarda «1»');
ok(readPresent(w) === true, 'lo guardado se lee de vuelta');
ok(writePresent(false, w) === true && !w.data.has(PRESENT_KEY), 'apagar borra la clave');
ok(readPresent(w) === false, 'tras apagar se lee apagado');
ok(writePresent(true, throwing) === false, 'almacenamiento que lanza al escribir: devuelve false, sin excepción');
ok(writePresent(false, throwing) === false, 'almacenamiento que lanza al borrar: devuelve false, sin excepción');
const noRemove: StorageLike = { getItem: () => null, setItem: (k, v) => { noRemove_data.set(k, v); } };
const noRemove_data = new Map<string, string>();
ok(writePresent(false, noRemove) === true && noRemove_data.get(PRESENT_KEY) === '0', 'sin removeItem, apagar guarda «0»');

// aplicación al <html>
const r = fakeRoot();
ok(isPresentApplied(r) === false, 'raíz sin atributo: no aplicado');
applyPresent(true, r);
ok(r.attrs.get(PRESENT_ATTR) === '1' && isPresentApplied(r), 'applyPresent(true) pone data-present="1"');
applyPresent(true, r);
ok(r.attrs.size === 1, 'aplicar dos veces es idempotente');
applyPresent(false, r);
ok(!r.attrs.has(PRESENT_ATTR) && !isPresentApplied(r), 'applyPresent(false) lo quita');
const bad: RootLike = { setAttribute() { throw new Error('x'); }, removeAttribute() { throw new Error('x'); } };
let threw = false;
try { applyPresent(true, bad); applyPresent(false, bad); } catch { threw = true; }
ok(!threw, 'una raíz que lanza no propaga la excepción');
ok(PRESENT_ATTR === 'data-present' && PRESENT_KEY === 'mcda_present', 'clave y atributo estables');

// script de arranque: es texto fijo, con try/catch y con la misma clave/atributo
ok(PRESENT_BOOT_SCRIPT.includes(JSON.stringify(PRESENT_KEY)) && PRESENT_BOOT_SCRIPT.includes(JSON.stringify(PRESENT_ATTR)), 'el script de arranque usa la misma clave y atributo');
ok(/^try\{/.test(PRESENT_BOOT_SCRIPT) && /catch\(e\)\{\}$/.test(PRESENT_BOOT_SCRIPT), 'el script de arranque va envuelto en try/catch');
// Ejecutarlo con un localStorage y un document falsos reproduce lo que hace el navegador.
{
  const root = fakeRoot();
  const run = (stored: string | null, throws = false) => {
    root.attrs.clear();
    const localStorage = { getItem: () => { if (throws) throw new Error('x'); return stored; } };
    const document = { documentElement: root };
    new Function('localStorage', 'document', PRESENT_BOOT_SCRIPT)(localStorage, document);
    return root.attrs.get(PRESENT_ATTR);
  };
  ok(run('1') === '1', 'script de arranque: «1» aplica el modo');
  ok(run(null) === undefined && run('0') === undefined, 'script de arranque: sin valor o «0» no lo aplica');
  ok(run('1', true) === undefined, 'script de arranque: storage que lanza no rompe ni aplica');
}

console.log(fails ? `\n${fails} fallas` : '\nTodo en orden');
if (fails) process.exit(1);
