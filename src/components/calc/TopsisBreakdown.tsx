'use client';

import { useMemo } from 'react';
import type { Alternative, Criterion, DecisionMatrix } from '@/lib/types';
import { topsisBreakdown, topsisMainGap, type TopsisBreakdown as Bd } from '@/lib/topsisBreakdown';
import { targetDistance } from '@/lib/topsis';
import { CalcMatrix, CalcSection, CalcStep, Reading, Worked, num, type CalcMode } from './CalcKit';
import { critLabel, fx, joinExpr, kindHint, listEs, pct, sqrtOfSquares } from './s3common';
import TopsisScatter from './TopsisScatter';

/** Desglose paso a paso de TOPSIS (Sesión 3, diapositivas 9-18 y 43-46): matriz y tipos → normalización → ponderación → A⁺/A⁻ →
 * D⁺/D⁻ → C y ranking → ejemplo resuelto. Cada número sale de `topsis()` (vía `topsisBreakdown`), nunca de otra fórmula. */
export type TopsisBreakdownProps = {
  /** 'screen': pasos desplegables · 'report': todo abierto (se imprime). */
  mode: CalcMode;
  criteria: Criterion[];
  alternatives: Alternative[];
  /** Matriz de decisión TAL COMO se ingresó (con tipos beneficio/costo/objetivo y sus objetivos), no la ya resuelta. */
  decisionMatrix: DecisionMatrix;
  /** Un peso por criterio (los mismos que usa el ranking; aquí se muestran ya renormalizados a suma 1). */
  weights: number[];
  /** De dónde salen los pesos, p. ej. «la hoja Criterios (AHP)» o «CRITIC». Solo texto. */
  weightsSource?: string;
  /** Dibujar la dispersión 2D (por defecto sí). */
  showScatter?: boolean;
};

const ACCENT = 'var(--m-topsis)';

export default function TopsisBreakdown({ mode, criteria, alternatives, decisionMatrix, weights, weightsSource, showScatter = true }: TopsisBreakdownProps) {
  const bd = useMemo(() => topsisBreakdown(criteria, alternatives, decisionMatrix, weights), [criteria, alternatives, decisionMatrix, weights]);
  const { alts, res } = bd;
  const n = alts.length, m = bd.criteria.length;
  if (n === 0 || m === 0) return null;

  const names = alts.map((a) => a.name);
  const cols = bd.criteria.map(critLabel);
  const hintKind = bd.criteria.map(kindHint);
  const hintW = bd.criteria.map((c) => 'w = ' + num(c.weight, 4));
  const hasTarget = bd.criteria.some((c) => c.isDistance);
  const order = res.order;
  const win = order[0];
  const last = order[n - 1];
  const colOf = (M: number[][], j: number) => M.map((row) => row[j]);

  // Regla A⁺/A⁻ escrita por criterio, con los valores reales de la columna ponderada.
  const idealLine = (j: number) => {
    const c = bd.criteria[j];
    const col = colOf(res.v, j).map((x) => num(x, 4));
    const fBest = c.type === 'min' ? 'mín' : 'máx', fWorst = c.type === 'min' ? 'máx' : 'mín';
    return `${critLabel(c)}, ${c.kind === 'max' ? 'beneficio' : c.kind === 'min' ? 'costo' : 'objetivo (se trata como costo)'}:  A⁺ = ${fBest}(${joinExpr(col, ', ')}) = ${num(res.best[j], 4)}   ·   A⁻ = ${fWorst}(…) = ${num(res.worst[j], 4)}`;
  };

  // «Qué dice tu caso»
  const cs = res.closeness;
  const minDp = Math.min(...res.distPlus), maxDm = Math.max(...res.distMinus);
  const winClosest = Math.abs(res.distPlus[win] - minDp) < 1e-9, winFarthest = Math.abs(res.distMinus[win] - maxDm) < 1e-9;
  const closestIdeal = alts[res.distPlus.indexOf(minDp)]?.name;
  const farthestAnti = alts[res.distMinus.indexOf(maxDm)]?.name;
  const tops = order.filter((i) => bd.rank[i] === 1);
  const second = n > 1 && tops.length === 1 ? order[1] : null;
  const gap2 = second != null ? cs[win] - cs[second] : null;
  const mg = second != null ? topsisMainGap(bd, second) : null;

  return (
    <CalcSection
      mode={mode}
      accent={ACCENT}
      id="desglose-metodo"
      summary={tops.length === 1 ? `Gana ${names[win]} · cercanía C = ${num(cs[win], 4)} · pasos: matriz normalizada → ponderada → ideales → distancias → C` : 'Empate en el 1.er lugar: los datos no distinguen entre las alternativas'}
      title="Cómo se calculó TOPSIS, paso a paso"
      intro={<>TOPSIS (Hwang &amp; Yoon, 1981) construye una alternativa <b>ideal</b> (lo mejor de cada criterio) y una <b>anti-ideal</b> (lo peor) y elige la que queda más cerca de la primera y más lejos de la segunda. Los pesos {weightsSource ? <>vienen de {weightsSource}</> : 'son datos de entrada'}: TOPSIS no los calcula. {alts.length} alternativas × {m} criterios.</>}
    >
      {/* 1 --------------------------------------------------------------------------------------------- */}
      <CalcStep no={1} mode={mode} defaultOpen title="Matriz de decisión y dirección de cada criterio"
        meaning="TOPSIS solo puede armar el ideal si sabe en qué dirección mejora cada criterio: en unos mejorar es subir (beneficio), en otros bajar (costo) y en otros acercarse a un valor exacto (objetivo). Invertir la dirección de un criterio invierte su aporte a todo el resultado."
        formula={<>{'Beneficio:  A⁺ = máx de la columna, A⁻ = mín\nCosto:      A⁺ = mín de la columna, A⁻ = máx\nObjetivo:   x_efectivo = máx(0, |x − objetivo| − tolerancia)  →  después se trata como costo'}</>}>
        <CalcMatrix mode={mode} corner="Alternativa \ criterio" caption="Matriz de decisión tal como se ingresó" rows={names} cols={cols} colHint={hintKind}
          cells={bd.raw.map((row) => row.map((x) => (x == null ? '—' : fx(x))))} footer={[{ label: 'Peso w_j', cells: bd.criteria.map((c) => num(c.weight, 4)), hint: 'suma 1' }]} />
        {hasTarget ? (
          <>
            <CalcMatrix mode={mode} corner="Alternativa \ criterio" caption="Matriz efectiva x_ij (los criterios objetivo pasan a ser distancia al objetivo)" rows={names} cols={cols}
              colHint={bd.criteria.map((c) => (c.isDistance ? 'distancia al objetivo' : c.type === 'min' ? 'costo' : 'beneficio'))}
              cells={bd.eff.map((row) => row.map((x) => fx(x)))} hl={(_, j) => (bd.criteria[j].isDistance ? 'key' : undefined)} />
            <Worked title="Con tus números: criterios objetivo">
              {bd.criteria.flatMap((c, j) => (c.isDistance && c.target ? alts.map((a, i) => {
                const x = bd.raw[i][j];
                return x == null ? `${a.name}, ${c.name}: sin dato (cuenta como 0)` : `${a.name}, ${c.name}: máx(0, |${fx(x)} − ${fx(c.target!.value)}| − ${fx(c.target!.tol)}) = ${fx(targetDistance(x, c.target!.value, c.target!.tol))}`;
              }) : [])).join('\n')}
            </Worked>
          </>
        ) : (
          <p className="calc-meaning muted">No hay criterios de tipo objetivo: la matriz efectiva es igual a la ingresada.</p>
        )}
        {bd.hasEmpty && <p className="calc-meaning"><b>Aviso:</b> hay celdas vacías (—). La plataforma las cuenta como 0; complétalas en la matriz de decisión para que el resultado sea válido.</p>}
        <Reading>en cada columna, la etiqueta debajo del criterio dice qué valor será el ideal: en un criterio ▲ el más alto de la columna, en uno ▼ el más bajo. La fila «Peso» es la importancia de cada criterio y suma 1.</Reading>
      </CalcStep>

      {/* 2 --------------------------------------------------------------------------------------------- */}
      <CalcStep no={2} mode={mode} title="Normalizar: llevar todos los criterios a la misma escala"
        meaning="Precio en miles de pesos, tiempo en horas y distancia en km no se pueden sumar. Cada valor se divide entre la «magnitud» de su columna (raíz de la suma de cuadrados), así queda expresado como qué tan grande es frente a las demás alternativas."
        formula="r_ij = x_ij / ‖x_j‖,   con  ‖x_j‖ = √( Σ_i x_ij² )">
        <CalcMatrix mode={mode} corner="Alternativa \ criterio" caption="Matriz normalizada r_ij" rows={names} cols={cols} cells={bd.r}
          footer={[{ label: '‖x_j‖ = √Σx²', cells: res.norms, hint: 'norma de la columna' }]} />
        <Worked>
          {bd.criteria.map((c, j) => `‖${c.name}‖ = ${sqrtOfSquares(colOf(bd.eff, j), 4, true)} = ${num(res.norms[j], 4)}`).join('\n')}
          {`\nr(${names[0]}, ${bd.criteria[0].name}) = ${fx(bd.eff[0][0])} / ${num(res.norms[0], 4)} = ${num(bd.r[0][0], 4)}`}
        </Worked>
        <Reading>cada columna de r está entre 0 y 1: un valor cercano a 1 significa que esa alternativa concentra casi toda la «magnitud» del criterio; uno cercano a 0, que casi no aporta.</Reading>
      </CalcStep>

      {/* 3 --------------------------------------------------------------------------------------------- */}
      <CalcStep no={3} mode={mode} title="Ponderar: multiplicar por la importancia de cada criterio"
        meaning={<>No todos los criterios importan igual. Cada valor normalizado se multiplica por el peso de su criterio{weightsSource ? ` (de ${weightsSource})` : ''}. El resultado está en la misma escala y ajustado por importancia: es la matriz sobre la que se miden las distancias.</>}
        formula="v_ij = w_j · r_ij">
        <CalcMatrix mode={mode} corner="Alternativa \ criterio" caption="Matriz ponderada v_ij" rows={names} cols={cols} colHint={hintW} cells={res.v} />
        <Worked>
          {`v(${names[0]}, ${bd.criteria[0].name}) = w × r = ${num(bd.criteria[0].weight, 4)} × ${num(bd.r[0][0], 4)} = ${num(res.v[0][0], 4)}`}
          {`\nSuma de pesos = ${num(res.weights.reduce((a, b) => a + b, 0), 4)}`}
        </Worked>
        <Reading>un criterio de mucho peso «estira» las diferencias entre alternativas en su columna; uno de poco peso las achica. Por eso pesar bien importa tanto como medir bien.</Reading>
      </CalcStep>

      {/* 4 --------------------------------------------------------------------------------------------- */}
      <CalcStep no={4} mode={mode} title="Ideal (A⁺) y anti-ideal (A⁻)"
        meaning="A⁺ toma, en cada columna, el mejor valor de la matriz ponderada; A⁻, el peor. Son puntos construidos, no alternativas reales: casi nunca una sola alternativa es la mejor en todos los criterios a la vez, y el ideal es esa combinación imaginaria."
        formula={'A⁺_j = máx_i v_ij si el criterio es beneficio, mín_i v_ij si es costo\nA⁻_j = mín_i v_ij si es beneficio, máx_i v_ij si es costo'}>
        <CalcMatrix mode={mode} corner="Alternativa \ criterio" caption="Matriz ponderada con el ideal y el anti-ideal" rows={names} cols={cols} colHint={hintKind}
          cells={res.v.map((row, i) => row.map((x, j) => num(x, 4) + (Math.abs(x - res.best[j]) < 1e-12 ? ' ⁺' : Math.abs(x - res.worst[j]) < 1e-12 ? ' ⁻' : '')))}
          hl={(i, j) => (Math.abs(res.v[i][j] - res.best[j]) < 1e-12 ? 'good' : undefined)}
          footer={[{ label: 'A⁺ (ideal)', cells: res.best.map((x) => num(x, 4)) }, { label: 'A⁻ (anti-ideal)', cells: res.worst.map((x) => num(x, 4)) }]} />
        <Worked>{bd.criteria.map((_, j) => idealLine(j)).join('\n')}</Worked>
        <Reading>⁺ marca la celda que fija el ideal de su columna (además va en negrita) y ⁻ la que fija el anti-ideal. Una misma alternativa puede fijar el ideal en un criterio y el anti-ideal en otro.</Reading>
      </CalcStep>

      {/* 5 --------------------------------------------------------------------------------------------- */}
      <CalcStep no={5} mode={mode} title="Distancias al ideal (D⁺) y al anti-ideal (D⁻)"
        meaning="Se mide qué tan lejos queda cada alternativa de A⁺ y de A⁻ con distancia euclidiana (línea recta, Pitágoras en varias dimensiones): en cada criterio se toma la diferencia, se eleva al cuadrado, se suman y se saca raíz."
        formula={'D⁺_i = √( Σ_j (v_ij − A⁺_j)² )\nD⁻_i = √( Σ_j (v_ij − A⁻_j)² )'}>
        <CalcMatrix mode={mode} corner="Alternativa" caption="Diferencia |v − A⁺| por criterio y D⁺ (menor = más cerca del ideal)" rows={names} cols={[...cols, 'D⁺']}
          cells={bd.diffPlus.map((row, i) => [...row, res.distPlus[i]])} hl={(i, j) => (j === m ? (i === res.distPlus.indexOf(minDp) ? 'good' : 'key') : undefined)} />
        <CalcMatrix mode={mode} corner="Alternativa" caption="Diferencia |v − A⁻| por criterio y D⁻ (mayor = más lejos del anti-ideal)" rows={names} cols={[...cols, 'D⁻']}
          cells={bd.diffMinus.map((row, i) => [...row, res.distMinus[i]])} hl={(i, j) => (j === m ? (i === res.distMinus.indexOf(maxDm) ? 'good' : 'key') : undefined)} />
        <Worked title="Con tus números: D⁺">
          {names.map((nm, i) => `D⁺(${nm}) = ${sqrtOfSquares(bd.diffPlus[i], 4)} = ${num(res.distPlus[i], 4)}`).join('\n')}
        </Worked>
        <Worked title="Con tus números: D⁻">
          {names.map((nm, i) => `D⁻(${nm}) = ${sqrtOfSquares(bd.diffMinus[i], 4)} = ${num(res.distMinus[i], 4)}`).join('\n')}
        </Worked>
        <Reading>cada término dentro de la raíz es lo que le falta a la alternativa en UN criterio. Un término grande es su punto débil (frente al ideal) o su punto fuerte (frente al anti-ideal). Sobresalen en negrita la menor D⁺ y la mayor D⁻.</Reading>
        {showScatter && <TopsisScatter bd={bd} />}
      </CalcStep>

      {/* 6 --------------------------------------------------------------------------------------------- */}
      <CalcStep no={6} mode={mode} title="Coeficiente de cercanía C y ranking"
        meaning="C combina las dos distancias en un solo número entre 0 y 1: vale 1 si la alternativa coincide con el ideal y 0 si coincide con el anti-ideal. Gana la de mayor C: cerca del ideal Y lejos del anti-ideal a la vez."
        formula="C_i = D⁻_i / ( D⁺_i + D⁻_i )      →  se ordena de mayor a menor C">
        <CalcMatrix mode={mode} corner="Posición · alternativa" caption="Distancias, cercanía y posición" rows={order.map((i) => `#${bd.rank[i]} ${names[i]}`)}
          cols={['D⁺', 'D⁻', 'C']} cells={order.map((i) => [res.distPlus[i], res.distMinus[i], cs[i]])} hl={(k, j) => (j === 2 && bd.rank[order[k]] === 1 && !bd.tie ? 'good' : undefined)} />
        <Worked>
          {order.map((i) => `C(${names[i]}) = ${num(res.distMinus[i], 4)} / (${num(res.distPlus[i], 4)} + ${num(res.distMinus[i], 4)}) = ${num(cs[i], 4)}`).join('\n')}
        </Worked>
        <Reading>{bd.tie ? 'todas las alternativas tienen el mismo C: con estos datos TOPSIS no distingue entre ellas.' : `la de mayor C es la primera. Un C cercano a 1 indica una alternativa casi ideal; cercano a 0, casi la peor combinación posible. Si los C de dos alternativas son casi iguales (diferencia menor de 0.02), la posición entre ellas es frágil.`}</Reading>
      </CalcStep>

      {/* 7 --------------------------------------------------------------------------------------------- */}
      <CalcStep no={7} mode={mode} title="Ejemplo resuelto de principio a fin"
        meaning={n > 1 ? `Los mismos pasos, con los números de la alternativa mejor clasificada (${names[win]}) y de la peor (${names[last]}), para poder seguirlos a mano.` : `Los mismos pasos con los números de ${names[win]}.`}>
        {(n > 1 && win !== last ? [win, last] : [win]).map((i) => <Example key={i} bd={bd} i={i} mode={mode} />)}
      </CalcStep>

      {/* Qué dice tu caso ------------------------------------------------------------------------------ */}
      <Reading title="Qué dice tu caso">
        {n < 2 ? (
          <>Hay una sola alternativa ({names[0]}): no hay con qué compararla, así que TOPSIS no puede ordenar nada. Agrega al menos otra.</>
        ) : bd.tie ? (
          <>Con estos datos y pesos todas las alternativas tienen la misma cercanía (C = {num(cs[0], 4)}): TOPSIS no encuentra una mejor. Revisa que la matriz esté completa y que las alternativas realmente se diferencien.</>
        ) : tops.length > 1 ? (
          <><b>{listEs(tops.map((i) => names[i]))}</b> empatan en el 1.er lugar con C = {num(cs[win], 4)}: con estos datos y pesos TOPSIS no las distingue. Para desempatar hace falta un criterio en que difieran o cambiar los pesos, y conviene presentarlas juntas.</>
        ) : (
          <>
            <b>{names[win]}</b> queda 1.ª con C = {num(cs[win], 4)}
            {winClosest && winFarthest
              ? <>: tiene el D⁺ más bajo ({num(res.distPlus[win], 4)}) y el D⁻ más alto ({num(res.distMinus[win], 4)}), es decir, es la más cercana al ideal y la más lejana del anti-ideal a la vez.</>
              : winClosest
                ? <>: es la más cercana al ideal (D⁺ = {num(minDp, 4)}), pero la más lejana del anti-ideal es {farthestAnti} (D⁻ = {num(maxDm, 4)}); C pondera las dos distancias a la vez.</>
                : winFarthest
                  ? <>: es la más lejana del anti-ideal (D⁻ = {num(maxDm, 4)}), pero la más cercana al ideal es {closestIdeal} (D⁺ = {num(minDp, 4)}); C pondera las dos distancias a la vez.</>
                  : <>: no es la más cercana al ideal (esa es {closestIdeal}, D⁺ = {num(minDp, 4)}) ni la más lejana del anti-ideal (esa es {farthestAnti}, D⁻ = {num(maxDm, 4)}), pero combina ambas distancias mejor que las demás.</>}
            {second != null && gap2 != null && <> Le saca {num(gap2, 4)} de C a {names[second]}{gap2 < 0.02 ? ' (carrera muy cerrada: con otros pesos podría cambiar el orden)' : ''}.</>}
            {mg && second != null && <> Lo que más aleja a {names[second]} del ideal es {bd.criteria[mg.j].name} ({pct(mg.share, 0)} de su D⁺²).</>}
            {' '}A⁺ y A⁻ son puntos construidos, no alternativas reales; y el resultado depende de los pesos: {weightsSource ? `vienen de ${weightsSource}` : 'son dato de entrada'}, así que conviene reportarlos junto al ranking.
          </>
        )}
      </Reading>
    </CalcSection>
  );
}

/** Recorrido completo de una alternativa: x → r → v → distancias → D → C. */
function Example({ bd, i, mode }: { bd: Bd; i: number; mode: CalcMode }) {
  const { res } = bd;
  const sqP = bd.diffPlus[i].map((d) => d * d), sqM = bd.diffMinus[i].map((d) => d * d);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <CalcMatrix mode={mode} corner="Criterio" caption={`${bd.alts[i].name} (posición ${bd.rank[i]}): de x a D⁺ y D⁻`} rows={bd.criteria.map((c) => c.name)}
        cols={['x', '‖x‖', 'r = x/‖x‖', 'w', 'v = w·r', 'A⁺', '(v−A⁺)²', 'A⁻', '(v−A⁻)²']}
        cells={bd.criteria.map((_, j) => [fx(bd.eff[i][j]), num(res.norms[j], 4), num(bd.r[i][j], 4), num(bd.criteria[j].weight, 4), num(res.v[i][j], 4), num(res.best[j], 4), num(sqP[j], 6), num(res.worst[j], 4), num(sqM[j], 6)])}
        footer={[{ label: 'Suma', cells: ['', '', '', '', '', '', num(sum(sqP), 6), '', num(sum(sqM), 6)] }]} wide />
      <Worked title={`Con tus números: ${bd.alts[i].name}`}>
        {`D⁺ = √(${num(sum(sqP), 6)}) = ${num(res.distPlus[i], 4)}\nD⁻ = √(${num(sum(sqM), 6)}) = ${num(res.distMinus[i], 4)}\nC = D⁻ / (D⁺ + D⁻) = ${num(res.distMinus[i], 4)} / ${num(res.distPlus[i] + res.distMinus[i], 4)} = ${num(res.closeness[i], 4)}`}
      </Worked>
    </div>
  );
}
