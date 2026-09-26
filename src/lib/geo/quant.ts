/** Cuantización de una capa continua a Uint8 [0,254] + 255=sin dato, y su inversa. Espejo exacto
 * de `quantize()` en `scripts/geo/export_pack.py` — si uno cambia, cambia el otro. Puro.
 *
 * Contrapartida de tamaño: 254 niveles introducen hasta medio escalón de error de redondeo
 * (`(hi-lo)/254/2`) — para la temperatura del paquete `snsm-cacao-v1` (rango ~27.8°C) son
 * ±0.055°C, verificado en `scripts/geo/smoke-fetch.mjs`. Aceptable para el geovisor (el veto de
 * temperatura es a 15°C, dos órdenes de magnitud más ancho); si algún paquete futuro necesita más
 * precisión, subir a Uint16 [0,65534] es el cambio natural (mismo esquema, otro ancho de banda). */

export function quantize(v: number, lo: number, hi: number): number {
  if (Number.isNaN(v)) return 255;
  if (!(hi > lo)) return 0; // capa constante: sin esto (v-lo)/0 daría NaN y Uint8 lo guardaría como 0 de forma accidental
  const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  return Math.round(t * 254);
}

export function dequantize(q: number, lo: number, hi: number): number {
  return q === 255 ? NaN : hi > lo ? lo + (q / 254) * (hi - lo) : lo;
}

/** Aplica `dequantize` a una capa completa. */
export function dequantizeLayer(u8: Uint8Array, lo: number, hi: number): Float32Array {
  const out = new Float32Array(u8.length);
  for (let i = 0; i < u8.length; i++) out[i] = dequantize(u8[i], lo, hi);
  return out;
}
