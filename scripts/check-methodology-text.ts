// Pruebas del párrafo de metodología (lib/methodologyText.ts): sale del estado del proyecto, no de texto fijo.
import { buildMethodologyParagraph, type MethodologyInput } from '../src/lib/methodologyText.ts';
import { APP_DOI, APP_VERSION } from '../src/lib/version.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };

const base: MethodologyInput = {
  method: 'vikor', weighting: 'ahp', weightMethod: 'eigenvector',
  criteria: [{ name: 'Alcance' }, { name: 'Costo' }], weights: [0.6667, 0.3333],
  alternativeCount: 4, expertCount: 3, criteriaCr: 0.0086, vikorV: 0.75,
};

{
  const es = buildMethodologyParagraph(base, 'es');
  const en = buildMethodologyParagraph(base, 'en');
  ok(es.includes(APP_VERSION) && es.includes(APP_DOI) && en.includes(APP_VERSION) && en.includes(APP_DOI), `versión (${APP_VERSION}) y DOI vienen de version.ts, en es y en`);
  ok(es.includes('Alcance (0.667)') && es.includes('Costo (0.333)'), 'pesos con 3 decimales en el texto');
  ok(es.includes('CR = 0.0086') && es.includes('aceptable'), 'CR de criterios, aceptable');
  ok(es.includes('v = 0.75') && /3 expertos/.test(es) && /4 alternativas/.test(es), 'v de VIKOR, expertos y alternativas del estado');
  ok(/VIKOR/.test(en) && /v = 0\.75/.test(en) && /3 experts/.test(en) && /eigenvector/.test(en), 'versión en inglés con los mismos datos');
  ok(!/[áéíóú]/i.test(en.replace(/Castañeda|Tzeng|Yoon/g, '')), 'el inglés no mezcla español');
}
{
  const bad = buildMethodologyParagraph({ ...base, criteriaCr: 0.14 }, 'es');
  ok(/NO cumple/.test(bad), 'CR ≥ 0.10 se declara como no aceptable, no se maquilla');
  ok(/promedio de columnas/.test(buildMethodologyParagraph({ ...base, weightMethod: 'mean' }, 'es')), 'refleja el cálculo de pesos elegido (promedio de columnas)');
}
{
  const el = buildMethodologyParagraph({ ...base, method: 'electre', cStar: 0.7, dStar: 0.25 }, 'es');
  ok(/c\* = 0\.70/.test(el) && /d\* = 0\.25/.test(el) && /no un ranking total/.test(el), 'ELECTRE: umbrales c*/d* del estado y aclaración de que no es ranking');
  const crit = buildMethodologyParagraph({ ...base, weighting: 'critic', expertCount: 0, criteriaCr: undefined, method: 'topsis' }, 'en');
  ok(/CRITIC/.test(crit) && !/CR =/.test(crit) && /TOPSIS/.test(crit), 'pesos CRITIC: sin CR ni expertos, método TOPSIS');
  const ahp = buildMethodologyParagraph({ ...base, method: 'ahp', altMaxCr: 0.05 }, 'es');
  ok(/mayor CR entre las matrices de alternativas fue 0\.0500/.test(ahp), 'AHP: CR máximo de alternativas');
  ok(/1 experto\b/.test(buildMethodologyParagraph({ ...base, expertCount: 1 }, 'es')), 'singular «1 experto»');
}

if (fallos) { console.error(`\n${fallos} verificaciones fallaron.`); process.exit(1); }
console.log('\nTodas las verificaciones de methodologyText pasaron.');
