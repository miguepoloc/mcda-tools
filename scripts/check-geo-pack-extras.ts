// Capas propias sobre un paquete de solo lectura (cacao SNSM u otro): mergeExtraLayers debe sumar
// criterios/exclusiones alineados a la grilla del paquete SIN mutar el paquete, e ignorar lo que no
// se puede combinar (clave repetida, tamaño distinto, rol «area»).
import { mergeExtraLayers, type ExtraLayer, type GeoData } from '../src/lib/geo/data.ts';
import { MASK_EXCLUDED, MASK_NODATA, MASK_VALID } from '../src/lib/geo/suitability.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };

const grid = { crs: 'EPSG:32618', width: 3, height: 2, resM: 250, haPerPixel: 6.25, transform: [250, 0, 0, 0, -250, 0] as [number, number, number, number, number, number] };
const base = (): GeoData => ({
  grid,
  layers: { temp: new Float32Array([20, 22, 24, 26, 28, 30]) },
  info: { temp: { label: 'Temperatura', unit: '°C', role: 'criterion', min: 20, max: 30 } },
  mask: new Uint8Array([MASK_VALID, MASK_VALID, MASK_VALID, MASK_VALID, MASK_NODATA, MASK_VALID]),
  points: {},
});

const crit = (key: string, values: number[]): ExtraLayer => ({ key, info: { label: key, unit: 'm', role: 'criterion', min: 0, max: 10 }, values: new Float32Array(values) });

// 1. Criterio extra: aparece en layers/info y el paquete queda intacto.
{
  const b = base();
  const before = { mask: b.mask.slice(), keys: Object.keys(b.layers).join() };
  const m = mergeExtraLayers(b, [crit('dist', [1, 2, 3, 4, 5, 6])]);
  ok(Object.keys(m.layers).join() === 'temp,dist' && m.info.dist.label === 'dist', 'criterio extra queda junto a los del paquete');
  ok(m.layers.temp === b.layers.temp && m.grid === b.grid, 'la capa del paquete no se copia ni se altera');
  ok(b.mask.every((v, i) => v === before.mask[i]) && Object.keys(b.layers).join() === before.keys && !('dist' in b.info), 'el objeto del paquete no se muta');
  ok(m.mask.every((v, i) => v === b.mask[i]), 'un criterio no cambia la máscara');
}

// 2. Exclusión extra: marca solo celdas válidas; lo que ya está fuera del área sigue fuera.
{
  const b = base();
  const ex: ExtraLayer = { key: 'concesion', info: { label: 'Concesión', unit: '', role: 'exclusion', min: 0, max: 1 }, values: new Float32Array([1, 0, 0, 0, 1, 1]) };
  const m = mergeExtraLayers(b, [ex]);
  ok(m.mask[0] === MASK_EXCLUDED && m.mask[5] === MASK_EXCLUDED, 'exclusión marca las celdas válidas donde vale > 0');
  ok(m.mask[4] === MASK_NODATA, 'una celda fuera del área del paquete no pasa a «excluida»');
  ok(m.mask[1] === MASK_VALID && b.mask[0] === MASK_VALID, 'el resto queda válido y la máscara original no cambia');
}

// 3. Lo que no se puede combinar se ignora (y no rompe).
{
  const b = base();
  const m = mergeExtraLayers(b, [
    crit('temp', [9, 9, 9, 9, 9, 9]),                 // clave del paquete: gana el paquete
    crit('corta', [1, 2, 3]),                          // otro tamaño: no alineada
    { key: 'zona', info: { label: 'Zona', unit: '', role: 'area', min: 0, max: 1 }, values: new Float32Array(6).fill(1) }, // el área la fija el paquete
  ]);
  ok(m === b, 'sin extras utilizables se devuelve el mismo objeto');
  ok(m.layers.temp[0] === 20, 'la clave repetida no pisa al paquete');
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK');
process.exit(fallos ? 1 : 0);
