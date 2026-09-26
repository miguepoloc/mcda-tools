'use client';

import { useMemo } from 'react';
import type { Alternative, Criterion, DecisionMatrix } from '@/lib/types';
import { targetDistance } from '@/lib/topsis';
import { sameV, vikorBreakdown, vikorRegimeText, vikorSensView, VIKOR_V_SOURCE } from '@/lib/vikorBreakdown';
import { CalcMatrix, CalcSection, CalcStep, Reading, Worked, num, type CalcMode } from './CalcKit';
import { critLabel, fx, joinExpr, kindHint, listEs, pct } from './s3common';
import VikorSensitivityChart from '../VikorSensitivityChart';

/** Desglose paso a paso de VIKOR (Sesión 3, diapositivas 19-30 y 47-52): f* y f⁻ → aportes ponderados → S y R (con el criterio que fija
 * R) → Q → rankings por Q, S y R → condiciones C1/C2 con números y conjunto de compromiso → parámetro v y sensibilidad. Cada número
 * sale de `vikor()`, `vikorVerdict()` y `vikorSensitivity()` (vía `vikorBreakdown`/`vikorSensView`), nunca de otra fórmula. */
export type VikorBreakdownProps = {
  /** 'screen': pasos desplegables · 'report': todo abierto (se imprime). */
  mode: CalcMode;
  criteria: Criterion[];
  alternatives: Alternative[];
  /** Matriz de decisión TAL COMO se ingresó (con tipos beneficio/costo/objetivo y sus objetivos), no la ya resuelta. */
  decisionMatrix: DecisionMatrix;
  /** Un peso por criterio (los mismos que usa el ranking; aquí se muestran ya renormalizados a suma 1). */
  weights: number[];
  /** v usado en el ranking (0 a 1). En Resultados: `vEff`; en el informe: `vikorV`. */
  v: number;
  /** De dónde salen los pesos, p. ej. «la hoja Criterios (AHP)». Solo texto. */
  weightsSource?: string;
  /** Dibujar también la gráfica de Q según v en el paso 7 (por defecto no: en Resultados ya está en el panel de VIKOR). */
  showChart?: boolean;
};

const ACCENT = 'var(--m-vikor)';
const f2 = (x: number) => x.toFixed(2);

export default function VikorBreakdown({ mode, criteria, alternatives, decisionMatrix, weights, v, weightsSource, showChart = false }: VikorBreakdownProps) {
  const bd = useMemo(() => vikorBreakdown(criteria, alternatives, decisionMatrix, weights, v), [criteria, alternatives, decisionMatrix, weights, v]);
  const sens = useMemo(() => vikorSensView(bd.eff, bd.res.weights, bd.types, v, bd.tie), [bd, v]);
  const { alts, res, verdict } = bd;
  const n = alts.length, m = bd.criteria.length;
  if (n === 0 || m === 0) return null;

  const names = alts.map((a) => a.name);
  const cols = bd.criteria.map(critLabel);
  const order = res.order;
  const win = order[0], last = order[n - 1];
  const hasTarget = bd.criteria.some((c) => c.isDistance);
  const colOf = (M: number[][], j: number) => M.map((row) => row[j]);
  const critW = bd.criteria.map((c) => 'w = ' + num(c.weight, 4));
  const rNames = (i: number) => listEs(bd.rCrit[i].map((j) => bd.criteria[j].name));
  const maxR = Math.max(...res.r);
  const rWhy = (i: number) => `su peor criterio es ${rNames(i)} (R = ${num(res.r[i], 4)}, ${pct(bd.rShare[i], 0)} de su S)`;
  const worstRs = res.r.map((r, i) => (r >= maxR - 1e-9 ? i : -1)).filter((i) => i >= 0);

  const fStar = (j: number) => (bd.types[j] === 'min' ? 'mín' : 'máx');
  const fWorst = (j: number) => (bd.types[j] === 'min' ? 'máx' : 'mín');
  const contribExpr = (i: number, j: number) => {
    const den = res.best[j] - res.worst[j];
    return den === 0 ? `${bd.criteria[j].name}: f* = f⁻, el criterio no distingue → 0` : `${bd.criteria[j].name}: ${num(bd.criteria[j].weight, 4)} × (${fx(res.best[j])} − ${fx(bd.eff[i][j])}) / (${fx(res.best[j])} − ${fx(res.worst[j])}) = ${num(res.contrib[i][j], 4)}`;
  };
  const qExpr = (i: number) => {
    const sTxt = bd.sMax - bd.sMin === 0 ? '0 (S⁻ = S*)' : `(${num(res.s[i], 4)} − ${num(bd.sMin, 4)}) / (${num(bd.sMax, 4)} − ${num(bd.sMin, 4)}) = ${num(bd.sPart[i], 4)}`;
    const rTxt = bd.rMax - bd.rMin === 0 ? '0 (R⁻ = R*)' : `(${num(res.r[i], 4)} − ${num(bd.rMin, 4)}) / (${num(bd.rMax, 4)} − ${num(bd.rMin, 4)}) = ${num(bd.rPart[i], 4)}`;
    return `Q(${names[i]}) = ${num(v, 2)} × ${sTxt}\n      + ${num(1 - v, 2)} × ${rTxt}\n      = ${num(res.q[i], 4)}`;
  };

  const regimeText = vikorRegimeText(sens, names);
  const setNames = verdict ? verdict.set.map((i) => names[i]) : [];
  const sRankOne = names[res.s.indexOf(bd.sMin)], rRankOne = names[res.r.indexOf(bd.rMin)];

  return (
    <CalcSection
      mode={mode}
      accent={ACCENT}
      id="desglose-metodo"
      summary={verdict && verdict.kind !== 'unique'
        ? `Sin ganador único: conjunto de compromiso ${setNames.join(', ')} · v = ${num(v, 2)}`
        : `Gana ${names[win]} · Q = ${num(res.q[win], 4)} (menor es mejor) · v = ${num(v, 2)}`}
      title="Cómo se calculó VIKOR, paso a paso"
      intro={<>VIKOR (Opricovic &amp; Tzeng, 2004) busca una solución de <b>compromiso</b>: mide qué tan bien le va a cada alternativa <b>en promedio</b> (S) y qué tan mal le va en su <b>peor criterio</b> (R), y las combina en Q con el parámetro v = {f2(v)}. <b>Menor Q es mejor</b> (al revés que TOPSIS). Los pesos {weightsSource ? <>vienen de {weightsSource}</> : 'son datos de entrada'}. {n} alternativas × {m} criterios.</>}
    >
      {/* 1 --------------------------------------------------------------------------------------------- */}
      <CalcStep no={1} mode={mode} defaultOpen title="Mejor y peor valor de cada criterio (f* y f⁻)"
        meaning="VIKOR mide cuánto le falta a cada alternativa para llegar al mejor valor de cada criterio. Para eso necesita el mejor valor (f*) y el peor (f⁻) de cada columna; cuál es «mejor» depende de si el criterio es beneficio (más es mejor), costo (menos es mejor) u objetivo (acercarse a un valor)."
        formula={'Beneficio: f* = máx de la columna, f⁻ = mín\nCosto:     f* = mín de la columna, f⁻ = máx\nObjetivo:  x_efectivo = máx(0, |x − objetivo| − tolerancia)  →  se trata como costo'}>
        <CalcMatrix mode={mode} corner="Alternativa \ criterio" caption="Matriz de decisión efectiva, con f* y f⁻" rows={names} cols={cols} colHint={bd.criteria.map(kindHint)}
          cells={bd.eff.map((row) => row.map((x) => fx(x)))}
          hl={(i, j) => (Math.abs(bd.eff[i][j] - res.best[j]) < 1e-12 ? 'good' : undefined)}
          footer={[{ label: 'Peso w_j', cells: bd.criteria.map((c) => num(c.weight, 4)), hint: 'suma 1' }, { label: 'f* (mejor)', cells: res.best.map((x) => fx(x)) }, { label: 'f⁻ (peor)', cells: res.worst.map((x) => fx(x)) }]} />
        {hasTarget && (
          <Worked title="Con tus números: criterios objetivo">
            {bd.criteria.flatMap((c, j) => (c.isDistance && c.target ? alts.map((a, i) => {
              const x = bd.raw[i][j];
              return x == null ? `${a.name}, ${c.name}: sin dato (cuenta como 0)` : `${a.name}, ${c.name}: máx(0, |${fx(x)} − ${fx(c.target!.value)}| − ${fx(c.target!.tol)}) = ${fx(targetDistance(x, c.target!.value, c.target!.tol))}`;
            }) : [])).join('\n')}
          </Worked>
        )}
        <Worked>{bd.criteria.map((c, j) => `${critLabel(c)}: f* = ${fStar(j)}(${joinExpr(colOf(bd.eff, j).map(fx), ', ')}) = ${fx(res.best[j])}   ·   f⁻ = ${fWorst(j)}(…) = ${fx(res.worst[j])}`).join('\n')}</Worked>
        {bd.hasEmpty && <p className="calc-meaning"><b>Aviso:</b> hay celdas vacías (—). La plataforma las cuenta como 0; complétalas para que el resultado sea válido.</p>}
        <Reading>en negrita queda el mejor valor de cada columna (f*). Si f* y f⁻ son iguales, ese criterio no distingue entre alternativas y no aporta nada al resultado.</Reading>
      </CalcStep>

      {/* 2 --------------------------------------------------------------------------------------------- */}
      <CalcStep no={2} mode={mode} title="Aporte ponderado de cada criterio: cuánto le falta a cada alternativa"
        meaning="Para cada celda se calcula qué fracción del camino entre el peor (0) y el mejor valor (1) le falta a la alternativa, y se multiplica por el peso del criterio. Cero = la alternativa ya tiene el mejor valor de ese criterio; cuanto más grande, más lejos queda y más pesa el criterio."
        formula="aporte_ij = w_j · ( f*_j − x_ij ) / ( f*_j − f⁻_j )">
        <CalcMatrix mode={mode} corner="Alternativa \ criterio" caption="Aportes ponderados (0 = ya en el mejor valor)" rows={names} cols={cols} colHint={critW}
          cells={res.contrib.map((row, i) => row.map((x, j) => num(x, 4) + (bd.rCrit[i].includes(j) ? ' ◂R' : '')))}
          hl={(i, j) => (bd.rCrit[i].includes(j) ? 'key' : undefined)}
          footer={[{ label: 'Tope posible = w_j', cells: bd.criteria.map((c) => num(c.weight, 4)), hint: 'peor caso: le falta todo' }]} />
        <Worked title={`Con tus números: ${names[win]}`}>{bd.criteria.map((_, j) => contribExpr(win, j)).join('\n')}</Worked>
        {last !== win && <Worked title={`Con tus números: ${names[last]}`}>{bd.criteria.map((_, j) => contribExpr(last, j)).join('\n')}</Worked>}
        <Reading>◂R (y el fondo marcado) señala, en cada fila, el aporte más grande: ese es el criterio donde la alternativa queda más lejos del mejor valor una vez ponderado, y fija R en el paso siguiente. Ninguna celda puede superar el peso de su criterio (última fila): eso ocurre cuando la alternativa tiene el peor valor de la columna.</Reading>
      </CalcStep>

      {/* 3 --------------------------------------------------------------------------------------------- */}
      <CalcStep no={3} mode={mode} title="S (promedio) y R (peor criterio)"
        meaning="S suma todos los aportes: qué tan lejos queda la alternativa del ideal en conjunto (utilidad de grupo, la «regla de la mayoría»). R toma solo el aporte más grande: su punto más débil (arrepentimiento individual). Una debilidad grave puede dominar R aunque el promedio S sea bueno."
        formula={'S_i = Σ_j aporte_ij     (menor = mejor en promedio)\nR_i = máx_j aporte_ij  (menor = menos falla grave)'}>
        <CalcMatrix mode={mode} corner="Alternativa" caption="S, R y el criterio que fija R" rows={names} cols={['S = Σ aportes', 'R = máx aporte', 'Criterio que fija R', 'R como % de S']}
          cells={res.s.map((s, i) => [num(s, 4), num(res.r[i], 4), rNames(i), pct(bd.rShare[i], 0)])}
          hl={(i, j) => (j === 0 && bd.rankS[i] === 1 ? 'good' : j === 1 && bd.rankR[i] === 1 ? 'good' : undefined)} />
        <Worked>
          {names.map((nm, i) => `${nm}:  S = ${joinExpr(res.contrib[i].map((x) => num(x, 4)))} = ${num(res.s[i], 4)}   ·   R = máx(${joinExpr(res.contrib[i].map((x) => num(x, 4)), ', ')}) = ${num(res.r[i], 4)}  (${rNames(i)})`).join('\n')}
        </Worked>
        <Reading>en verde/negrita, el menor S (mejor promedio: <b>{sRankOne}</b>) y el menor R (menos falla grave: <b>{rRankOne}</b>). La última columna dice cuánto del S total está concentrado en un solo criterio: cerca de 100 % significa que casi toda su distancia al ideal viene de un único punto débil.</Reading>
      </CalcStep>

      {/* 4 --------------------------------------------------------------------------------------------- */}
      <CalcStep no={4} mode={mode} title={`Q: combinar S y R con v = ${f2(v)}`}
        meaning="S y R están en escalas distintas, así que primero cada uno se lleva a 0-1 con los extremos de las alternativas (0 = la mejor, 1 = la peor) y luego se mezclan con el peso v. Q = 0 es la mejor posible dentro de este grupo; Q = 1, la peor."
        formula={'Q_i = v · (S_i − S*) / (S⁻ − S*)  +  (1 − v) · (R_i − R*) / (R⁻ − R*)\nS* = mín S, S⁻ = máx S, R* = mín R, R⁻ = máx R'}>
        <CalcMatrix mode={mode} corner="Alternativa" caption={`Q con v = ${f2(v)}`} rows={names} cols={['S', '(S−S*)/(S⁻−S*)', 'R', '(R−R*)/(R⁻−R*)', 'Q']}
          cells={names.map((_, i) => [num(res.s[i], 4), num(bd.sPart[i], 4), num(res.r[i], 4), num(bd.rPart[i], 4), num(res.q[i], 4)])}
          hl={(i, j) => (j === 4 && bd.rankQ[i] === 1 && !bd.tie ? 'good' : undefined)}
          footer={[{ label: 'Extremos', cells: [`S* = ${num(bd.sMin, 4)} · S⁻ = ${num(bd.sMax, 4)}`, '', `R* = ${num(bd.rMin, 4)} · R⁻ = ${num(bd.rMax, 4)}`, '', ''] }]} wide />
        <Worked>{names.map((_, i) => qExpr(i)).join('\n')}</Worked>
        <Reading>Q = 0 marca a la mejor del grupo y Q = 1 a la peor. Como se normaliza con los extremos de ESTAS alternativas, agregar o quitar una alternativa extrema puede cambiar todos los Q.</Reading>
      </CalcStep>

      {/* 5 --------------------------------------------------------------------------------------------- */}
      <CalcStep no={5} mode={mode} title="Ranking por Q, por S y por R"
        meaning="VIKOR ordena por Q (menor primero), pero también mira las posiciones por S y por R por separado: la estabilidad del ganador (condición 2) depende de que también sea el mejor en alguna de las dos."
        formula="Posición: 1 = menor valor (en Q, S y R menor es mejor)">
        <CalcMatrix mode={mode} corner="Posición por Q · alternativa" caption="Las tres clasificaciones" rows={order.map((i) => `#${bd.rankQ[i]} ${names[i]}`)}
          cols={['Q', 'Pos. Q', 'S', 'Pos. S', 'R', 'Pos. R']}
          cells={order.map((i) => [num(res.q[i], 4), '#' + bd.rankQ[i], num(res.s[i], 4), '#' + bd.rankS[i], num(res.r[i], 4), '#' + bd.rankR[i]])}
          hl={(k, j) => { const i = order[k]; return (j === 0 && bd.rankQ[i] === 1) || (j === 2 && bd.rankS[i] === 1) || (j === 4 && bd.rankR[i] === 1) ? 'good' : undefined; }} wide />
        <Reading>{bd.tie ? 'todas las alternativas tienen el mismo Q: con estos datos VIKOR no distingue entre ellas.' : <>mejor por Q: <b>{names[win]}</b>; mejor por S: <b>{sRankOne}</b>; mejor por R: <b>{rRankOne}</b>. Si las tres coinciden, el resultado es sólido; si no, el orden depende de cuánto pese el promedio (S) frente al peor caso (R), es decir, de v.</>}</Reading>
      </CalcStep>

      {/* 6 --------------------------------------------------------------------------------------------- */}
      <CalcStep no={6} mode={mode} title="¿Hay un ganador único? Condiciones C1 y C2 (Opricovic & Tzeng, 2004)"
        meaning="Tener el Q más bajo no basta. VIKOR solo declara un ganador único si además (C1) le saca una ventaja aceptable al segundo y (C2) es estable, es decir, también es el mejor en S o en R. Si no, propone un conjunto de compromiso: los datos no separan a un ganador y eso es un resultado, no un error."
        formula={'C1 (ventaja aceptable):  Q(2º) − Q(1º) ≥ DQ = 1/(m − 1),   m = número de alternativas\nC2 (estabilidad):  el 1º por Q es también el mejor en S y/o en R\nSi solo falla C2 → {1º, 2º}.  Si falla C1 → todas con Q − Q(1º) < DQ'}>
        {verdict ? (
          <>
            <Worked title="Con tus números">
              {`m = ${verdict.m}  →  DQ = 1/(${verdict.m} − 1) = ${num(verdict.dq, 4)}\nC1:  ΔQ = Q(2º) − Q(1º) = ${num(res.q[order[1]], 4)} − ${num(res.q[win], 4)} = ${num(verdict.deltaQ, 4)}   ${verdict.deltaQ >= verdict.dq - 1e-9 ? '≥' : '<'}   DQ = ${num(verdict.dq, 4)}   →   ${verdict.c1 ? '✓ se cumple' : '✗ NO se cumple'}\nC2:  mejor por S = ${verdict.bestS.map((i) => names[i]).join(', ')};  mejor por R = ${verdict.bestR.map((i) => names[i]).join(', ')};  1º por Q = ${names[win]}   →   ${verdict.c2 ? '✓ se cumple' : '✗ NO se cumple'}`}
            </Worked>
            <CalcMatrix mode={mode} corner="Posición por Q · alternativa" caption="Quién entra al conjunto de compromiso" rows={order.map((i) => `#${bd.rankQ[i]} ${names[i]}`)}
              cols={['Q', 'Q − Q(1º)', 'Umbral DQ', '¿Entra al conjunto?']}
              cells={order.map((i) => [num(res.q[i], 4), num(bd.gap[i], 4), i === win ? '—' : num(verdict.dq, 4), bd.inSet[i] ? '✓ entra' : '✗ no entra'])}
              hl={(k) => (bd.inSet[order[k]] ? 'key' : undefined)} />
            <Reading title="Resultado">
              {verdict.kind === 'unique' && <>cumple C1 y C2: <b>{setNames[0]}</b> es ganador único con v = {f2(v)}. El conjunto de compromiso tiene un solo elemento; las demás quedan a {num(Math.min(...order.slice(1).map((i) => bd.gap[i])), 4)} o más del 1º, por encima del umbral {num(verdict.dq, 4)}.</>}
              {verdict.kind === 'two' && <>cumple C1 pero falla C2: no hay ganador único; se proponen <b>{listEs(setNames)}</b>, porque el 1º por Q no es el mejor en S ni en R y su primer lugar depende de v.</>}
              {verdict.kind === 'set' && <>falla C1{!verdict.c2 ? ' (y también C2)' : ''}: ΔQ = {num(verdict.deltaQ, 4)} es menor que DQ = {num(verdict.dq, 4)}, la ventaja del 1º no es suficiente. El conjunto de compromiso son las alternativas a menos de DQ del 1º: <b>{listEs(setNames)}</b>. Con pocas alternativas exigir tanta ventaja en una escala 0-1 es mucho: los datos no separan a un ganador.</>}
            </Reading>
          </>
        ) : (
          <p className="calc-meaning">{bd.tie ? 'Todas las alternativas tienen el mismo Q: no hay 1º ni 2º y las condiciones no se pueden evaluar. Revisa que la matriz esté completa.' : 'Con menos de 2 alternativas no se pueden evaluar C1 y C2.'}</p>
        )}
      </CalcStep>

      {/* 7 --------------------------------------------------------------------------------------------- */}
      <CalcStep no={7} mode={mode} title="El parámetro v: no sale de los datos, se elige"
        meaning={<>v es el peso de S («regla de la mayoría»); 1 − v es el de R («no fallar en ningún criterio»). <b>No se calcula a partir de la matriz ni de los pesos: lo fija quien decide.</b> v &gt; 0.5 favorece a quien rinde bien en promedio; v &lt; 0.5, a quien no tiene debilidades graves; v = 0.5 es el «consenso». Según la literatura del curso ({VIKOR_V_SOURCE}) 0.5 es solo una convención, y ninguna fuente da un criterio para derivar v de los datos. En este análisis se usó <b>v = {f2(v)}</b>.</>}
        formula="Q(v) = v · parteS + (1 − v) · parteR      →  Q es una recta en v: se puede barrer de 0 a 1">
        {!bd.tie && (
          <>
            <CalcMatrix mode={mode} corner="v" caption="Q de cada alternativa según v (menor Q = 1º)" rows={sens.rows.map((row) => `v = ${f2(row.v)}${sameV(row.v, v) ? ' ◀ usado' : ''}${sens.breaks.some((b) => sameV(b.v, row.v)) ? ' ⇄ cruce' : ''}`)}
              cols={[...names.map((nm) => 'Q ' + nm), '1º por Q', 'Veredicto']}
              cells={sens.rows.map((row) => [...row.q.map((q) => num(q, 4)), names[row.order[0]], row.verdict ? (row.verdict.kind === 'unique' ? 'Ganador único' : `Conjunto de ${row.verdict.set.length}`) : '—'])}
              hl={(k, j) => (j < n && Math.abs(sens.rows[k].q[j] - Math.min(...sens.rows[k].q)) < 1e-9 ? 'good' : undefined)} wide />
            <Reading>◀ es el v que se usó y ⇄ un v donde cambia el 1er lugar (las dos alternativas se cruzan y empatan). {regimeText ? <><b>{regimeText}</b> </> : null}{sens.breaks.length === 0 ? 'El ganador es robusto: no cambia con ningún v, así que haber elegido v no decide el resultado (aunque el 2.º lugar sí puede cambiar).' : 'El ganador depende de haber elegido v: dilo en el informe y presenta las alternativas que se disputan el 1º, no una sola.'}</Reading>
            {showChart && <VikorSensitivityChart names={names} ends={sens.ends} v={v} breaks={sens.breaks.map((b) => b.v)} solidLabels={mode === 'report'} />}
          </>
        )}
        <Reading title="Buenas prácticas con v">1) reportar el v usado junto a los pesos: sin él un ranking VIKOR no se puede reproducir; 2) probar otros v (0.25, 0.5, 0.75 o un barrido de 0 a 1), como en la tabla; 3) si el 1º no cambia con v el resultado es robusto, si cambia decirlo y presentar las alternativas en disputa; 4) criterio didáctico del curso, no regla publicada: si una falla grave en un solo criterio es inaceptable, v &lt; 0.5 tiene sentido; si las debilidades se pueden compensar, v &gt; 0.5.</Reading>
      </CalcStep>

      {/* Qué dice tu caso ------------------------------------------------------------------------------ */}
      <Reading title="Qué dice tu caso">
        {n < 2 ? (
          <>Hay una sola alternativa ({names[0]}): no hay con qué compararla, así que VIKOR no puede ordenar nada. Agrega al menos otra.</>
        ) : bd.tie || !verdict ? (
          <>Con estos datos, pesos y v = {f2(v)} las alternativas no se distinguen por Q; VIKOR no puede proponer un ganador.</>
        ) : (
          <>
            {verdict.kind === 'unique'
              ? <><b>{names[win]}</b> es el ganador único con v = {f2(v)}: Q = {num(res.q[win], 4)}, le saca ΔQ = {num(verdict.deltaQ, 4)} a {names[order[1]]} (umbral DQ = {num(verdict.dq, 4)}) y es el mejor en {listEs([...(verdict.bestS.includes(win) ? ['S'] : []), ...(verdict.bestR.includes(win) ? ['R'] : [])])}.</>
              : <>VIKOR <b>no declara un ganador único</b> con v = {f2(v)}: el conjunto de compromiso es <b>{listEs(setNames)}</b> (mejor por Q: {names[win]}, Q = {num(res.q[win], 4)}; ΔQ = {num(verdict.deltaQ, 4)} frente a DQ = {num(verdict.dq, 4)}).</>}
            {' '}{bd.rMax - bd.rMin > 1e-9 && worstRs.length < n && <>VIKOR penaliza más a <b>{listEs(worstRs.map((i) => names[i]))}</b>: {worstRs.length === 1 ? rWhy(worstRs[0]) : worstRs.map((i) => `${names[i]}, ${rWhy(i)}`).join('; ')}. Una sola debilidad puede dominar R aunque el promedio S no sea el peor: por eso S y R pueden contar historias distintas. </>}
            {regimeText && <>Sensibilidad: {regimeText} </>}
            Reporta v = {f2(v)} junto con los pesos.
          </>
        )}
      </Reading>
    </CalcSection>
  );
}
