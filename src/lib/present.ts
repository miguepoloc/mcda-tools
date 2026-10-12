// Modo presentación (U4): tema de alto contraste y letra grande para proyectar en el aula o ante un jurado.
// Lógica pura: lectura/escritura segura de la preferencia y aplicación del atributo `data-present="1"` al <html>.
// Nada aquí toca `window` ni `document` por sí solo: el almacenamiento y la raíz se inyectan (en el navegador son
// `localStorage` y `document.documentElement`), así que se prueba en Node sin DOM. Todo acceso al almacenamiento va en
// try/catch: en ventana privada, con datos del sitio bloqueados o en vistas previas puede lanzar o venir vacío.

/** Clave en localStorage (por navegador; no viaja con la cuenta ni con el proyecto). */
export const PRESENT_KEY = 'mcda_present';
/** Atributo del <html> que activa los estilos de `src/app/present.css`. */
export const PRESENT_ATTR = 'data-present';

/** Lo mínimo que se usa de `Storage`. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}
/** Lo mínimo que se usa de un elemento DOM. */
export interface RootLike {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  getAttribute?(name: string): string | null;
}

/** Interpreta lo guardado: solo `'1'` activa el modo; cualquier otra cosa (null, vacío, basura) lo deja apagado. */
export function parsePresent(raw: unknown): boolean {
  return raw === '1';
}

/** Lee la preferencia. Sin almacenamiento, o si lanza, devuelve `false` (modo normal). */
export function readPresent(storage?: StorageLike | null): boolean {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    return s ? parsePresent(s.getItem(PRESENT_KEY)) : false;
  } catch {
    return false;
  }
}

/** Guarda la preferencia. Devuelve `true` si quedó escrita; `false` si no hay almacenamiento o lanzó (el modo sigue
 * aplicado en esta pestaña; solo no se recordará). Apagado borra la clave en vez de guardar «0». */
export function writePresent(on: boolean, storage?: StorageLike | null): boolean {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!s) return false;
    if (on) s.setItem(PRESENT_KEY, '1');
    else if (s.removeItem) s.removeItem(PRESENT_KEY);
    else s.setItem(PRESENT_KEY, '0');
    return true;
  } catch {
    return false;
  }
}

/** Pone o quita `data-present="1"` en la raíz (en el navegador, `document.documentElement`). */
export function applyPresent(on: boolean, root?: RootLike | null): void {
  try {
    const r = root ?? (typeof document !== 'undefined' ? document.documentElement : null);
    if (!r) return;
    if (on) r.setAttribute(PRESENT_ATTR, '1');
    else r.removeAttribute(PRESENT_ATTR);
  } catch {
    /* sin DOM */
  }
}

/** ¿La raíz tiene el modo aplicado? (para sincronizar el botón con lo que dejó el script de arranque). */
export function isPresentApplied(root?: RootLike | null): boolean {
  try {
    const r = root ?? (typeof document !== 'undefined' ? document.documentElement : null);
    return !!r?.getAttribute && r.getAttribute(PRESENT_ATTR) === '1';
  } catch {
    return false;
  }
}

/** Script de arranque (se incrusta en <head>): aplica el modo antes del primer pintado para que no haya parpadeo.
 * Es texto fijo, sin datos del usuario. Debe mantenerse en sync con `PRESENT_KEY`/`PRESENT_ATTR`. */
export const PRESENT_BOOT_SCRIPT =
  `try{if(localStorage.getItem(${JSON.stringify(PRESENT_KEY)})==='1')document.documentElement.setAttribute(${JSON.stringify(PRESENT_ATTR)},'1')}catch(e){}`;
