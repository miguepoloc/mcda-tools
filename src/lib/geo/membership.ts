/** Funciones de idoneidad (membresía) 0–1 para el geovisor AHP + SIG.
 *
 * Puerto de `data/ahp_sig_snsm/membership.py` (el notebook 07 del repositorio) a TypeScript. Solo
 * `import type` a nivel de módulo, para poder correr bajo `node --experimental-strip-types` sin
 * bundler, igual que `ahp.ts` — ver `scripts/check-geo-membership.ts`.
 *
 * `pend` (pendiente) es un caso aparte: `membership.py` la importa y usa (`idoneidad_pendiente`)
 * pero **no la define** — falta en el notebook. La función de abajo (`down(x, 12, 45)`, ver
 * `PENDIENTE_REF`) se obtuvo por regresión contra ~200 000 píxeles reales de
 * `idoneidad_biofisica_250m.npy` (despejando el residuo de los otros 3 criterios ya conocidos, con
 * los pesos AHP de consenso): error máximo < 0.01 en toda la grilla. Es una reconstrucción, no un
 * valor citado por FEDECACAO/UPRA — revisar con el docente si el notebook debería definirla así.
 */

export type FnSpec =
  | { type: 'trapezoid'; a: number; b: number; c: number; d: number }
  | { type: 'up'; a: number; b: number }
  | { type: 'down'; a: number; b: number }
  | { type: 'classes'; map: Record<string, number> }
  | { type: 'steps'; breaks: number[]; scores: number[] }
  | { type: 'target'; value: number; tol: number; falloff: number };

export type VetoSpec = { op: '<' | '>' | '<=' | '>='; value: number };

/** 0 en x<=a o x>=d, 1 en b<=x<=c, rampa lineal en (a,b) y (c,d). NaN se propaga. */
export function trapezoid(x: number, a: number, b: number, c: number, d: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x >= b && x <= c) return 1;
  if (x > a && x < b) return b > a ? clamp01((x - a) / (b - a)) : 1;
  if (x > c && x < d) return d > c ? clamp01((d - x) / (d - c)) : 1;
  return 0;
}

/** 0 hasta a, sube lineal a 1 en b, 1 de ahí en adelante ("más es mejor"). */
export function up(x: number, a: number, b: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x <= a) return 0;
  if (x >= b) return 1;
  return clamp01((x - a) / (b - a));
}

/** 1 hasta a, baja lineal a 0 en b, 0 de ahí en adelante ("menos es mejor"). */
export function down(x: number, a: number, b: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x <= a) return 1;
  if (x >= b) return 0;
  return clamp01((b - x) / (b - a));
}

/** Reclasificación de una capa categórica: valor -> idoneidad, por el número redondeado a entero
 * (las capas categóricas se cuantizan igual que las continuas al exportar el paquete). */
export function classes(x: number, map: Record<string, number>): number {
  if (Number.isNaN(x)) return NaN;
  return map[String(Math.round(x))] ?? 0;
}

/** Reclasificación por rangos (Tabla VI del artículo AHP-SIG de la boya: >150 m → 1, 70–150 m → 0.5,
 * <70 m → 0). `breaks` ascendentes; `scores.length === breaks.length + 1`: x < breaks[0] → scores[0],
 * breaks[i-1] <= x < breaks[i] → scores[i], x >= último → scores[último]. */
export function steps(x: number, breaks: number[], scores: number[]): number {
  if (Number.isNaN(x)) return NaN;
  let i = 0;
  while (i < breaks.length && x >= breaks[i]) i++;
  return scores[i] ?? 0;
}

/** Valor objetivo: idoneidad 1 si |x − value| ≤ tol y baja linealmente a 0 a `falloff` más allá de esa
 * tolerancia (p. ej. voltaje de red = 110 V ± 5, cae a 0 a 20 V de distancia). */
export function target(x: number, value: number, tol: number, falloff: number): number {
  if (Number.isNaN(x)) return NaN;
  const d = Math.abs(x - value) - Math.max(0, tol);
  if (d <= 0) return 1;
  return falloff > 0 ? clamp01(1 - d / falloff) : 0;
}

export function suitability(x: number, fn: FnSpec): number {
  switch (fn.type) {
    case 'target': return target(x, fn.value, fn.tol, fn.falloff);
    case 'steps': return steps(x, fn.breaks, fn.scores);
    case 'trapezoid': return trapezoid(x, fn.a, fn.b, fn.c, fn.d);
    case 'up': return up(x, fn.a, fn.b);
    case 'down': return down(x, fn.a, fn.b);
    case 'classes': return classes(x, fn.map);
  }
}

/** Problema de coherencia de una regla, en español, o `null` si está bien. Las funciones de arriba no lanzan con
 * parámetros desordenados, pero devuelven un mapa distinto al que el usuario cree estar definiendo (p. ej. un
 * trapecio con b < a nunca sube; un «menos es mejor» con a > b vale 1 hasta a y no baja nunca). */
export function fnIssue(fn: FnSpec): string | null {
  const finite = (...v: number[]) => v.every(Number.isFinite);
  switch (fn.type) {
    case 'trapezoid':
      if (!finite(fn.a, fn.b, fn.c, fn.d)) return 'Falta algún parámetro del trapecio.';
      return fn.a <= fn.b && fn.b <= fn.c && fn.c <= fn.d ? null : 'Los parámetros deben cumplir a ≤ b ≤ c ≤ d.';
    case 'up': case 'down':
      if (!finite(fn.a, fn.b)) return 'Falta algún parámetro.';
      return fn.a <= fn.b ? null : 'El parámetro a debe ser menor o igual que b.';
    case 'steps':
      if (fn.scores.length !== fn.breaks.length + 1) return 'Debe haber un puntaje más que cortes.';
      if (!fn.breaks.every(Number.isFinite)) return 'Falta algún corte.';
      return fn.breaks.every((b, i) => i === 0 || b >= fn.breaks[i - 1]) ? null : 'Los cortes deben ir de menor a mayor.';
    case 'target':
      return finite(fn.value, fn.tol, fn.falloff) ? null : 'Falta algún parámetro.';
    case 'classes':
      return Object.values(fn.map).every((v) => Number.isFinite(v) && v >= 0 && v <= 1) ? null : 'Las idoneidades deben estar entre 0 y 1.';
  }
}

/** Ordena los parámetros de una regla para que cumplan `fnIssue` (trapecio, up/down, cortes). Otros tipos no cambian. */
export function sortedFn(fn: FnSpec): FnSpec {
  switch (fn.type) {
    case 'trapezoid': { const [a, b, c, d] = [fn.a, fn.b, fn.c, fn.d].sort((x, y) => x - y); return { type: 'trapezoid', a, b, c, d }; }
    case 'up': case 'down': return fn.a <= fn.b ? fn : { type: fn.type, a: fn.b, b: fn.a };
    case 'steps': return { type: 'steps', breaks: [...fn.breaks].sort((x, y) => x - y), scores: fn.scores };
    default: return fn;
  }
}

/** true si el veto se activa (idoneidad pasa a 0 sin importar los demás criterios). */
export function vetoed(x: number, v: VetoSpec | undefined): boolean {
  if (!v || Number.isNaN(x)) return false;
  switch (v.op) {
    case '<': return x < v.value;
    case '<=': return x <= v.value;
    case '>': return x > v.value;
    case '>=': return x >= v.value;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** FEDECACAO (2015): valores de referencia del caso guiado Sierra Nevada de Santa Marta (07_ahp_sig_cacao_snsm.ipynb). */
export const SNSM_CACAO_RULES: Record<string, { fn: FnSpec; veto?: VetoSpec; label: string; unit: string; why: string }> = {
  precip: {
    fn: { type: 'trapezoid', a: 500, b: 1500, c: 2500, d: 4000 },
    label: 'Precipitación anual', unit: 'mm/año',
    why: 'FEDECACAO (2015): óptimo 1500–2500 mm/año. Por debajo de 1500 mm "es indispensable la aplicación de riego". Por encima de 2500 mm, exceso de humedad favorece Moniliasis.',
  },
  temp: {
    fn: { type: 'trapezoid', a: 15, b: 22, c: 30, d: 38 },
    veto: { op: '<', value: 15 },
    label: 'Temperatura media anual', unit: '°C',
    why: 'FEDECACAO (2015): óptimo 22–30°C, límites fisiológicos 15–38°C. Por debajo de 15°C el cacao sufre marchitez — veto, no penalización.',
  },
  ph: {
    fn: { type: 'trapezoid', a: 4.0, b: 5.5, c: 6.5, d: 8.0 },
    label: 'pH del suelo (0–5 cm)', unit: '',
    why: 'FEDECACAO (2015): óptimo 5.5–6.5 ("moderadamente ácidos"); tolera acidez fuerte a moderada de 5 a 6. Límites según el rango real observado en la zona (SoilGrids, Poggio et al. 2021).',
  },
  pend: {
    fn: { type: 'down', a: 12, b: 45 },
    veto: { op: '>=', value: 45 },
    label: 'Pendiente', unit: '°',
    why: 'Reconstruida por regresión contra el mapa del notebook (idoneidad_pendiente no está definida en membership.py): idoneidad 1 hasta 12°, rampa lineal a 0 en 45° (veto por remoción en masa).',
  },
};

/** Texto corto de una regla, para tablas, Excel y tooltips. */
export function describeFn(fn: FnSpec): string {
  const n = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));
  switch (fn.type) {
    case 'trapezoid': return `Trapecio ${n(fn.a)} / ${n(fn.b)} / ${n(fn.c)} / ${n(fn.d)}`;
    case 'up': return `Más es mejor: 0 hasta ${n(fn.a)}, 1 desde ${n(fn.b)}`;
    case 'down': return `Menos es mejor: 1 hasta ${n(fn.a)}, 0 desde ${n(fn.b)}`;
    case 'target': return `Valor objetivo ${n(fn.value)} ± ${n(fn.tol)}, cae a 0 a ${n(fn.falloff)} más allá`;
    case 'classes': return 'Por clases: ' + Object.entries(fn.map).map(([k, v]) => `${k}→${n(v)}`).join(', ');
    case 'steps': {
      const parts = fn.scores.map((s, i) => {
        const lo = i === 0 ? null : fn.breaks[i - 1], hi = i < fn.breaks.length ? fn.breaks[i] : null;
        const rng = lo === null ? `< ${n(hi as number)}` : hi === null ? `≥ ${n(lo)}` : `${n(lo)}–${n(hi)}`;
        return `${rng} → ${n(s)}`;
      });
      return 'Rangos: ' + parts.join(' · ');
    }
  }
}

export function describeVeto(v: VetoSpec | undefined): string {
  return v ? `Veto si valor ${v.op} ${v.value}` : '—';
}
