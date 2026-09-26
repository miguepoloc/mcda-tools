// Parte A (Sesión 1): desglose del embudo, aritmética de ponderaciones, corte/brecha, medibilidad y contadores unificados.
// Caso: el ejemplo de las diapositivas 15-18 (tecnología IoT/WSN en Palmor): 10 candidatos → 9 tras tamizaje → 7 al panel → 4 finalistas
// (5.0, 4.8, 4.6, 4.2 pasan con corte 4.0; Tasa de datos 3.8 queda justo fuera: brecha 0.4).
import {
  alive, blankPrio, finalists, inIndep, mean, newCand, normalizePrio, passes, ranked, type PrioState,
} from '../src/lib/prio.ts';
import {
  cutInfo, cutSentence, funnel, funnelSentence, measurability, prioWarnings, scoreBreakdown, NEAR_LIMIT,
} from '../src/lib/prioSteps.ts';
import { fromLegacy, toLegacy, isLegacy } from '../src/lib/legacy.ts';
import { blankMatrix } from '../src/lib/topsis.ts';
import { slideCase } from './prio-case.ts';

let fallos = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };
const cerca = (a: number | null | undefined, b: number, tol = 1e-9) => a != null && Math.abs(a - b) <= tol;

const A = slideCase();

// ---- Embudo y definición única de los contadores ----
{
  const f = funnel(A);
  ok(f.total === 10 && f.afterTamiz === 9 && f.toPanel === 7 && f.finalists === 4, `embudo 10 → 9 → 7 → 4 (real: ${f.total} → ${f.afterTamiz} → ${f.toPanel} → ${f.finalists})`);
  ok(inIndep(A).length === 9, 'inIndep = los que no se eliminaron en el tamizaje (9), incluye los que salen en la independencia');
  ok(alive(A).length === 7, 'alive = los que llegan al panel (7)');
  ok(f.outTamiz.merged.length === 1 && f.outTamiz.dropped.length === 0 && f.outIndep.length === 2 && f.outCut.length === 3, 'salidas por etapa: 1 fusionado en tamizaje, 2 en independencia, 3 bajo el corte');
  ok(f.unrated === 0, 'ninguno sin calificar');
  ok(/10 candidatos/.test(funnelSentence(A)) && /quedaron 9/.test(funnelSentence(A)) && /7 llegaron al panel/.test(funnelSentence(A)), 'frase del embudo con los números reales: ' + funnelSentence(A));
}

// ---- Aritmética de la ponderación ----
{
  const s = scoreBreakdown(A, A.cands[1]);
  ok(s.n === 5 && cerca(s.sum, 24) && cerca(s.mean, 4.8) && s.min === 4 && s.max === 5, 'Consumo: n=5, Σ=24, promedio 4.8, mín 4, máx 5');
  ok(s.arithmetic === '(5 + 5 + 5 + 5 + 4) / 5 = 4.80', 'aritmética explícita: ' + s.arithmetic);
  ok(cerca(s.sd, Math.sqrt(0.2), 1e-12), 'desviación estándar muestral (n−1) = √0.2');
  for (const c of A.cands) { const b = scoreBreakdown(A, c); if (c.stage === 'keep') ok(b.mean === mean(A, c), `promedio de «${c.name}» idéntico a prio.mean()`); }
}
{
  // vacías y fuera de rango NO cuentan; se dividen entre las válidas
  const B: PrioState = { ...blankPrio(), mode: 'ev', cutoff: 4 };
  B.evaluators = [{ id: 'v1', name: 'E1' }, { id: 'v2', name: 'E2' }, { id: 'v3', name: 'E3' }, { id: 'v4', name: 'E4' }];
  const c = newCand('x', 'Criterio X');
  c.se = { v1: 5, v2: 5, v3: 4, v4: null };
  B.cands = [c];
  let s = scoreBreakdown(B, c);
  ok(s.n === 3 && s.empty === 1 && s.ignored === 0 && s.arithmetic === '(5 + 5 + 4) / 3 = 4.67', 'una celda vacía no cuenta: ' + s.arithmetic);
  c.se = { v1: 5, v2: 5, v3: 4, v4: 9 };
  s = scoreBreakdown(B, c);
  ok(s.n === 3 && s.ignored === 1 && cerca(s.mean, 14 / 3), 'un valor fuera de 1–5 (9) se ignora y se cuenta como ignorado');
  c.se = { v1: null, v2: 0.5, v3: null, v4: null };
  s = scoreBreakdown(B, c);
  ok(s.n === 0 && s.mean == null && s.sd == null && /sin calificaciones válidas/.test(s.arithmetic), 'sin válidas: no hay promedio');
  c.se = { v1: 4, v2: null, v3: null, v4: null };
  ok(scoreBreakdown(B, c).sd === null, 'con 1 sola calificación no hay desviación');
  ok(prioWarnings({ ...B, cands: [{ ...c, se: { v1: 4, v2: 5, v3: null, v4: null } }] }).some((w) => /2 de 4/.test(w)), 'avisa cuando un promedio usa menos calificaciones que el panel');
}

// ---- Corte y brecha ----
{
  const ci = cutInfo(A);
  ok(ci.nPass === 4 && ci.nFail === 3 && ci.rows.length === 7, '4 pasan, 3 no, 7 calificados');
  ok(ci.last?.cand.name === 'Madurez del ecosistema' && cerca(ci.last?.mean, 4.2), 'último que pasa: Madurez (4.2)');
  ok(ci.firstNo?.cand.name === 'Tasa de datos' && cerca(ci.firstNo?.mean, 3.8), 'primero que no pasa: Tasa de datos (3.8)');
  ok(cerca(ci.gap, 0.4) && ci.nearLimit && ci.gapKind === 'clear', 'brecha 0.4, «en el límite», clara');
  ok(cerca(ci.lastMargin, 0.2), 'margen del último sobre el corte = 0.2');
  ok(ci.rows.every((r) => r.pass === passes(A, r.cand)), 'pasa/no pasa idéntico a prio.passes()');
  ok(finalists(A).map((c) => c.name).join('|') === ranked(A).filter((c) => passes(A, c)).map((c) => c.name).join('|'), 'finalistas de prio.finalists()');
  ok(/pasan 4 de 7/.test(cutSentence(A)) && /Tasa de datos con 3.80/.test(cutSentence(A)) && /0.40 puntos/.test(cutSentence(A)), 'frase del corte: ' + cutSentence(A));
  ok(NEAR_LIMIT === 0.5, 'umbral «en el límite» = 0.5 (el mismo del editor y del Excel)');
  const C = { ...A, cutoff: 3.8 };
  ok(cutInfo(C).nPass === 5 && passes(C, C.cands[4]), 'el corte es «≥» (3.8 ≥ 3.8 pasa; tolerancia de coma flotante)');
  const D = { ...A, cutoff: 2 };
  ok(cutInfo(D).gap === null && /no hay brecha/.test(cutSentence(D)), 'todos pasan: sin brecha');
  const E = { ...A, cutoff: 5 };
  ok(cutInfo(E).nPass === 1, 'corte 5.0: pasa solo el 5.0');
  ok(cutInfo({ ...blankPrio(), cands: [] }).rows.length === 0, 'sin candidatos no falla');
}

// ---- Medibilidad (campo opcional, sin migración) ----
{
  const B = JSON.parse(JSON.stringify(A)) as PrioState;
  ok(measurability(B).pending.length === 4, 'sin marcar: 4 finalistas pendientes');
  B.cands[0].measurable = true; B.cands[0].measEvid = 'Datasheets de las 4 tecnologías';
  B.cands[1].measurable = false; B.cands[1].measEvid = 'Sin datos de Zigbee';
  const m = measurability(B);
  ok(m.yes.length === 1 && m.no.length === 1 && m.pending.length === 2, 'medibilidad: 1 sí, 1 no, 2 pendientes');
  ok(prioWarnings(B).some((w) => /No medible para todas/.test(w) && /Consumo/.test(w)) && prioWarnings(B).some((w) => /Falta verificar/.test(w)), 'avisa lo no medible y lo pendiente');
  // ida y vuelta: JSON de la BD (jsonb), normalizePrio y formato de respaldo de la herramienta
  const viaDb = normalizePrio(JSON.parse(JSON.stringify(B)));
  ok(viaDb.cands[0].measurable === true && viaDb.cands[0].measEvid === 'Datasheets de las 4 tecnologías' && viaDb.cands[1].measurable === false, 'sobrevive a JSON + normalizePrio');
  const study = { title: 'T', objective: 'O', criteria: [], alternatives: [], experts: [], idx: {}, prio: B, method: 'ahp' as const, decisionMatrix: blankMatrix() };
  const legacy = JSON.parse(JSON.stringify(toLegacy(study)));
  ok(isLegacy(legacy), 'respaldo reconocido');
  const back = fromLegacy(legacy);
  ok(back.prio.cands[0].measurable === true && back.prio.cands[1].measEvid === 'Sin datos de Zigbee' && back.prio.cands[2].measurable == null, 'sobrevive al respaldo (toLegacy → fromLegacy)');
  // datos viejos sin el campo siguen cargando
  const old = JSON.parse(JSON.stringify(A)) as PrioState;
  old.cands.forEach((c) => { delete c.measurable; delete c.measEvid; });
  ok(normalizePrio(old).cands.length === 10 && measurability(normalizePrio(old)).pending.length === 4, 'datos guardados antes del campo siguen cargando');
}

// ---- Avisos ----
{
  ok(prioWarnings(A, 4).every((w) => !/Tu AHP/.test(w)), 'sin aviso si el AHP tiene el mismo número de criterios');
  ok(prioWarnings(A, 5).some((w) => /Tu AHP tiene 5/.test(w)), 'avisa si el AHP tiene otro número de criterios');
  ok(prioWarnings(A).some((w) => /Sin justificación escrita/.test(w)), 'avisa finalistas sin justificación');
  ok(prioWarnings({ ...A, cutoff: 4.9 }).some((w) => /al menos 3/.test(w)), 'avisa con menos de 3 finalistas');
}

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
