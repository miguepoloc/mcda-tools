// Cortes por cuantiles y rupturas naturales de Jenks sobre la distribución del índice (valores conocidos).
import { histogram, jenksBreaks, quantileBreaks } from '../src/lib/geo/cuts.ts';
import { classify, classOf, CLASS_VETO } from '../src/lib/geo/suitability.ts';

let fails = 0;
const ok = (c: boolean, n: string, extra = '') => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + n + (extra ? ' ' + extra : '')); if (!c) fails++; };
const eq = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
const hist = (vals: number[]) => histogram(Uint8Array.from(vals));

// 0..99, una celda por valor: cuartiles exactos
{
  const h = hist(Array.from({ length: 100 }, (_, i) => i));
  ok(eq(quantileBreaks(h, 4), [0.25, 0.5, 0.75]), 'cuantiles N=4 sobre 0..99', JSON.stringify(quantileBreaks(h, 4)));
  ok(eq(quantileBreaks(h, 2), [0.5]), 'cuantiles N=2 (mediana)');
  // Cada clase recibe 25 celdas
  const s = Float64Array.from({ length: 100 }, (_, i) => i / 100);
  const cls = classify(s, new Uint8Array(100), quantileBreaks(h, 4));
  const cnt = [0, 0, 0, 0, 0];
  cls.forEach((c) => cnt[c]++);
  ok(cnt[1] === 25 && cnt[2] === 25 && cnt[3] === 25 && cnt[4] === 25, 'cuantiles: 25 celdas por clase', JSON.stringify(cnt));
}
// Tres grupos separados: Jenks corta justo en el salto
{
  const h = hist([1, 2, 3, 10, 11, 12, 50, 51, 52]);
  ok(eq(jenksBreaks(h, 3), [0.10, 0.50]), 'Jenks N=3 separa los tres grupos', JSON.stringify(jenksBreaks(h, 3)));
  ok(eq(jenksBreaks(h, 2), [0.50]), 'Jenks N=2: el salto grande (12 → 50)', JSON.stringify(jenksBreaks(h, 2)));
}
// Pesos: muchas celdas en 20 y pocas en 80 -> el corte queda entre ellos
{
  const vals = [...new Array(500).fill(20), ...new Array(30).fill(21), ...new Array(40).fill(80), ...new Array(5).fill(81)];
  const b = jenksBreaks(hist(vals), 2);
  ok(b.length === 1 && b[0] > 0.21 && b[0] <= 0.80, 'Jenks ponderado por frecuencia', JSON.stringify(b));
}
// Menos valores distintos que clases: no truena, repite cortes
{
  const b = jenksBreaks(hist([40, 40, 40, 60, 60]), 4);
  ok(b.length === 3 && b.every((v, i) => i === 0 || v >= b[i - 1]), 'Jenks con 2 valores distintos y N=4 devuelve 3 cortes no decrecientes', JSON.stringify(b));
}
ok(quantileBreaks(hist([]), 3).length === 0 && jenksBreaks(hist([]), 3).length === 0, 'sin datos: sin cortes');
// Los 255 (sin dato) no entran
{
  const h = histogram(Uint8Array.from([10, 255, 255, 90]));
  ok(h.reduce((a, b) => a + b, 0) === 2, 'el 255 no entra al histograma');
}
// classOf / classify con 5 clases y veto
{
  const br = [0.2, 0.4, 0.6, 0.8];
  ok(classOf(0, br) === 1 && classOf(0.2, br) === 2 && classOf(0.79, br) === 4 && classOf(0.8, br) === 5 && classOf(1, br) === 5, 'classOf: borde inferior inclusivo, N=5');
  const c = classify(Float64Array.from([NaN, 0.9, 0, 1]), Uint8Array.from([0, 0, 1, 1]), br);
  ok(c[0] === 0 && c[1] === 5 && c[2] === CLASS_VETO && c[3] === CLASS_VETO, 'classify: sin dato = 0, veto = CLASS_VETO');
}
console.log(fails === 0 ? '\nTodo OK (check-geo-cuts)' : `\n${fails} fallas`);
process.exit(fails ? 1 : 0);
