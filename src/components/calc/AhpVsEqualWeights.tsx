import { equalWeightsSynthesis } from '@/lib/ahp';
import { CalcMatrix, CalcSection, CalcStep, Reading, Worked, num, type CalcMode } from './CalcKit';

/** «¿Da lo mismo comparar de a pares que asignar el peso a ojo?» (diapositivas 36 y 45 de la Sesión 2): los pesos que salen de los juicios
 * de los expertos frente a darle 1/n a cada criterio, y el ranking que produce cada uno con las MISMAS prioridades locales. Solo AHP
 * (necesita las prioridades locales por criterio). No calcula nada nuevo: pesos y prioridades locales llegan ya calculados. */
type Props = {
  mode: CalcMode;
  /** Nombres de los criterios, en el orden de `weights` y de las columnas de `local`. */
  criteria: string[];
  /** Pesos AHP de los criterios (suman 1): `Synth.wr` o `sheetResult(CRIT_SHEET…).agg.w`. */
  weights: number[];
  /** Nombres de las alternativas, en el orden de las filas de `local`. */
  alternatives: string[];
  /** Prioridad local de cada alternativa (fila) bajo cada criterio (columna): `Synth.rows[i].loc`. */
  local: number[][];
  /** Prioridad global AHP de cada alternativa (`Synth.rows[i].g`). Si falta se calcula como Σ peso × local. */
  scores?: number[];
};

const pct = (x: number, d = 1) => (x * 100).toFixed(d) + ' %';
const rankOf = (s: number[]) => s.map((x) => 1 + s.filter((o) => o > x + 1e-9).length);

export default function AhpVsEqualWeights({ mode, criteria, weights, alternatives, local, scores }: Props) {
  const nC = criteria.length, nA = alternatives.length;
  if (nC < 2 || nA < 2 || weights.length !== nC || local.length !== nA) return null;

  const eq = 1 / nC;
  const ahp = scores && scores.length === nA ? scores : local.map((r) => r.reduce((a, x, c) => a + (weights[c] ?? 0) * x, 0));
  const ahpRank = rankOf(ahp);
  const equal = equalWeightsSynthesis(local);
  const diffs = weights.map((w) => w - eq);
  const same = ahpRank.every((r, i) => r === equal.rank[i]);

  // Frases «Qué dice tu caso», con los números reales.
  const iUp = diffs.indexOf(Math.max(...diffs)), iDown = diffs.indexOf(Math.min(...diffs));
  const maxAbs = Math.max(...diffs.map(Math.abs));
  const weightsSentence = maxAbs < 0.01
    ? `Los pesos que salen de los juicios (${weights.map((w) => pct(w)).join(', ')}) casi coinciden con el reparto parejo de ${pct(eq)}: aquí comparar de a pares casi no cambia los pesos.`
    : `Comparar de a pares mueve los pesos: «${criteria[iUp]}» sube de ${pct(eq)} (reparto parejo) a ${pct(weights[iUp])}` +
      (diffs[iDown] < -0.005 ? ` y «${criteria[iDown]}» baja a ${pct(weights[iDown])}` : '') +
      '. Un reparto a ojo no recogería que los expertos no consideran igual de importantes a los criterios.';
  const bestA = ahpRank.indexOf(1), bestE = equal.rank.indexOf(1);
  const rankSentence = same
    ? `El ranking no cambia: con los pesos de los expertos y con pesos iguales el orden es el mismo (1.º: «${alternatives[bestA]}»). La elección no depende de cuánto se pondere cada criterio, lo que hace la recomendación más robusta.`
    : bestA === bestE
      ? `«${alternatives[bestA]}» gana con ambos pesos, pero el orden de las demás cambia: los pesos de los expertos sí importan para las posiciones intermedias.`
      : `La ganadora cambia: con los pesos de los expertos gana «${alternatives[bestA]}» (${num(ahp[bestA], 4)}); con pesos iguales, «${alternatives[bestE]}» (${num(equal.score[bestE], 4)}). La decisión depende de cuánto pese cada criterio, y por eso vale la pena haberlos comparado de a pares.`;

  const order = ahp.map((_, i) => i).sort((a, b) => ahpRank[a] - ahpRank[b] || a - b);
  const move = (i: number) => {
    const d = ahpRank[i] - equal.rank[i]; // >0: con pesos iguales queda mejor que con AHP
    return d === 0 ? '= igual' : d > 0 ? `▼ con AHP baja ${d}` : `▲ con AHP sube ${-d}`;
  };
  const maxW = Math.max(...weights, eq) * 1.08;

  return (
    <CalcSection title="AHP frente a pesos iguales" accent="var(--m-ahp)" mode={mode}
      summary={same ? 'El ranking no cambia con pesos iguales: la elección no depende de cuánto se pondere cada criterio' : bestA === bestE ? 'Mismo ganador con pesos iguales; cambian las posiciones intermedias' : 'Con pesos iguales cambia la alternativa ganadora'}
      intro="¿Se necesitaba comparar de a pares, o bastaba con darle el mismo peso a cada criterio? Se compara con las mismas prioridades locales de las alternativas; lo único que cambia son los pesos de los criterios.">
      <CalcStep no={1} mode={mode} defaultOpen title="Los pesos: juicios de los expertos frente a 1/n"
        meaning={`Pesos iguales significa asignar 1/n = 1/${nC} = ${pct(eq)} a cada criterio, sin comparar. Los pesos AHP salen de los juicios por pares.`}
        formula={`peso igual = 1/n = 1/${nC} = ${eq.toFixed(4)}    diferencia = peso AHP − 1/n`}>
        <CalcMatrix mode={mode} corner="Criterio" caption="Pesos por criterio" rows={criteria} cols={['Peso AHP', 'Peso igual (1/n)', 'Diferencia (puntos %)']}
          cells={criteria.map((_, i) => [num(weights[i], 4), num(eq, 4), (diffs[i] >= 0 ? '+' : '−') + Math.abs(diffs[i] * 100).toFixed(1)])}
          hl={(i, j) => (j === 2 && Math.abs(diffs[i]) === maxAbs && maxAbs >= 0.01 ? 'key' : undefined)} />
        <div className="ahp-cmp" role="group" aria-label="Gráfica de pesos AHP frente a pesos iguales">
          <div className="ahp-cmp-leg">
            <span><i className="ahp-sw ahp-sw-a" />Peso AHP (juicios de los expertos)</span>
            <span><i className="ahp-sw ahp-sw-e" />Peso igual 1/n</span>
          </div>
          {criteria.map((c, i) => (
            <div className="ahp-cmp-row" key={i}>
              <div className="ahp-cmp-nm">{i + 1}. {c}</div>
              <div className="ahp-cmp-bars">
                <div className="ahp-cmp-bar"><span className="ahp-bar ahp-bar-a" style={{ width: `${(weights[i] / maxW) * 100}%` }} /><b>AHP {pct(weights[i])}</b></div>
                <div className="ahp-cmp-bar"><span className="ahp-bar ahp-bar-e" style={{ width: `${(eq / maxW) * 100}%` }} /><b>Igual {pct(eq)}</b></div>
              </div>
            </div>
          ))}
          <div className="ahp-axis">Eje: peso del criterio (0 % a {pct(maxW / 1.08, 0)}); cada criterio muestra dos barras, la de arriba AHP y la de abajo el reparto parejo.</div>
        </div>
        <Reading title="Qué dice tu caso">{weightsSentence}</Reading>
      </CalcStep>

      <CalcStep no={2} mode={mode} defaultOpen title="El ranking: ¿cambia la decisión?"
        meaning="Se calcula la prioridad global dos veces con las mismas prioridades locales: una con los pesos AHP y otra con 1/n a cada criterio (que es simplemente el promedio de las locales de la alternativa)."
        formula={'P_i(AHP) = Σ_j w_j · L_ij        P_i(iguales) = (1/n) · Σ_j L_ij'}>
        <CalcMatrix mode={mode} corner="Alternativa" caption="Ranking con cada tipo de pesos"
          rows={order.map((i) => alternatives[i])}
          cols={['Posición AHP', 'Puntaje AHP', 'Posición pesos iguales', 'Puntaje pesos iguales', '¿Cambia?']}
          cells={order.map((i) => ['#' + ahpRank[i], num(ahp[i], 4), '#' + equal.rank[i], num(equal.score[i], 4), move(i)])}
          hl={(k, j) => (j === 4 && ahpRank[order[k]] !== equal.rank[order[k]] ? 'key' : undefined)} wide />
        <Worked title="Con tus números">
          {order.slice(0, 2).map((i) => (
            `${alternatives[i]}:  AHP = ${weights.map((w, c) => `${num(w, 3)}·${num(local[i][c], 3)}`).join(' + ')} = ${num(ahp[i], 4)}\n` +
            `   iguales = (${local[i].map((x) => num(x, 3)).join(' + ')}) / ${nC} = ${num(equal.score[i], 4)}`
          )).join('\n')}
        </Worked>
        <Reading title="Qué dice tu caso">{rankSentence}</Reading>
        <Reading>Compara las dos columnas de posición: si coinciden en todas las filas, los pesos no deciden nada; si cambian, la marca «▲/▼» de la última columna dice quién sube o baja al usar los pesos de los expertos.</Reading>
      </CalcStep>
    </CalcSection>
  );
}
