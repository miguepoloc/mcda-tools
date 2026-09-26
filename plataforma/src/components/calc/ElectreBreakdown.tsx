'use client';

import { useMemo, useState } from 'react';
import {
  EPS, electre, electreInputs, electreKernel, electreKernelText, electrePairDetail, electreSensitivity, ELECTRE_C_STAR_DEFAULT, ELECTRE_D_STAR_DEFAULT,
  type ElectrePairDetail, type ElectreResult,
} from '@/lib/electre';
import type { Alternative, Criterion, DecisionMatrix } from '@/lib/types';
import { withUnit } from '@/lib/units';
import ElectreGraph from '../ElectreGraph';
import ElectreMatrices from '../ElectreMatrices';
import { CalcMatrix, CalcSection, CalcStep, Reading, Worked, type CalcCell, type CalcMode } from './CalcKit';
import { fmtVal, fmtVs, listNames, listPlain, n4, unorderedPairs } from './calcFormat';
import { InputsTable, Note, PairPicker } from './OutrankingShared';

export type ElectreBreakdownProps = {
  /** 'screen': cada paso es un <details> y hay selector de par; 'report': todo abierto y con los pares listados (se imprime). */
  mode: CalcMode;
  criteria: Criterion[];
  alternatives: Alternative[];
  /** Matriz de decisión EFECTIVA (con los criterios «objetivo» ya convertidos por resolveTargets), la misma que lee electreSynthesis. */
  dm: DecisionMatrix;
  /** Pesos de los criterios en el orden de `criteria` (los mismos que recibe electreSynthesis; se normalizan a suma 1 igual que en electre()). */
  weights: number[];
  cStar: number;
  dStar: number;
  /** Dibuja también el grafo de superación en el paso 6 (por defecto no: Resultados y el informe ya lo traen aparte). */
  showGraph?: boolean;
};

const ok = (b: boolean) => (b ? '✓' : '✗');
const kernelOf = (r: ElectreResult) => electreKernel(r.outranks);
const relationCount = (r: ElectreResult): number => r.outranks.reduce((a, row) => a + row.filter(Boolean).length, 0);

/** Desglose de ELECTRE I paso a paso, como en las diapositivas 5-26 de la sesión 4, con los números del proyecto: matriz y pesos,
 * concordancia (con el desglose de un par criterio por criterio), discordancia (con el criterio donde ocurre el máximo), umbrales c* y d*,
 * matrices C y D con la relación de superación, e incomparables con su porqué y el núcleo. Todo sale de electre() y electrePairDetail()
 * (los mismos números que la plataforma, el grafo y el Excel). Cada paso trae «Cómo leerlo» y «Qué dice tu caso». */
export default function ElectreBreakdown({ mode, criteria, alternatives, dm, weights, cStar, dStar, showGraph = false }: ElectreBreakdownProps) {
  const names = useMemo(() => alternatives.map((a) => a.name), [alternatives]);
  const labels = useMemo(() => criteria.map((c) => withUnit(c)), [criteria]);
  const { matrix, types } = useMemo(() => electreInputs(criteria, alternatives, dm), [criteria, alternatives, dm]);
  const result = useMemo(() => electre(matrix, weights, types, cStar, dStar), [matrix, weights, types, cStar, dStar]);
  const n = names.length, m = criteria.length;
  const firstRel = useMemo<[number, number]>(() => {
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) if (i !== k && result.outranks[i]?.[k]) return [i, k];
    return [0, Math.min(1, n - 1)];
  }, [result, n]);
  const [pair, setPair] = useState<[number, number] | null>(null);
  const [pa, pb] = pair && pair[0] < n && pair[1] < n && pair[0] !== pair[1] ? pair : firstRel;
  const sens = useMemo(() => electreSensitivity(matrix, weights, types, { cStar, dStar }), [matrix, weights, types, cStar, dStar]);
  const kernelNote = useMemo(() => electreKernelText(names, kernelOf(result), relationCount(result) > 0), [names, result]);

  if (n < 2 || m < 1) {
    return (
      <CalcSection title="Cálculo de ELECTRE, paso a paso" accent="var(--m-electre)" mode={mode}
        intro="ELECTRE compara alternativas de a pares: se necesitan al menos 2 alternativas y 1 criterio con valores para mostrar el cálculo.">
        {null}
      </CalcSection>
    );
  }

  const cOkAt = (i: number, k: number) => result.concordance[i][k] >= cStar - EPS;
  const dOkAt = (i: number, k: number) => result.discordance[i][k] <= dStar + EPS;
  const detail = (i: number, k: number) => electrePairDetail(matrix, types, result, i, k);
  const sel = detail(pa, pb);
  const relations = relationCount(result);
  const totalPairs = n * (n - 1);

  // pares para el informe: todos si son pocos; si no, solo los que tienen alguna relación (la tabla completa compacta cubre el resto)
  const allUnordered = unorderedPairs(n);
  const reportPairsCut = allUnordered.length > 10;
  const reportPairs = reportPairsCut ? allUnordered.filter(([i, k]) => result.outranks[i][k] || result.outranks[k][i]) : allUnordered;

  /** Todos los pares ordenados con su c, d y veredicto, para las frases «Qué dice tu caso» y las tablas completas. */
  const ordered: { i: number; k: number; c: number; d: number; win: boolean }[] = [];
  for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) if (i !== k) ordered.push({ i, k, c: result.concordance[i][k], d: result.discordance[i][k], win: !!result.outranks[i][k] });
  const orderedDetails = ordered.map((o) => detail(o.i, o.k));
  const maxC = ordered.reduce((a, b) => (b.c > a.c ? b : a));
  const maxD = ordered.reduce((a, b) => (b.d > a.d ? b : a));
  const dDetailMax = detail(maxD.i, maxD.k);
  const vetoes = ordered.filter((o) => !dOkAt(o.i, o.k) && cOkAt(o.i, o.k));

  const inCrit = (js: number[]) => js.map((j) => `«${labels[j]}»`).join(' y ');
  const A = (d: ElectrePairDetail) => names[d.a];
  const B = (d: ElectrePairDetail) => names[d.b];
  const cRows = (d: ElectrePairDetail): CalcCell[][] => d.rows.map((r) => [n4(r.w), fmtVal(r.xa), fmtVal(r.xb), r.aAtLeast ? 'Sí' : 'No', r.aAtLeast ? n4(r.w) : '0', r.bAtLeast ? 'Sí' : 'No', r.bAtLeast ? n4(r.w) : '0']);

  const concTable = (d: ElectrePairDetail) => (
    <CalcMatrix
      mode={mode} corner="Criterio" caption={`Concordancia del par ${A(d)} y ${B(d)}: criterio por criterio`}
      rows={labels} rowHint={types.map((t) => (t === 'min' ? 'costo: cuenta si a ≤ b' : 'beneficio: cuenta si a ≥ b'))}
      cols={['Peso w_j', A(d), B(d), `¿${A(d)} al menos tan buena?`, `Aporta a c(${A(d)}, ${B(d)})`, `¿${B(d)} al menos tan buena?`, `Aporta a c(${B(d)}, ${A(d)})`]}
      cells={cRows(d)}
      hl={(i, j) => ((j === 4 && d.rows[i].aAtLeast) || (j === 6 && d.rows[i].bAtLeast) ? 'good' : undefined)}
      footer={[{ label: 'Suma', cells: [n4(d.rows.reduce((s, r) => s + r.w, 0)), '', '', '', n4(d.c), '', n4(d.cRev)] }]}
      wide
    />
  );
  const concWorked = (d: ElectrePairDetail) => {
    const a = d.rows.filter((r) => r.aAtLeast), b = d.rows.filter((r) => r.bAtLeast);
    const line = (who: string, other: string, rs: typeof a, total: number) =>
      `c(${who}, ${other}) = ${rs.length > 1 ? rs.map((r) => n4(r.w)).join(' + ') + ' = ' : ''}${n4(total)}   ${rs.length ? '(cuentan ' + rs.map((r) => labels[r.j]).join(', ') + ')' : '(ningún criterio la respalda)'}\n`;
    return line(A(d), B(d), a, d.c) + line(B(d), A(d), b, d.cRev)
      + (d.hasTies
        ? `Comprobación: c(${A(d)}, ${B(d)}) + c(${B(d)}, ${A(d)}) = ${n4(d.c + d.cRev)}. Suma más de 1 porque hay un criterio con empate exacto y en un empate cuentan las dos.`
        : `Comprobación: c(${A(d)}, ${B(d)}) + c(${B(d)}, ${A(d)}) = ${n4(d.c)} + ${n4(d.cRev)} = ${n4(d.c + d.cRev)}. Sin empates, lo que no respalda a una respalda a la otra.`);
  };

  const discRows = (d: ElectrePairDetail): CalcCell[][] => d.rows.map((r) => {
    const who = r.bWins ? B(d) : r.aWins ? A(d) : 'Empate';
    const norm = `${fmtVal(r.gap)} ÷ ${fmtVal(r.range)} = ${n4(r.norm)}`;
    const mark = (isMax: boolean) => (isMax ? ' ◄ máximo' : '');
    return [fmtVal(r.range), fmtVal(r.xa), fmtVal(r.xb), who, fmtVal(r.gap),
      r.bWins ? norm + mark(d.dCrits.includes(r.j)) : '—', r.aWins ? norm + mark(d.dCritsRev.includes(r.j)) : '—'];
  });
  const discTable = (d: ElectrePairDetail) => (
    <CalcMatrix
      mode={mode} corner="Criterio" caption={`Discordancia del par ${A(d)} y ${B(d)}: quién gana en cada criterio y por cuánto`}
      rows={labels} rowHint={types.map((t) => (t === 'min' ? 'costo: gana el menor' : 'beneficio: gana el mayor'))}
      cols={['Rango R_j', A(d), B(d), '¿Quién gana?', 'Ventaja (diferencia)', `Ventaja ÷ R_j → cuenta para d(${A(d)}, ${B(d)})`, `Ventaja ÷ R_j → cuenta para d(${B(d)}, ${A(d)})`]}
      cells={discRows(d)}
      hl={(i, j) => ((j === 5 && d.dCrits.includes(i)) || (j === 6 && d.dCritsRev.includes(i)) ? 'key' : undefined)}
      footer={[{ label: 'Máximo = d', hint: 'no se suma ni se pondera', cells: ['', '', '', '', '', n4(d.d) + (d.dCrits.length ? ` en ${inCrit(d.dCrits)}` : ` (${B(d)} no gana en ninguno)`), n4(d.dRev) + (d.dCritsRev.length ? ` en ${inCrit(d.dCritsRev)}` : ` (${A(d)} no gana en ninguno)`)] }]}
      wide
    />
  );
  const discWorked = (d: ElectrePairDetail) => {
    const line = (who: string, other: string, rs: typeof d.rows, val: number, crits: number[]) =>
      rs.length
        ? `d(${who}, ${other}) = máx( ${rs.map((r) => `${labels[r.j]}: ${fmtVal(r.gap)} ÷ ${fmtVal(r.range)} = ${n4(r.norm)}`).join(' ; ')} ) = ${n4(val)} en ${inCrit(crits)}${crits.length > 1 ? ' (empatan en el máximo)' : ''}\n`
        : `d(${who}, ${other}) = 0   (${other} no gana en ningún criterio: no hay nada que objetar)\n`;
    return line(A(d), B(d), d.rows.filter((r) => r.bWins), d.d, d.dCrits) + line(B(d), A(d), d.rows.filter((r) => r.aWins), d.dRev, d.dCritsRev)
      + 'A diferencia de c, d(a, b) + d(b, a) NO suma 1: son medidas independientes.';
  };

  // ---- tablas completas compactas (todos los pares ordenados, sin recortar) ----
  const pairLabel = (i: number, k: number) => `${names[i]} → ${names[k]}`;
  const compactC = (
    <CalcMatrix
      mode={mode} corner="Par (a → b)" caption={`Concordancia de los ${totalPairs} pares ordenados: qué criterios respaldan «a es al menos tan buena como b»`}
      rows={ordered.map((o) => pairLabel(o.i, o.k))}
      cols={[...labels, 'c(a, b)']} colHint={[...result.weights.map((w) => 'w = ' + n4(w)), 'suma de pesos ✓']}
      cells={orderedDetails.map((dd, r) => [...dd.rows.map((x) => (x.aAtLeast ? `✓ ${n4(x.w)}` : '✗')), `${n4(dd.c)} ${ok(cOkAt(ordered[r].i, ordered[r].k))}`])}
      hl={(r, j) => (j < m ? (orderedDetails[r].rows[j].aAtLeast ? 'good' : undefined) : cOkAt(ordered[r].i, ordered[r].k) ? 'key' : undefined)}
      wide
    />
  );
  const compactD = (
    <CalcMatrix
      mode={mode} corner="Par (a → b)" caption={`Discordancia de los ${totalPairs} pares ordenados: ventaja de b sobre a ÷ rango, solo donde b gana`}
      rows={ordered.map((o) => pairLabel(o.i, o.k))}
      cols={[...labels, 'd(a, b) = máximo']} colHint={[...result.ranges.map((r) => 'R = ' + fmtVal(r)), 'y en qué criterio']}
      cells={orderedDetails.map((dd, r) => [...dd.rows.map((x) => (x.bWins ? n4(x.norm) : '—')), `${n4(dd.d)}${dd.dCrits.length ? ` (${dd.dCrits.map((j) => labels[j]).join(' y ')})` : ''} ${ok(dOkAt(ordered[r].i, ordered[r].k))}`])}
      hl={(r, j) => (j < m ? (orderedDetails[r].dCrits.includes(j) ? 'key' : undefined) : !dOkAt(ordered[r].i, ordered[r].k) ? 'bad' : undefined)}
      wide
    />
  );

  // ---- pasos ----
  const pairBlock = (kind: 'c' | 'd') => {
    if (mode === 'screen') {
      return (
        <>
          <p className="calc-meaning"><b>Elige un par: </b>el desglose de abajo se recalcula con las alternativas que escojas (a es la fila, b la columna).</p>
          <PairPicker names={names} a={pa} b={pb} onChange={(x, y) => setPair([x, y])} />
          {kind === 'c' ? concTable(sel) : discTable(sel)}
          <Worked>{kind === 'c' ? concWorked(sel) : discWorked(sel)}</Worked>
          <details>
            <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>Ver los {totalPairs} pares ordenados de una vez</summary>
            {kind === 'c' ? compactC : compactD}
          </details>
        </>
      );
    }
    return (
      <>
        {reportPairs.map(([i, k]) => {
          const dd = detail(i, k);
          return (
            <div key={i + '-' + k} className="ob-pair">
              <h5 className="ob-sub">Par {names[i]} y {names[k]}</h5>
              {kind === 'c' ? concTable(dd) : discTable(dd)}
              <Worked>{kind === 'c' ? concWorked(dd) : discWorked(dd)}</Worked>
            </div>
          );
        })}
        {reportPairsCut && <Note>Con {n} alternativas hay {allUnordered.length} pares; el desglose criterio por criterio se muestra solo para los que tienen alguna relación de superación. Los {totalPairs} pares ordenados, completos, están en la tabla de abajo.</Note>}
        <h5 className="ob-sub">Los {totalPairs} pares ordenados, todos</h5>
        {kind === 'c' ? compactC : compactD}
      </>
    );
  };

  const incomparablePairs = allUnordered.filter(([i, k]) => !result.outranks[i][k] && !result.outranks[k][i]);
  const whyNot = (i: number, k: number): string => {
    const dd = detail(i, k);
    let dtxt = `d = ${fmtVs(dd.d, dStar, 'd')} ${dOkAt(i, k) ? '≤' : '>'} d* ${dStar.toFixed(2)} ${ok(dOkAt(i, k))}`;
    if (dd.dCrits.length && !dOkAt(i, k)) {
      dtxt += ` (el máximo está en ${dd.dCrits.map((j) => `«${labels[j]}»: ${names[k]} tiene ${fmtVal(dd.rows[j].xb)} y ${names[i]} ${fmtVal(dd.rows[j].xa)}, una ventaja de ${n4(dd.rows[j].norm)} del rango`).join('; y en ')})`;
    }
    const verdict = !cOkAt(i, k) && !dOkAt(i, k) ? 'Fallan las dos condiciones.' : !cOkAt(i, k) ? 'Falla la concordancia.' : 'Falla la discordancia (veto).';
    return `${names[i]} → ${names[k]}: c = ${fmtVs(dd.c, cStar, 'c')} ${cOkAt(i, k) ? '≥' : '<'} c* ${cStar.toFixed(2)} ${ok(cOkAt(i, k))} · ${dtxt}. ${verdict}`;
  };

  const sameDefault = cStar === ELECTRE_C_STAR_DEFAULT && dStar === ELECTRE_D_STAR_DEFAULT;
  const wMax = Math.max(...result.weights);
  const stable = sens.length > 1 && new Set(sens.map((s) => (s.winner != null ? 'w' + s.winner : 'k' + s.kernelMembers.join(',')))).size === 1;

  return (
    <CalcSection
      title="Cálculo de ELECTRE I, paso a paso"
      accent="var(--m-electre)" mode={mode}
      intro="ELECTRE compara las alternativas de a pares y decide si una «supera» a otra. No compensa: un criterio muy malo puede bloquear la superación sin importar lo bien que le vaya en los demás, y a veces ninguna supera a la otra. Todo lo de abajo sale de tu matriz de decisión y de los pesos de tus criterios."
    >
      <CalcStep no={1} title="Matriz de decisión, tipo de cada criterio, pesos y rangos" mode={mode} defaultOpen
        meaning="Los datos de partida. El tipo (beneficio o costo) fija en qué dirección «ser mejor» tiene sentido; el peso dice cuánto pesa cada criterio; el rango R_j (máximo − mínimo del criterio) sirve para medir las diferencias en una escala común en la discordancia."
        formula={'R_j = máx_i x_ij − mín_i x_ij        (si R_j = 0 se usa 1)'}>
        <InputsTable mode={mode} names={names} critLabels={labels} matrix={matrix} types={types} weights={result.weights} ranges={result.ranges} rangeName="Rango R_j" rangeMeaning="máx − mín del criterio" />
        <Reading>cada fila es una alternativa y cada columna un criterio; bajo el nombre del criterio está si es de beneficio (↑) o de costo (↓) y su peso w. El rango R_j es la distancia entre el mejor y el peor valor: un criterio con rango pequeño hace que una diferencia pequeña pese mucho en la discordancia.</Reading>
        <Reading title="Qué dice tu caso">
          tienes {n} alternativas ({listNames(names)}) evaluadas en {m} criterios. El criterio con más peso es «{labels[result.weights.indexOf(wMax)]}» ({n4(wMax)}).
          {types.some((t) => t === 'min') ? ` Son de costo: ${listNames(labels.filter((_, j) => types[j] === 'min'))}; en ellos «al menos tan buena» significa tener un valor menor o igual.` : ' Todos los criterios son de beneficio: «al menos tan buena» significa tener un valor mayor o igual.'}
        </Reading>
      </CalcStep>

      <CalcStep no={2} title="Concordancia c(a, b): ¿cuánto peso respalda que «a es al menos tan buena como b»?" mode={mode}
        meaning="Para cada par ordenado (a, b) se pregunta, criterio por criterio, si a es al menos tan buena como b. Cada criterio que responde «Sí» aporta su peso completo (no importa cuánto mejor sea, solo si lo es); la suma va de 0 (ningún criterio la respalda) a 1 (todos la respaldan). Es el respaldo a favor."
        formula={'c(a, b) = Σ w_j     sobre los criterios j donde a es «al menos tan buena» como b\nbeneficio (más es mejor): x_aj ≥ x_bj        costo (menos es mejor): x_aj ≤ x_bj'}>
        <dl className="ob-legend">
          <dt>a, b</dt><dd>las dos alternativas que se comparan (a = fila, b = columna); el orden importa: c(a, b) ≠ c(b, a)</dd>
          <dt>j</dt><dd>un criterio ({listNames(labels)})</dd>
          <dt>x_aj</dt><dd>el valor de la alternativa a en el criterio j</dd>
          <dt>w_j</dt><dd>el peso del criterio j (normalizado: suman 1)</dd>
          <dt>Σ</dt><dd>se suma solo sobre los criterios donde a es al menos tan buena como b</dd>
        </dl>
        <Note title="Regla de costo">
          en un criterio de costo el mejor valor es el menor, por eso «al menos tan buena» se escribe ≤ (x_aj ≤ x_bj) en vez de ≥. Un empate exacto cuenta a favor de las dos.
        </Note>
        {pairBlock('c')}
        <Reading>cada fila de la tabla es un criterio; «Aporta» es el peso completo si la respuesta es Sí y 0 si es No. La suma del pie es c. Una c alta NO basta para que a supere a b: falta comprobar que ningún criterio la objete con fuerza (paso 3).</Reading>
        <Reading title="Qué dice tu caso">
          {mode === 'screen' ? `en el par que elegiste, c(${A(sel)}, ${B(sel)}) = ${n4(sel.c)} (${sel.rows.some((r) => r.aAtLeast) ? 'la respaldan ' + listNames(sel.rows.filter((r) => r.aAtLeast).map((r) => labels[r.j])) : 'ningún criterio la respalda'}) y c(${B(sel)}, ${A(sel)}) = ${n4(sel.cRev)}. ` : ''}
          La mayor concordancia de todo el proyecto es c({names[maxC.i]}, {names[maxC.k]}) = {n4(maxC.c)}: {names[maxC.i]} es al menos tan buena como {names[maxC.k]} en criterios que suman el {(maxC.c * 100).toFixed(1)}% del peso.
        </Reading>
      </CalcStep>

      <CalcStep no={3} title="Discordancia d(a, b): ¿hay un rechazo fuerte contra «a supera a b»?" mode={mode}
        meaning="Mide el peor rechazo: la mayor ventaja que b le saca a a en UN solo criterio, dividida entre el rango de ese criterio para quedar entre 0 y 1. Solo cuentan los criterios donde b gana. Se toma el máximo, no la suma ni se pondera con pesos: un solo criterio muy malo basta para una d alta. Por eso ELECTRE no compensa."
        formula={'d(a, b) = máx_j { (x_bj − x_aj) ÷ R_j }     solo sobre los criterios donde b gana; 0 si b no gana en ninguno\ncosto: b gana si x_bj < x_aj y la ventaja es x_aj − x_bj'}>
        <dl className="ob-legend">
          <dt>x_bj − x_aj</dt><dd>la ventaja de b sobre a en el criterio j (positiva solo donde b gana)</dd>
          <dt>R_j</dt><dd>el rango del criterio (paso 1): al dividir, la ventaja queda entre 0 y 1</dd>
          <dt>máx</dt><dd>se queda con la mayor ventaja: basta UN criterio fuerte en contra</dd>
          <dt>0</dt><dd>si b no le gana a a en ningún criterio no hay nada que objetar</dd>
        </dl>
        {pairBlock('d')}
        <Reading>en la tabla, la celda marcada «◄ máximo» es el criterio que define d. d = 1.00 significa que b le gana a a por todo el rango del criterio; d cercana a 0 significa que ningún rechazo es fuerte. Se compara contra d* (paso 4).</Reading>
        <Reading title="Qué dice tu caso">
          {mode === 'screen' ? `en el par elegido, d(${A(sel)}, ${B(sel)}) = ${n4(sel.d)}${sel.dCrits.length ? ` en ${inCrit(sel.dCrits)}` : ' (' + B(sel) + ' no gana en ninguno)'}. ` : ''}
          La mayor objeción de todo el proyecto es d({names[maxD.i]}, {names[maxD.k]}) = {n4(maxD.d)}
          {dDetailMax.dCrits.length ? ` en ${inCrit(dDetailMax.dCrits)} (${dDetailMax.dCrits.map((j) => `${names[maxD.k]}: ${fmtVal(dDetailMax.rows[j].xb)} frente a ${names[maxD.i]}: ${fmtVal(dDetailMax.rows[j].xa)}`).join('; ')})` : ''}.
          {vetoes.length > 0 ? ` En ${vetoes.length} par${vetoes.length === 1 ? '' : 'es'} la concordancia sí alcanza c* pero la discordancia lo veta.` : ' Ningún par con concordancia suficiente es vetado por la discordancia.'}
        </Reading>
      </CalcStep>

      <CalcStep no={4} title="Umbrales c* y d*: ¿cuánto es suficiente?" mode={mode}
        meaning="a supera a b solo si se cumplen las DOS condiciones a la vez: hay suficiente respaldo (c ≥ c*) y ningún rechazo demasiado fuerte (d ≤ d*). Los dos umbrales los elige quien aplica el método: no salen de los datos."
        formula={'a supera a b   ⇔   c(a, b) ≥ c*   Y   d(a, b) ≤ d*'}>
        <CalcMatrix
          mode={mode} corner="Umbral" caption="Umbrales usados en este proyecto"
          rows={['c* (concordancia mínima)', 'd* (discordancia máxima)']}
          cols={['Valor usado', 'Más exigente si…']}
          cells={[[cStar.toFixed(2), 'sube (pide más peso a favor)'], [dStar.toFixed(2), 'baja (tolera menos cualquier rechazo fuerte)']]}
          wide
        />
        <Note title="Convención del curso, no un estándar">
          no hay un valor universal (a diferencia de CR = 0.10 en AHP). En clase se usaron c* = 0.50 y d* = 0.50 en el ejemplo del viaje, y c* = 0.65 y d* = 0.70 en el caso real IoT/Palmor; el valor por defecto de la plataforma es c* = 0.65 y d* = 0.30, más estricto en discordancia. {sameDefault ? 'Ahora estás usando ese valor por defecto. ' : ''}Lo importante es declarar los que usaste y comprobar si el resultado depende de ellos.
        </Note>
        <p className="ob-sub">Sensibilidad: el mismo cálculo con otros umbrales</p>
        <CalcMatrix
          mode={mode} corner="c* / d*" caption="Cuántas relaciones de superación salen con otras combinaciones de umbrales"
          rows={sens.map((s) => `c* = ${s.cStar.toFixed(2)} · d* = ${s.dStar.toFixed(2)}${s.current ? ' (los tuyos)' : ''}`)}
          cols={['Relaciones (a supera a b)', 'Pares incomparables', 'Núcleo']}
          cells={sens.map((s) => [String(s.relations), String(s.incomparable), s.winner != null ? `Ganador: ${names[s.winner]}` : s.relations === 0 ? 'Todas (sin relaciones)' : `${listNames(s.kernelMembers.map((i) => names[i]))} (sin ganador único)`])}
          hl={(i, j) => (sens[i].current && j === 0 ? 'key' : undefined)}
          wide
        />
        <Reading>cada fila repite todo el cálculo con esa pareja de umbrales. Si el núcleo o el ganador cambian de una fila a otra, tu conclusión depende de c* y d*: repórtalo en el informe (es un hallazgo válido).</Reading>
        <Reading title="Qué dice tu caso">
          con c* = {cStar.toFixed(2)} y d* = {dStar.toFixed(2)}, {relations} de los {totalPairs} pares ordenados cumplen las dos condiciones.
          {sens.length > 1 ? (stable ? ' El núcleo es el mismo en todas las combinaciones probadas: el resultado es estable frente a los umbrales.' : ' El núcleo cambia según los umbrales: el resultado es sensible a esta elección.') : ''}
        </Reading>
      </CalcStep>

      <CalcStep no={5} title="Matrices C y D completas y relación de superación" mode={mode}
        meaning="Todas las concordancias y discordancias juntas. Cada celda lleva ✓ o ✗ según cumpla su umbral, y la tercera matriz cruza las dos: la fila supera a la columna solo si cumple ambas."
        formula={'S(a, b) = ✓   ⇔   C[a, b] ≥ c*   Y   D[a, b] ≤ d*        (diagonal: no se compara consigo misma)'}>
        <ElectreMatrices names={names} result={result} mode={mode} />
        <Reading>la fila es a y la columna es b. En la tercera matriz, «✗ falla c», «✗ falla d» o «✗ falla c y d» dice cuál condición impide la superación: es lo que explica los incomparables del paso 6.</Reading>
        <Reading title="Qué dice tu caso">
          {relations > 0
            ? `hay ${relations} ${relations === 1 ? 'relación' : 'relaciones'} de superación: ${listPlain(ordered.filter((o) => o.win).map((o) => `${names[o.i]} supera a ${names[o.k]}`))}.`
            : 'ninguna alternativa supera a otra con estos umbrales (baja c* o sube d* si esperabas relaciones).'}
        </Reading>
      </CalcStep>

      <CalcStep no={6} title="Incomparables y núcleo: ¿hay una alternativa ganadora?" mode={mode}
        meaning="Si ninguna de las dos direcciones de un par cumple las dos condiciones, ese par es incomparable: los datos no alcanzan para preferir una sobre la otra con estos umbrales. No es un error del cálculo, es el método funcionando. El núcleo es el conjunto de alternativas que ninguna otra del núcleo supera y que, juntas, superan a todas las demás."
        formula={'incomparables(a, b)   ⇔   no (a supera a b)   y   no (b supera a a)'}>
        {incomparablePairs.length ? (
          <ul className="ob-list">
            {incomparablePairs.map(([i, k]) => (
              <li key={i + '-' + k}><b>{names[i]} y {names[k]} son incomparables.</b> {whyNot(i, k)} {whyNot(k, i)}</li>
            ))}
          </ul>
        ) : <p className="calc-meaning">Ningún par es incomparable: cada par tiene relación en algún sentido.</p>}
        {showGraph && (
          <ElectreGraph names={names} outranks={result.outranks} concordance={result.concordance} discordance={result.discordance} cStar={cStar} dStar={dStar} />
        )}
        <p className="ob-sub">Núcleo</p>
        <p className="calc-meaning"><b>{kernelNote.summary}</b></p>
        <ul className="ob-list">{kernelNote.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        <Reading>una flecha «a supera a b» exige c ≥ c* y d ≤ d*; un par incomparable falla al menos una en cada dirección. Que nadie supere a una alternativa NO la hace ganadora: solo hay ganador cuando el núcleo es una única alternativa.</Reading>
        <Reading title="Qué dice tu caso">
          {incomparablePairs.length
            ? `${incomparablePairs.length} de los ${allUnordered.length} pares son incomparables (${incomparablePairs.slice(0, 4).map(([i, k]) => `${names[i]} y ${names[k]}`).join('; ')}${incomparablePairs.length > 4 ? '…' : ''}). `
            : 'todos los pares tienen relación. '}
          {kernelNote.summary}
        </Reading>
      </CalcStep>
    </CalcSection>
  );
}
