'use client';

import { useMemo } from 'react';
import type { Alternative, Criterion, DecisionMatrix, Method } from '@/lib/types';
import {
  analyzeSensitivity, buildRankFn, describeElectreSensitivity, describeSensitivity, electreThresholdSensitivity, vikorVSensitivity,
  type AhpLocalRow, type Scenario, type SensitivityVerdict,
} from '@/lib/sensitivity';
import { electreCStar, electreDStar } from '@/lib/electre';
import { vikorV } from '@/lib/vikor';
import { CalcSection, CalcStep, Reading, num, type CalcMode } from './CalcKit';
import TextTable, { type TextCell, type TextRow } from './TextTable';

/** Análisis de sensibilidad FIJO (imprimible) para Resultados (`mode="screen"`, pasos desplegables) y para el Informe ejecutivo
 * (`mode="report"`, todo abierto). Es la versión reproducible del simulador «what-if»: pesos iguales, cada criterio ±X %, peso crítico
 * (punto de quiebre) y, según el método, v de VIKOR o c* y d* de ELECTRE. Los números salen de las mismas funciones de método que la pantalla.
 *
 * ELECTRE no da ranking: para él NO se muestran escenarios de ranking, solo la sensibilidad a c* y d* (relaciones, incomparables, núcleo). */
export type SensitivityReportProps = {
  mode: CalcMode;
  method: Method;
  criteria: Criterion[];
  alternatives: Alternative[];
  /** Matriz de decisión (cruda o efectiva: los criterios «objetivo» se convierten adentro, es idempotente). Los métodos sin matriz (AHP) pueden pasar la del proyecto o vacía. */
  dm: DecisionMatrix;
  /** Pesos de criterio BASE, en el orden de `criteria` (los mismos que usa el resultado mostrado). */
  weights: number[];
  /** Solo AHP: `syn.rows` con `loc` (prioridades locales por criterio) para recalcular la síntesis con otros pesos. */
  ahpRows?: AhpLocalRow[];
  /** Variación relativa de los escenarios ±X. Default 0.2. */
  delta?: number;
  /** Pesos alternos definidos por quien decide (p. ej. otro panel). Opcional: sin él no se muestra el bloque. Nunca se inventan pesos de expertos. */
  userWeights?: { label: string; weights: number[] }[];
  /** Color de familia del método (p. ej. 'var(--m-topsis)'). */
  accent?: string;
};

const SCORE_LABEL: Partial<Record<Method, string>> = {
  ahp: 'prioridad global', topsis: 'cercanía C', saw: 'puntaje SAW', vikor: 'Q (menor es mejor)', promethee: 'flujo neto φ', fuzzy_topsis: 'coef. CC',
};
const BADGE: Record<SensitivityVerdict, string> = { robust: '✔ Robusta', moderate: '◐ Firme con reservas', sensitive: '▲ Sensible a los pesos', none: '— Sin veredicto' };
const SCOPE_NOTE = 'Alcance: este análisis mueve los pesos (y los parámetros del método), no los datos de la matriz ni los juicios de cada experto por separado.';

const f3 = (x: number) => x.toFixed(3);
const winnersText = (w: string[]) => (w.length === 1 ? w[0] : w.length ? 'Empate: ' + w.join(' / ') : '—');

export default function SensitivityReport({ mode, method, criteria, alternatives, dm, weights, ahpRows, delta = 0.2, userWeights, accent }: SensitivityReportProps) {
  const names = useMemo(() => criteria.map((c) => c.name), [criteria]);
  const isElectre = method === 'electre';
  const rankFn = useMemo(() => (isElectre ? null : buildRankFn(method, { criteria, alternatives, dm, ahpRows })), [isElectre, method, criteria, alternatives, dm, ahpRows]);
  const res = useMemo(() => (rankFn && criteria.length && alternatives.length > 1 ? analyzeSensitivity(rankFn, names, weights, { delta, userWeights }) : null), [rankFn, names, weights, delta, userWeights, criteria.length, alternatives.length]);
  const text = useMemo(() => (res ? describeSensitivity(res) : null), [res]);
  const vikorRows = useMemo(() => (method === 'vikor' && alternatives.length > 1 ? vikorVSensitivity(criteria, alternatives, dm, weights, vikorV(dm)) : null), [method, criteria, alternatives, dm, weights]);
  const electreRows = useMemo(
    () => (isElectre && alternatives.length > 1 && criteria.length ? electreThresholdSensitivity(criteria, alternatives, dm, weights, electreCStar(dm), electreDStar(dm)) : null),
    [isElectre, criteria, alternatives, dm, weights],
  );
  const electreText = useMemo(() => (electreRows ? describeElectreSensitivity(electreRows) : null), [electreRows]);
  const pctTxt = `${Math.round(delta * 100)} %`;
  const TITLE = 'Sensibilidad: ¿qué tan firme es el resultado?';

  if (!criteria.length || alternatives.length < 2) {
    return <CalcSection title={TITLE} accent={accent} mode={mode}><p className="sens-note">Hacen falta al menos 2 alternativas y 1 criterio para analizar la sensibilidad.</p></CalcSection>;
  }

  // ---------------------------------------------------------------- ELECTRE: umbrales, no ranking
  if (isElectre) {
    return (
      <CalcSection title={TITLE} mode={mode} accent={accent}
        intro="ELECTRE no ordena las alternativas, así que no tiene sentido decir «quién gana con otros pesos». Lo que sí se puede probar es cuánto cambian las relaciones de superación, los pares incomparables y el núcleo si se mueven los umbrales c* y d* (que los elige quien decide, no salen de los datos).">
        {electreRows && electreText && (
          <>
            <div className="sens-case">
              <p className="sens-case-h">Qué dice tu caso</p>
              <p className="sens-case-lead">{electreText.headline}</p>
              <ul>{electreText.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </div>
            <CalcStep no={1} title="Otras combinaciones de c* y d*" mode={mode} defaultOpen
              meaning="Se repite el cálculo de ELECTRE con umbrales más y menos exigentes, con los mismos datos y pesos. Cada fila cuenta cuántas relaciones «A supera a B» aparecen y cuántos pares quedan incomparables (ninguna supera a la otra).">
              <TextTable mode={mode} caption="ELECTRE con distintos umbrales c* y d*" corner="Combinación"
                cols={['c* (concordancia mín.)', 'd* (discordancia máx.)', 'Relaciones de superación', 'Pares incomparables', 'Núcleo (ganador)']}
                rows={electreRows.map((r): TextRow => ({
                  head: r.label,
                  cells: [
                    { t: r.cStar.toFixed(2), n: true }, { t: r.dStar.toFixed(2), n: true },
                    { t: String(r.relations), n: true }, { t: `${r.incomparable} de ${r.pairs}`, n: true },
                    r.kernelWinner ? { t: `Única del núcleo: ${r.kernelWinner}`, hl: 'good' } : `Sin ganador único (núcleo: ${r.kernelMembers.join(', ') || '—'})`,
                  ],
                }))} />
              <Reading>c* más alto o d* más bajo = ELECTRE más exigente: aparecen menos relaciones y más pares incomparables. Si el núcleo tiene un solo elemento, esa alternativa no es superada por ninguna y supera (directa o por cadena) a las demás; si no, ELECTRE no señala ganador. Si la conclusión cambia entre filas, depende de los umbrales y así debe reportarse.</Reading>
            </CalcStep>
          </>
        )}
        <p className="sens-note">{SCOPE_NOTE} Sensibilidad a los pesos con ELECTRE: cambia los pesos en el simulador y observa las relaciones; aquí no se le asigna un ranking.</p>
      </CalcSection>
    );
  }

  if (!rankFn || !res || !text) {
    return (
      <CalcSection title={TITLE} accent={accent} mode={mode}>
        <p className="sens-note">No hay datos suficientes para recalcular el resultado con otros pesos{method === 'ahp' ? ' (faltan las prioridades locales de las alternativas)' : ''}.</p>
      </CalcSection>
    );
  }

  // ---------------------------------------------------------------- Métodos con ranking
  const scoreLabel = SCORE_LABEL[method] ?? 'puntaje';
  const changedTxt = (s: Scenario) => (s.sameWinner ? 'No' : `Sí: pasa a ganar ${winnersText(s.winners)}`);
  const scenarioRow = (s: Scenario): TextRow => ({
    head: s.label,
    cells: [
      ...s.weights.map((w, j): TextCell => ({ t: num(w, 3), n: true, hl: s.criterion === j ? 'key' : undefined, title: s.criterion === j ? 'Criterio que se movió en este escenario' : undefined })),
      { t: winnersText(s.winners), hl: s.kind === 'base' ? 'good' : undefined },
      { t: num(s.winnerScore, 4), n: true },
      s.kind === 'base' ? '— (referencia)' : { t: changedTxt(s), hl: s.sameWinner ? undefined : 'bad' },
    ],
  });
  const critCell = (dir: 'down' | 'up', c: (typeof res.critical)[number]): TextCell => {
    const fl = c[dir];
    if (!fl) return dir === 'down' ? `No cambia (el ganador se mantiene con cualquier peso entre 0 y ${f3(c.baseWeight)})` : `No cambia (el ganador se mantiene con cualquier peso entre ${f3(c.baseWeight)} y 1)`;
    return { t: `${dir === 'down' ? 'Por debajo de' : 'Por encima de'} ${f3(fl.weight)}: gana ${winnersText(fl.newWinners)}`, hl: 'bad' };
  };
  const rankPos = (s: Scenario, name: string) => s.rows.find((r) => r.name === name)?.rank ?? 0;
  const base = res.scenarios[0];

  return (
    <CalcSection title={TITLE} mode={mode} accent={accent}
      intro={`Se repite el cálculo del método con otros pesos de criterio (mismos datos), para ver si el ganador se sostiene. Cuando un peso se mueve, los demás se reescalan proporcionalmente para seguir sumando 1. Variación de los escenarios: ±${pctTxt} del peso de cada criterio.`}>
      <div className="sens-case">
        <p className="sens-case-h">Qué dice tu caso</p>
        <p className="sens-case-lead"><span className="sens-badge">{BADGE[text.verdict]}</span>{text.headline}</p>
        {text.points.length > 0 && <ul>{text.points.map((p, i) => <li key={i}>{p}</li>)}</ul>}
      </div>

      <CalcStep no={1} title="Escenarios de pesos y ganador de cada uno" mode={mode} defaultOpen
        meaning={`Cada fila es una «versión alternativa» de las prioridades: pesos base, pesos todos iguales (1/${criteria.length}) y, para cada criterio, su peso subido y bajado ${pctTxt}. La columna «Ganador» dice quién queda 1.º en esa versión.`}>
        <TextTable mode={mode} wide caption={`Ganador con cada escenario de pesos (${criteria.length} criterios)`} corner="Escenario"
          cols={[...names.map((n) => `Peso: ${n}`), 'Ganador', `Puntaje (${scoreLabel})`, '¿Cambia el ganador?']}
          rows={res.scenarios.map(scenarioRow)} />
        <Reading>en negrita queda el peso del criterio que se movió. Busca las filas con «Sí»: son los cambios de prioridad que sí darían la vuelta al resultado. Si todas dicen «No», el ganador aguanta estos cambios. Los pesos de cada fila suman 1.</Reading>
      </CalcStep>

      <CalcStep no={2} title="Cómo se mueve todo el ranking" mode={mode}
        meaning="No solo importa el 1.º: aquí se ve la posición de cada alternativa en cada escenario, y si subió (▲) o bajó (▼) respecto al escenario base.">
        <TextTable mode={mode} wide caption="Posición de cada alternativa por escenario (1 = mejor)" corner="Alternativa"
          cols={res.scenarios.map((s) => s.label)}
          rows={alternatives.map((a): TextRow => ({
            head: a.name,
            cells: res.scenarios.map((s): TextCell => {
              const r = rankPos(s, a.name), b = rankPos(base, a.name);
              const mark = s.kind === 'base' || r === b ? '' : r < b ? ` ▲${b - r}` : ` ▼${r - b}`;
              return { t: `#${r}${mark}`, n: true, hl: r === 1 ? 'good' : undefined, title: r === 1 ? 'En 1.er lugar' : undefined };
            }),
          }))} />
        <Reading>una alternativa que casi no cambia de posición es estable; una que sube o baja varios puestos depende mucho de cómo se ponderen los criterios.</Reading>
      </CalcStep>

      <CalcStep no={3} title="Peso crítico: ¿en qué valor cambia el ganador?" mode={mode}
        meaning="Para cada criterio se sube y se baja su peso (de 0 a 1, reescalando los demás) hasta encontrar el punto de quiebre: el valor exacto donde otra alternativa pasa al 1.º. Cuanto más lejos del peso base, más robusto.">
        <TextTable mode={mode} wide caption="Punto de quiebre del ganador por criterio" corner="Criterio"
          cols={['Peso base', 'Si el peso BAJA', 'Si el peso SUBE']}
          rows={res.critical.map((c): TextRow => ({ head: c.name, cells: [{ t: f3(c.baseWeight), n: true }, critCell('down', c), critCell('up', c)] }))} />
        <Reading>«No cambia» significa que aunque ese criterio valiera casi nada (o casi todo), el ganador sería el mismo. Un punto de quiebre cercano al peso base (por ejemplo a menos de 0.05) avisa que el resultado depende de un juicio fino: conviene validar ese peso con los expertos.</Reading>
      </CalcStep>

      {method === 'vikor' && vikorRows && (
        <CalcStep no={4} title="Parámetro v de VIKOR" mode={mode}
          meaning="v pondera «lo mejor para el grupo» (S) frente a «no dejar a nadie muy mal en un criterio» (R). No sale de los datos: se prueba con 0.25, 0.5 y 0.75 (y el valor usado).">
          <TextTable mode={mode} caption="VIKOR con distintos valores de v" corner="v"
            cols={['Mejor por Q', 'Condiciones de Opricovic & Tzeng', '¿Cambia respecto al v usado?']}
            rows={vikorRows.map((r): TextRow => ({
              head: r.v.toFixed(2),
              cells: [
                winnersText(r.winners),
                r.kind === 'unique' ? 'Ganador único (cumple C1 y C2)' : r.kind ? `Conjunto de compromiso: ${r.compromise.join(', ')}` : '—',
                r.sameAsBase ? 'No' : { t: 'Sí', hl: 'bad' },
              ],
            }))} />
          <Reading>si el mejor por Q es el mismo con los tres v, la elección de v no afecta. Si el resultado pasa a «conjunto de compromiso», VIKOR ya no declara un único ganador con ese v.</Reading>
        </CalcStep>
      )}

      {res.userScenarios.length > 0 && (
        <CalcStep no={method === 'vikor' && vikorRows ? 5 : 4} title="Pesos alternos definidos por el usuario" mode={mode}
          meaning="Escenarios de pesos que introdujo quien toma la decisión (por ejemplo otro panel de expertos). No los inventa la plataforma y no cuentan en el «X de N escenarios» de arriba.">
          <TextTable mode={mode} wide caption="Ganador con los pesos alternos" corner="Escenario"
            cols={[...names.map((n) => `Peso: ${n}`), 'Ganador', `Puntaje (${scoreLabel})`, '¿Cambia el ganador?']}
            rows={res.userScenarios.map(scenarioRow)} />
        </CalcStep>
      )}

      {method === 'promethee' && (
        <p className="sens-note">PROMETHEE: la plataforma usa solo la función de preferencia Tipo III (lineal) con q = 0 y p = rango de cada criterio; no se probó otra función de preferencia.</p>
      )}
      <p className="sens-note">{SCOPE_NOTE}</p>
    </CalcSection>
  );
}
