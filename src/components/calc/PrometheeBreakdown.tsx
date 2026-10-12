'use client';

import { useId, useMemo, useState } from 'react';
import { preferenceDetail, promethee, prometheeI, prometheeInputs, type PreferenceDetail, type PrometheeResult } from '@/lib/promethee';
import { curvePoints, describePref, PROMETHEE_FN_INFO, prefFn } from '@/lib/prometheeConfig';
import type { Alternative, Criterion, DecisionMatrix, MatrixType, PrometheeFn } from '@/lib/types';
import { withUnit } from '@/lib/units';
import PrometheeFlows from '../PrometheeFlows';
import { CalcMatrix, CalcSection, CalcStep, Reading, Worked, type CalcCell, type CalcMode } from './CalcKit';
import { fmtVal, listNames, n4, sgn } from './calcFormat';
import { InputsTable, Note, PairPicker } from './OutrankingShared';

export type PrometheeBreakdownProps = {
  /** 'screen': cada paso es un <details> y hay selector de par; 'report': todo abierto (se imprime). */
  mode: CalcMode;
  criteria: Criterion[];
  alternatives: Alternative[];
  /** Matriz de decisión EFECTIVA (criterios «objetivo» ya convertidos por resolveTargets), la misma que lee prometheeSynthesis. */
  dm: DecisionMatrix;
  /** Pesos de los criterios en el orden de `criteria` (los mismos que recibe prometheeSynthesis; se normalizan a suma 1). */
  weights: number[];
};

const TIE = 1e-9;

/** Curva P(d) de la función de preferencia de un criterio (cualquiera de las seis de Brans y Vincke), con los d reales observados
 * entre pares de alternativas. Eje x: d = ventaja de a sobre b en la unidad del criterio (negativa = gana b); eje y: P(d) de 0 a 1.
 * Círculo lleno = P > 0 (a es preferida en ese criterio); círculo hueco = P = 0. SVG propio, título, ejes y leyenda dentro del
 * dibujo; solo variables CSS. */
export function PreferenceCurve({ title, unit, fn, q, p, s, range, d, type }: { title: string; unit?: string; fn: PrometheeFn; q: number; p: number; s: number; range: number; d: number[]; type: MatrixType }) {
  const uid = useId().replace(/:/g, '');
  const W = 270, H = 190, L = 46, R = 14, T = 34, Bm = 50;
  const iw = W - L - R, ih = H - T - Bm;
  const info = PROMETHEE_FN_INFO[fn];
  const dom = Math.max(range, info.p ? p : 0, info.q ? q : 0, 1e-9); // los d observados caen siempre en [−rango, rango]
  const x = (v: number) => L + ((Math.max(-dom, Math.min(dom, v)) + dom) / (2 * dom)) * iw;
  const y = (v: number) => T + (1 - v) * ih;
  const path = curvePoints(fn, q, p, s, dom).map(([dx, dy], k) => `${k === 0 ? 'M' : 'L'}${x(dx)},${y(dy)}`).join(' ');
  const uniq = Array.from(new Set(d.map((v) => Number(v.toPrecision(9))))).sort((a, b) => a - b);
  const pos = uniq.filter((v) => v > 0);
  const params = [info.q ? `q = ${fmtVal(q)}` : '', info.p ? `p = ${fmtVal(p)}` : '', info.s ? `σ = ${fmtVal(s)}` : ''].filter(Boolean).join(', ');
  const summary = `Función de preferencia de ${title}: Tipo ${info.type}, ${info.label.toLowerCase()}${params ? ' (' + params + (unit ? ' ' + unit : '') + ')' : ''}. ${info.formula}. `
    + (pos.length ? `Diferencias observadas a favor de una alternativa: ${pos.map((v) => `${fmtVal(v)} (P = ${prefFn(fn, v, q, p, s).toFixed(2)})`).join(', ')}.` : 'No hay diferencias a favor de ninguna alternativa.');
  const ticks = [0, 0.5, 1];
  const xmarks: [number, string][] = [[-dom, `−${fmtVal(dom)}`], [0, '0'], [dom, fmtVal(dom)]];
  const thresholds: [number, string][] = [];
  if (info.q && q > 0 && q < dom) thresholds.push([q, 'q']);
  if (info.p && p < dom && !(fn === 'vshape' && p === dom)) thresholds.push([p, 'p']);
  return (
    <div className="ob-curve">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${uid}-t`}>
        <title id={`${uid}-t`}>{summary}</title>
        <text x={L} y={16} fontSize="13" fontWeight={700} fill="var(--ink)">{title.length > 34 ? title.slice(0, 33) + '…' : title}</text>
        <text x={L} y={29} fontSize="12" fill="var(--muted)">{`${info.label}${params ? ' · ' + params : ''}`.slice(0, 40)}</text>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? undefined : '3 4'} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="12" fill="var(--muted)">{t}</text>
          </g>
        ))}
        <line x1={x(0)} x2={x(0)} y1={T} y2={T + ih} stroke="var(--muted)" strokeDasharray="2 3" />
        <line x1={L} x2={L} y1={T} y2={T + ih} stroke="var(--ink)" />
        {thresholds.map(([v, lab]) => (
          <g key={lab}>
            <line x1={x(v)} x2={x(v)} y1={T} y2={T + ih} stroke="var(--muted)" strokeDasharray="1 4" />
            <text x={x(v)} y={T + ih + 28} textAnchor="middle" fontSize="12" fill="var(--muted)">{lab}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--m-promethee)" strokeWidth={2.6} strokeLinejoin="round" />
        {uniq.map((v) => {
          const P = prefFn(fn, v, q, p, s);
          return P > 0
            ? <circle key={v} cx={x(v)} cy={y(P)} r={4.5} fill="var(--m-promethee)" stroke="var(--ink)" strokeWidth={1.4} />
            : <circle key={v} cx={x(v)} cy={y(0)} r={4} fill="var(--surface)" stroke="var(--ink)" strokeWidth={1.4} />;
        })}
        {xmarks.map(([v, lab]) => (
          <text key={lab + v} x={x(v)} y={T + ih + 16} textAnchor={v === dom ? 'end' : v === -dom ? 'start' : 'middle'} fontSize="12" fill="var(--muted)">{lab}</text>
        ))}
        <text x={L + iw / 2} y={H - 8} textAnchor="middle" fontSize="12" fill="var(--ink)">d = ventaja de a sobre b{unit ? ` (${unit})` : ''}</text>
        <text transform={`translate(12 ${T + ih / 2}) rotate(-90)`} textAnchor="middle" fontSize="12" fill="var(--ink)">P(d)</text>
      </svg>
    </div>
  );
}

/** Desglose de PROMETHEE II paso a paso (y PROMETHEE I), como en las diapositivas 27-40 de la sesión 4, con los números del proyecto:
 * matriz y pesos, función de preferencia por criterio (tabla y curva P(d)), preferencia agregada π de un par criterio por criterio, matriz π
 * completa, flujos φ⁺, φ⁻ y φ con la comprobación Σφ = 0, ranking PROMETHEE II y PROMETHEE I (ranking parcial). Todo sale de promethee(),
 * preferenceDetail() y prometheeI() (los mismos números que la plataforma y el Excel). Cada paso trae «Cómo leerlo» y «Qué dice tu caso». */
export default function PrometheeBreakdown({ mode, criteria, alternatives, dm, weights }: PrometheeBreakdownProps) {
  const names = useMemo(() => alternatives.map((a) => a.name), [alternatives]);
  const labels = useMemo(() => criteria.map((c) => withUnit(c)), [criteria]);
  const { matrix, types, cfg } = useMemo(() => prometheeInputs(criteria, alternatives, dm), [criteria, alternatives, dm]);
  const res = useMemo<PrometheeResult>(() => promethee(matrix, weights, types, cfg), [matrix, weights, types, cfg]);
  const n = names.length, m = criteria.length;
  const [pair, setPair] = useState<[number, number] | null>(null);
  const p1 = useMemo(() => prometheeI(res.phiPlus, res.phiMinus), [res]);
  // par mostrado por defecto: el de mayor π (el más ilustrativo), salvo que el estudiante elija otro
  const best = useMemo(() => {
    let bi = 0, bk = Math.min(1, n - 1), v = -1;
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) if (i !== k && res.pi[i][k] > v) { v = res.pi[i][k]; bi = i; bk = k; }
    return [bi, bk] as [number, number];
  }, [res, n]);

  if (n < 2 || m < 1) {
    return (
      <CalcSection title="Cálculo de PROMETHEE, paso a paso" accent="var(--m-promethee)" mode={mode}
        intro="PROMETHEE compara alternativas de a pares: se necesitan al menos 2 alternativas y 1 criterio con valores para mostrar el cálculo.">
        {null}
      </CalcSection>
    );
  }

  const [pa, pb] = pair && pair[0] < n && pair[1] < n && pair[0] !== pair[1] ? pair : best;
  const detail = (a: number, b: number): PreferenceDetail => preferenceDetail(matrix, types, res, a, b);
  const sel = detail(pa, pb), rev = detail(pb, pa);

  const rank = res.phi.map((f) => 1 + res.phi.filter((o) => o > f + TIE).length);
  const order = res.order;
  const sumPhi = res.phi.reduce((a, b) => a + b, 0);
  const sumPlus = res.phiPlus.reduce((a, b) => a + b, 0), sumMinus = res.phiMinus.reduce((a, b) => a + b, 0);
  const denom = Math.max(1, n - 1);
  const wMax = Math.max(...res.weights);

  const unitOf = (j: number) => criteria[j].unit?.trim() || '';
  const fnInfo = (j: number) => PROMETHEE_FN_INFO[res.fn[j]];
  const anyCustom = res.prefs.some((x) => x.custom);
  const allIssues = res.prefs.flatMap((x, j) => x.issues.map((t) => `${labels[j]}: ${t}`));
  const critRows: CalcCell[][] = criteria.map((_, j) => [
    `${fnInfo(j).type} · ${fnInfo(j).label}`, fnInfo(j).q ? fmtVal(res.q[j]) : '—', fnInfo(j).p ? fmtVal(res.p[j]) : '—', fnInfo(j).s ? fmtVal(res.s[j]) : '—',
    types[j] === 'min' ? 'Costo: d = x_b − x_a' : 'Beneficio: d = x_a − x_b',
    unitOf(j) || '—',
  ]);
  const observed = (j: number) => {
    const ds: number[] = [];
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) if (i !== k) ds.push(res.g[i][j] - res.g[k][j]);
    return ds;
  };

  const pairTable = (d: PreferenceDetail) => (
    <CalcMatrix
      mode={mode} corner="Criterio" caption={`Preferencia agregada de ${names[d.a]} sobre ${names[d.b]}, criterio por criterio`}
      rows={labels} rowHint={types.map((t) => (t === 'min' ? 'costo: d = x_b − x_a' : 'beneficio: d = x_a − x_b'))}
      cols={['Peso w_j', names[d.a], names[d.b], 'd = ventaja de a sobre b', 'Umbral p_j', 'P(d) con la función del criterio', 'Aporta w × P']}
      cells={d.rows.map((r) => [n4(r.w), fmtVal(r.xa), fmtVal(r.xb), r.d > 0 ? fmtVal(r.d) : `${fmtVal(r.d).replace('-', '−')} (no gana ${names[d.a]})`, PROMETHEE_FN_INFO[r.fn].p ? fmtVal(r.p) : '—', n4(r.P), n4(r.contrib)])}
      hl={(i, j) => (j === 6 && d.rows[i].contrib > 0 ? 'good' : undefined)}
      footer={[{ label: `π(${names[d.a]}, ${names[d.b]})`, hint: 'suma de aportes', cells: [n4(d.rows.reduce((s, r) => s + r.w, 0)), '', '', '', '', '', n4(d.pi)] }]}
      wide
    />
  );
  const pairWorked = (d: PreferenceDetail, r: PreferenceDetail) => {
    const eq = (x: PreferenceDetail) => `π(${names[x.a]}, ${names[x.b]}) = ${x.rows.map((c) => `${n4(c.w)} × ${c.P.toFixed(4)}`).join(' + ')} = ${n4(x.pi)}\n`;
    return eq(d) + eq(r)
      + `Comprobación: π(${names[d.a]}, ${names[d.b]}) + π(${names[d.b]}, ${names[d.a]}) = ${n4(d.pi)} + ${n4(r.pi)} = ${n4(d.pi + r.pi)}. No suma 1 (salvo casualidad): PROMETHEE mide grados, no un sí o un no.`;
  };

  const pairBlock = () => {
    if (mode === 'screen') {
      return (
        <>
          <p className="calc-meaning"><b>Elige un par: </b>el desglose se recalcula con las alternativas que escojas (a es la que se prefiere, b la comparada). Por defecto, el par con mayor preferencia.</p>
          <PairPicker names={names} a={pa} b={pb} onChange={(x, y) => setPair([x, y])} labelA="a (la preferida)" labelB="b (la comparada)" />
          {pairTable(sel)}
          <Worked>{pairWorked(sel, rev)}</Worked>
        </>
      );
    }
    // informe: el par ilustrativo desglosado + la matriz π completa (siguiente paso) contiene todos los demás
    return (
      <>
        {pairTable(sel)}
        <Worked>{pairWorked(sel, rev)}</Worked>
        {n > 2 && <Note>se desglosa el par con mayor preferencia; los {n * (n - 1)} valores de π están completos en el paso siguiente y salen todos del mismo cálculo.</Note>}
      </>
    );
  };

  const piCells: CalcCell[][] = names.map((_, i) => [...names.map((__, k) => (i === k ? '—' : n4(res.pi[i][k]))), n4(res.phiPlus[i])]);

  const relText = (i: number, k: number): string => {
    const r = p1.rel[i][k];
    return r === 'precedes' ? '▲ precede' : r === 'preceded' ? '▼ es precedida' : r === 'indifferent' ? '= indiferentes' : r === 'incomparable' ? '? incomparables' : '—';
  };

  return (
    <CalcSection
      id="desglose-metodo"
      summary={order.filter((i) => rank[i] === 1).length === 1 ? `Gana ${names[order[0]]} · flujo neto φ = ${(res.phi[order[0]] >= 0 ? '+' : '') + res.phi[order[0]].toFixed(4)} · pasos: preferencias → matriz π → φ⁺, φ⁻, φ` : 'Empate en el 1.er lugar: los datos no distinguen entre las alternativas'}
      title="Cálculo de PROMETHEE, paso a paso"
      accent="var(--m-promethee)" mode={mode}
      intro="PROMETHEE no solo dice si A supera a B: mide QUÉ TANTO se prefiere A sobre B, con un número entre 0 y 1 por criterio. A diferencia de ELECTRE sí es compensatorio: un criterio muy favorable puede compensar uno desfavorable. Todo lo de abajo sale de tu matriz de decisión y de los pesos de tus criterios."
    >
      <CalcStep no={1} title="Matriz de decisión, tipo de cada criterio, pesos y rangos" mode={mode} defaultOpen
        meaning="Los datos de partida. El tipo (beneficio o costo) fija en qué dirección se mide la ventaja; el peso dice cuánto pesa cada criterio; el rango (máximo − mínimo) es la referencia de los umbrales por defecto de la función de preferencia del paso 2."
        formula={'rango_j = máx_i x_ij − mín_i x_ij        (si es 0 se usa 1)\nvalor por defecto de p_j (Tipo III) = rango_j'}>
        <InputsTable mode={mode} names={names} critLabels={labels} matrix={matrix} types={types} weights={res.weights} ranges={res.range} rangeName="Rango (máx − mín)" rangeMeaning="referencia de los umbrales por defecto" />
        <Reading>cada fila es una alternativa y cada columna un criterio; bajo el nombre del criterio están su tipo (↑ beneficio, ↓ costo) y su peso w. En negrita, el mejor valor de cada criterio.</Reading>
        <Reading title="Qué dice tu caso">
          tienes {n} alternativas ({listNames(names)}) en {m} criterios; el de más peso es «{labels[res.weights.indexOf(wMax)]}» ({n4(wMax)}).
          {types.some((t) => t === 'min') ? ` Son de costo: ${listNames(labels.filter((_, j) => types[j] === 'min'))}.` : ''}
        </Reading>
      </CalcStep>

      <CalcStep no={2} title="Función de preferencia por criterio: de la diferencia d a un grado de preferencia P" mode={mode}
        meaning="Cada criterio necesita una regla que convierta «A le gana a B por esta cantidad» en «qué tanto prefiero A sobre B», un número P entre 0 y 1. Si A no es mejor que B, P = 0 sin importar qué tan mal le vaya. Si es mejor, P crece con la ventaja según la función elegida (Brans y Vincke, 1985), y nunca pasa de 1."
        formula={[...new Set(res.fn)].map((f) => `Tipo ${PROMETHEE_FN_INFO[f].type} · ${PROMETHEE_FN_INFO[f].label}:  ${PROMETHEE_FN_INFO[f].formula}`).join('\n') + '\nd = ventaja de a sobre b:  beneficio x_aj − x_bj,  costo x_bj − x_aj'}>
        <dl className="ob-legend">
          <dt>P_j(a, b)</dt><dd>grado de preferencia de a sobre b en el criterio j, entre 0 y 1</dd>
          <dt>d</dt><dd>la ventaja de a sobre b en ese criterio (positiva solo si a es mejor)</dd>
          <dt>q_j</dt><dd>umbral de indiferencia: ventajas hasta q no cuentan (en las funciones que lo usan; 0 si no)</dd>
          <dt>p_j</dt><dd>umbral de preferencia: desde p la preferencia es total; por defecto, el rango del criterio</dd>
          <dt>σ_j</dt><dd>escala de la función gaussiana (solo en ese tipo)</dd>
        </dl>
        <CalcMatrix
          mode={mode} corner="Criterio" caption="Función de preferencia usada en cada criterio"
          rows={labels} cols={['Función', 'q (indiferencia)', 'p (preferencia)', 'σ (gaussiana)', 'Dirección de d', 'Unidad']}
          cells={critRows} wide
        />
        <Note title={anyCustom ? 'Funciones elegidas' : 'Valor por defecto del curso'}>
          {anyCustom
            ? `la función y los umbrales se eligieron por criterio (${res.prefs.map((x, j) => `${labels[j]}: ${describePref(x, fmtVal)}`).join('; ')}). No salen de los datos: los fija quien decide y con otros valores el ranking puede cambiar; revisa la sensibilidad.`
            : 'ningún criterio tiene función propia: se usa el Tipo III (lineal, «V») con q = 0 y p = rango del criterio, la misma convención del notebook de referencia (P = rangos). En la práctica p, q y σ se negocian con quien decide; puedes elegir cualquiera de las seis funciones (usual, en U, en V, por niveles, lineal con indiferencia y gaussiana; Brans y Vincke, 1985) en el panel «Funciones de preferencia».'}
        </Note>
        {allIssues.length > 0 && <Note title="Umbrales corregidos">{allIssues.join('; ')}.</Note>}
        <div className="ob-curves" role="group" aria-label="Curvas de la función de preferencia de cada criterio">
          {criteria.map((_, j) => <PreferenceCurve key={j} title={labels[j]} unit={unitOf(j)} fn={res.fn[j]} q={res.q[j]} p={res.p[j]} s={res.s[j]} range={res.range[j]} d={observed(j)} type={types[j]} />)}
        </div>
        <p className="ob-cap"><b>Cómo leer las curvas: </b>la línea es P(d); cada círculo es una diferencia d real entre dos de tus alternativas (lleno = a es preferida, P &gt; 0; hueco = P = 0 porque a no es mejor). El eje horizontal va de −rango a rango; a la derecha de 0 la preferencia sube según la función hasta 1. Las marcas q y p señalan los umbrales.</p>
        <Reading title="Qué dice tu caso">
          {(() => {
            const j = 0;
            const others = observed(j).filter((v) => v > 0);
            return others.length ? `por ejemplo, en «${labels[j]}» (${describePref(res.prefs[j], fmtVal)}) una ventaja de ${fmtVal(Math.max(...others))} equivale a P = ${prefFn(res.fn[j], Math.max(...others), res.q[j], res.p[j], res.s[j]).toFixed(2)}.` : `en «${labels[j]}» ninguna alternativa le gana a otra.`;
          })()}
        </Reading>
      </CalcStep>

      <CalcStep no={3} title="Preferencia agregada π(a, b): un par completo, criterio por criterio" mode={mode}
        meaning="Se aplica P a cada criterio, se multiplica por su peso y se suma. Ningún criterio se descarta ni tiene veto: todos aportan, ponderados. Por eso PROMETHEE compensa."
        formula={'π(a, b) = Σ_j w_j × P_j(a, b)'}>
        {pairBlock()}
        <Reading>cada fila es un criterio: d es la ventaja de a sobre b, P la convierte a un grado entre 0 y 1 y «Aporta» es peso × P. La suma del pie es π(a, b), entre 0 y 1. Un criterio donde a no gana aporta 0, pero no anula a los demás.</Reading>
        <Reading title="Qué dice tu caso">
          {`π(${names[sel.a]}, ${names[sel.b]}) = ${n4(sel.pi)}: ${sel.rows.some((r) => r.contrib > 0) ? 'aportan ' + listNames(sel.rows.filter((r) => r.contrib > 0).map((r) => `${labels[r.j]} (${n4(r.contrib)})`)) : 'ningún criterio le da ventaja a ' + names[sel.a]}. `}
          {`En sentido contrario, π(${names[rev.a]}, ${names[rev.b]}) = ${n4(rev.pi)}. `}
          {sel.pi > rev.pi + TIE ? `${names[sel.a]} se prefiere más que ${names[sel.b]}.` : sel.pi < rev.pi - TIE ? `${names[sel.b]} se prefiere más que ${names[sel.a]}.` : 'Se prefieren por igual.'}
        </Reading>
      </CalcStep>

      <CalcStep no={4} title="Matriz de preferencia π completa" mode={mode}
        meaning="El mismo cálculo del paso anterior para todos los pares ordenados. Fila = a, columna = b: π(fila, columna). La diagonal no se calcula (nadie se compara consigo misma). La última columna es el promedio de cada fila: φ⁺."
        formula={'π[a, b] = Σ_j w_j × P_j(a, b)        φ⁺(a) = promedio de la fila a (÷ n − 1)'}>
        <CalcMatrix
          mode={mode} corner="π (fila → columna)" caption="Matriz de preferencia agregada π, con el promedio de cada fila (φ⁺) y de cada columna (φ⁻)"
          rows={names} cols={[...names, 'φ⁺ (media de la fila)']}
          cells={piCells}
          hl={(i, j) => (j < n && i !== j && res.pi[i][j] === Math.max(...res.pi[i].filter((_, k) => k !== i)) ? 'key' : undefined)}
          footer={[{ label: 'φ⁻ (media de la columna)', hint: `÷ ${denom}`, cells: [...res.phiMinus.map(n4), ''] }]}
          wide
        />
        <Reading>en negrita, el valor más alto de cada fila: contra quién la alternativa de esa fila es más preferida. Cada celda es un número continuo entre 0 y 1; π(a, b) + π(b, a) NO suma 1, porque PROMETHEE mide grados y no un sí o un no.</Reading>
        <Reading title="Qué dice tu caso">
          {(() => {
            let bi = 0, bk = 1, v = -1;
            for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) if (i !== k && res.pi[i][k] > v) { v = res.pi[i][k]; bi = i; bk = k; }
            return `la preferencia más fuerte de tu matriz es π(${names[bi]}, ${names[bk]}) = ${n4(v)}.`;
          })()}
        </Reading>
      </CalcStep>

      <CalcStep no={5} title="Flujos de superación: φ⁺, φ⁻ y flujo neto φ" mode={mode}
        meaning="φ⁺ dice qué tanto una alternativa es preferida al resto (promedio de su FILA); φ⁻ dice qué tanto el resto es preferido a ella (promedio de su COLUMNA). El flujo neto φ = φ⁺ − φ⁻ resume las dos cosas: más alto es mejor y ordena el ranking."
        formula={'φ⁺(a) = (1 ÷ (n − 1)) Σ_b π(a, b)     φ⁻(a) = (1 ÷ (n − 1)) Σ_b π(b, a)     φ(a) = φ⁺(a) − φ⁻(a)'}>
        <CalcMatrix
          mode={mode} corner="Alternativa" caption="Flujos de cada alternativa"
          rows={names} cols={['φ⁺ (sale)', 'φ⁻ (entra)', 'φ = φ⁺ − φ⁻', 'Posición']}
          cells={names.map((_, i) => [n4(res.phiPlus[i]), n4(res.phiMinus[i]), sgn(res.phi[i]), `${rank[i]}º`])}
          hl={(i, j) => (rank[i] === 1 && j >= 2 ? 'good' : undefined)}
          footer={[{ label: 'Suma', hint: 'comprobación', cells: [n4(sumPlus), n4(sumMinus), n4(sumPhi) + (Math.abs(sumPhi) < 1e-9 ? ' ✓' : ' ✗'), ''] }]}
          wide
        />
        <Worked>
          {names.map((nm, i) => {
            const row = names.map((_, k) => k).filter((k) => k !== i);
            return `φ⁺(${nm}) = (${row.map((k) => n4(res.pi[i][k])).join(' + ')}) ÷ ${denom} = ${n4(res.phiPlus[i])}   ·   φ⁻(${nm}) = (${row.map((k) => n4(res.pi[k][i])).join(' + ')}) ÷ ${denom} = ${n4(res.phiMinus[i])}   ·   φ = ${n4(res.phiPlus[i])} − ${n4(res.phiMinus[i])} = ${sgn(res.phi[i])}\n`;
          }).join('')}
          {`Comprobación: Σφ = ${sumPhi.toFixed(4)} (siempre 0: lo que unas ganan otras lo pierden) y Σφ⁺ = Σφ⁻ = ${n4(sumPlus)}.`}
        </Worked>
        <Reading>φ⁺ alto = supera a las demás; φ⁻ bajo = pocas la superan; φ = φ⁺ − φ⁻ combina ambas. Los flujos netos suman 0: si no fuera así, habría un error en el cálculo.</Reading>
        <Reading title="Qué dice tu caso">
          {`${names[order[0]]} tiene el mejor flujo neto (${sgn(res.phi[order[0]])}): φ⁺ = ${n4(res.phiPlus[order[0]])} y φ⁻ = ${n4(res.phiMinus[order[0]])}.`}
          {(() => {
            const maxP = res.phiPlus.indexOf(Math.max(...res.phiPlus)), minM = res.phiMinus.indexOf(Math.min(...res.phiMinus));
            return maxP === order[0] && minM === order[0] ? ' Además tiene el mayor φ⁺ y el menor φ⁻ a la vez: un dominio claro.' : ` El mayor φ⁺ es de ${names[maxP]} y el menor φ⁻ de ${names[minM]}: los dos flujos no apuntan a la misma alternativa.`;
          })()}
        </Reading>
      </CalcStep>

      <CalcStep no={6} title="Ranking PROMETHEE II" mode={mode}
        meaning="PROMETHEE II ordena por el flujo neto φ. Siempre da un ranking completo: nunca dos alternativas quedan sin comparar (salvo un empate exacto)."
        formula={'a va antes que b   ⇔   φ(a) > φ(b)'}>
        <PrometheeFlows
          rows={names.map((nm, i) => ({ name: nm, plus: res.phiPlus[i], minus: res.phiMinus[i], net: res.phi[i], rank: rank[i] }))}
          showTable={false}
        />
        <Reading>la barra derecha es φ⁺, la izquierda φ⁻ y el rombo el flujo neto φ; la posición 1 es la de mayor φ. Todos los valores están escritos en el gráfico y en la tabla del paso 5.</Reading>
        <Reading title="Qué dice tu caso">
          {`el orden es ${order.map((i) => `${rank[i]}º ${names[i]} (${sgn(res.phi[i])})`).join(', ')}.`}
          {order.length > 1 && res.phi[order[0]] - res.phi[order[1]] < 0.05 ? ` La diferencia entre el 1º y el 2º es solo ${(res.phi[order[0]] - res.phi[order[1]]).toFixed(4)}: revisa la sensibilidad a los pesos antes de concluir.` : ''}
        </Reading>
      </CalcStep>

      <CalcStep no={7} title="PROMETHEE I: ranking parcial con los dos flujos por separado" mode={mode}
        meaning="PROMETHEE I no combina φ⁺ y φ⁻ en un solo número. A precede a B solo si A es mejor o igual en los dos flujos a la vez (φ⁺ mayor o igual y φ⁻ menor o igual), con al menos una desigualdad estricta. Si un flujo favorece a A y el otro a B, quedan incomparables, parecido en espíritu a ELECTRE. Si los dos flujos son iguales, son indiferentes."
        formula={'A precede a B  ⇔  φ⁺(A) ≥ φ⁺(B)  y  φ⁻(A) ≤ φ⁻(B)  (al menos una estricta)\nincomparables  ⇔  un flujo favorece a A y el otro a B'}>
        <CalcMatrix
          mode={mode} corner="Fila respecto de columna" caption="Relación de PROMETHEE I entre cada par de alternativas"
          rows={names} cols={names}
          rowHint={names.map((_, i) => `φ⁺ ${n4(res.phiPlus[i])} · φ⁻ ${n4(res.phiMinus[i])}`)}
          cells={names.map((_, i) => names.map((__, k) => relText(i, k)))}
          hl={(i, k) => (p1.rel[i][k] === 'precedes' ? 'good' : p1.rel[i][k] === 'incomparable' ? 'bad' : undefined)}
          wide
        />
        <Reading>▲ = la alternativa de la fila precede a la de la columna; ▼ = es precedida; = indiferentes (mismos flujos); ? = incomparables (un flujo dice una cosa y el otro la contraria). La tabla es simétrica en sentido inverso: si A precede a B, B «es precedida» por A.</Reading>
        <Reading title="Qué dice tu caso">
          {p1.incomparable.length === 0
            ? `PROMETHEE I da un ranking completo: en todos los pares, la alternativa con mayor φ⁺ también tiene menor φ⁻ (o son indiferentes)${p1.indifferent.length ? ` — ${p1.indifferent.length} par${p1.indifferent.length === 1 ? '' : 'es'} con flujos idénticos` : ''}. No contradice a PROMETHEE II: el ordenamiento es el mismo.`
            : `PROMETHEE I deja ${p1.incomparable.length} par${p1.incomparable.length === 1 ? '' : 'es'} sin relación: ${p1.incomparable.map(([i, k]) => `${names[i]} y ${names[k]} (${res.phiPlus[i] > res.phiPlus[k] ? `${names[i]} tiene mayor φ⁺ pero también mayor φ⁻` : `${names[k]} tiene mayor φ⁺ pero también mayor φ⁻`})`).join('; ')}. PROMETHEE II los ordena igualmente por φ, pero PROMETHEE I dice que esa diferencia depende de cómo se combinen los flujos.`}
        </Reading>
      </CalcStep>
    </CalcSection>
  );
}
