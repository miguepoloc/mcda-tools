import type { ReactNode } from 'react';
import { cols, inIndep, passes, ranked, type Cand, type PrioState } from '@/lib/prio';
import {
  cutInfo, cutSentence, funnel, funnelSentence, measurability, panelLabel, prioWarnings, scoreBreakdown, MIN_FINALISTS, NEAR_LIMIT,
} from '@/lib/prioSteps';
import { CalcMatrix, CalcSection, CalcStep, Reading, Worked, num, type CalcMode } from './CalcKit';
import PrioCutoffChart from './PrioCutoffChart';

/** «Selección de criterios» (Sesión 1, diapositivas 15-19) desglosada sin asumir nada: embudo, descartes con su razón y evidencia,
 * calificaciones con la aritmética Σ/n, corte y brecha, y la justificación de cada finalista. Funciona SOLO con los datos guardados
 * de la Parte A (`prio` = normalizePrio(project.prioritization)).
 * `mode="screen"`: cada paso es desplegable (el 1.º abierto). `mode="report"`: todo abierto, para imprimir. */
/** Acento más oscuro que --pa (el número blanco del paso necesita ≥ 4.5:1 también en modo oscuro, donde --pa es claro). */
const ACCENT = 'color-mix(in srgb, var(--pa) 78%, black)';

export default function PrioBreakdown({ prio, mode, criteriaCount }: {
  prio: PrioState;
  mode: CalcMode;
  /** Criterios que tiene el proyecto en el AHP/matriz (opcional): si no coincide con los finalistas, se avisa. */
  criteriaCount?: number;
}) {
  const A = prio;
  if (!A.cands.length) {
    return (
      <CalcSection title="Selección de criterios (Sesión 1)" mode={mode} accent={ACCENT}>
        <p className="muted">La priorización de criterios está vacía: agrega la lluvia de ideas en la pestaña «Priorización (A)» para ver aquí el proceso completo.</p>
      </CalcSection>
    );
  }

  const f = funnel(A);
  const ci = cutInfo(A);
  const byId = (id: string | null) => A.cands.find((c) => c.id === id);
  const nm = (c: Cand | undefined | null) => (c ? c.name.trim() || '(sin nombre)' : '—');
  const cutTxt = A.cutoff.toFixed(1);
  const panel = ranked(A);
  const scores = panel.map((c) => scoreBreakdown(A, c));
  const cs = cols(A);
  const warnings = prioWarnings(A, criteriaCount);
  const md = measurability(A);
  const scored = scores.filter((s) => s.mean != null);
  const maxSd = scored.filter((s) => s.sd != null).sort((a, b) => (b.sd ?? 0) - (a.sd ?? 0))[0];

  const stages = [
    { n: f.total, label: 'Lluvia de ideas', note: 'Todo lo que podría importar, sin filtrar.' },
    { n: f.afterTamiz, label: 'Tras el tamizaje', note: f.total - f.afterTamiz ? `Salen ${f.total - f.afterTamiz}: ${f.outTamiz.dropped.length} descartado${f.outTamiz.dropped.length === 1 ? '' : 's'} y ${f.outTamiz.merged.length} fusionado${f.outTamiz.merged.length === 1 ? '' : 's'} (irrelevantes o duplicados).` : 'No sale ninguno.' },
    { n: f.toPanel, label: 'Tras la independencia (entran al panel)', note: f.afterTamiz - f.toPanel ? `Salen ${f.afterTamiz - f.toPanel} por solaparse con otro eje.` : 'No sale ninguno.' },
    { n: f.finalists, label: `Finalistas (ponderación ≥ ${cutTxt})`, note: f.toPanel - f.finalists ? `Salen ${f.toPanel - f.finalists} por quedar bajo el corte${f.unrated ? ` (${f.unrated} sin calificar)` : ''}.` : 'Todos pasan el corte.' },
  ];

  return (
    <CalcSection
      title="Selección de criterios (Sesión 1): de la lluvia de ideas a los finalistas"
      intro="Seis pasos, con tus datos, para poder explicar por escrito por qué estos criterios y no otros. Cada paso dice qué significa, muestra la tabla o la cuenta y cierra con «Qué dice tu caso»."
      mode={mode}
      accent={ACCENT}
    >
      {/* 1 · Embudo */}
      <CalcStep no={1} title={`El embudo: ${f.total} → ${f.afterTamiz} → ${f.toPanel} → ${f.finalists}`} mode={mode} defaultOpen
        meaning="Se empieza con más criterios de los que se van a usar: es más fácil descartar uno de sobra que descubrir a mitad de camino que faltó uno importante. Luego se filtra en tres pasos: tamizaje, independencia y panel con corte.">
        <ol className="pbk-funnel" aria-label="Embudo de selección de criterios">
          {stages.map((s, i) => (
            <li key={i}>
              <div className="pbk-frow">
                <span className="pbk-fn mono">{s.n}</span>
                <span className="pbk-fl"><b>{s.label}</b><span>{s.note}</span></span>
              </div>
              <div className="pbk-fbar" aria-hidden="true"><span style={{ width: `${f.total ? Math.max(2, (s.n / f.total) * 100) : 0}%` }} /></div>
            </li>
          ))}
        </ol>
        <Reading>la barra de cada etapa es proporcional a los candidatos que siguen vivos. Lo que se pierde entre una etapa y la siguiente está documentado en los pasos 2, 3 y 6.</Reading>
        <Reading title="Qué dice tu caso">{funnelSentence(A)}</Reading>
      </CalcStep>

      {/* 2 · Tamizaje */}
      <CalcStep no={2} title="Tamizaje: duplicados y candidatos irrelevantes" mode={mode}
        meaning="Se eliminan los duplicados (dos nombres para el mismo criterio medido de dos formas, que se «fusionan») y los que no tienen relación con el objetivo (se «descartan»). Cada salida necesita una razón y una evidencia.">
        {f.outTamiz.dropped.length + f.outTamiz.merged.length ? (
          <TextTable mode={mode} caption="Candidatos que salieron en el tamizaje"
            head={['Candidato', 'Qué pasó', 'Razón', 'Evidencia']}
            rows={[...f.outTamiz.dropped, ...f.outTamiz.merged].map((c) => [
              nm(c),
              c.stage === 'merge' ? `Fusionado con ${nm(byId(c.target))}` : 'Descartado',
              c.reason.trim() || <span className="pbk-miss">Sin razón documentada</span>,
              c.evid.trim() || <span className="pbk-miss">Sin evidencia</span>,
            ])} />
        ) : <p className="muted">Ningún candidato salió en el tamizaje.</p>}
        <Reading>una fila con «Sin razón documentada» es justo la que un jurado preguntará: escribe qué duplicaba o por qué no aplica al caso, y la fuente.</Reading>
        <Reading title="Qué dice tu caso">
          {f.outTamiz.dropped.length + f.outTamiz.merged.length
            ? `El tamizaje quitó ${f.outTamiz.dropped.length + f.outTamiz.merged.length} de ${f.total} candidatos y dejó ${f.afterTamiz}. ${[...f.outTamiz.dropped, ...f.outTamiz.merged].filter((c) => !c.reason.trim() || !c.evid.trim()).length ? 'Faltan razones o evidencias en algunas filas.' : 'Todas las salidas tienen razón y evidencia.'}`
            : `No se eliminó ningún candidato: los ${f.total} pasan a la verificación de independencia.`}
        </Reading>
      </CalcStep>

      {/* 3 · Independencia */}
      <CalcStep no={3} title="Independencia: que cada criterio mida un eje distinto" mode={mode}
        meaning="Un buen conjunto de criterios no se solapa: si dos miden lo mismo, ese aspecto se cuenta dos veces y pesa el doble sin que nadie lo haya decidido. Para cada candidato se anota qué mide y por qué es un eje distinto.">
        {inIndep(A).length ? (
          <TextTable mode={mode} caption="Verificación de independencia de los candidatos que salieron vivos del tamizaje"
            head={['Candidato', 'Qué mide', 'Evidencia de que es un eje distinto', 'Decisión']}
            rows={inIndep(A).map((c) => [
              nm(c),
              c.qmide.trim() || <span className="pbk-miss">Sin anotar</span>,
              c.ind.trim() || <span className="pbk-miss">Sin evidencia</span>,
              c.stage === 'keep'
                ? 'Se mantiene como eje independiente'
                : c.stage === 'merge'
                  ? <>Se solapa: se funde con {nm(byId(c.target))}{c.reason.trim() ? `. ${c.reason.trim()}` : ''}</>
                  : <>Se descarta{c.reason.trim() ? `: ${c.reason.trim()}` : ''}</>,
            ])} />
        ) : <p className="muted">Ningún candidato llegó a esta etapa.</p>}
        <Reading>«Se mantiene» significa que el criterio aporta información que los demás no dan. «Se solapa» significa que otro criterio ya lo cubre y se fusiona con él.</Reading>
        <Reading title="Qué dice tu caso">
          {f.afterTamiz
            ? `De ${f.afterTamiz} candidatos, ${f.toPanel} se mantienen como ejes independientes${f.outIndep.length ? ` y ${f.outIndep.length} salen (${f.outIndep.map((c) => (c.stage === 'merge' ? `${nm(c)}: se funde con ${nm(byId(c.target))}` : `${nm(c)}: descartado`)).join('; ')})` : ''}. Esos ${f.toPanel} son los que califica el panel.`
            : 'No hay candidatos en esta etapa.'}
        </Reading>
      </CalcStep>

      {/* 4 · Panel */}
      <CalcStep no={4} title="Panel de importancia: calificar y promediar" mode={mode}
        meaning={<>Cada evaluador califica cada criterio de 1 (nada importante) a 5 (crítico), de forma independiente, y la <b>ponderación es el promedio</b> de sus calificaciones (votación ponderada, diapositiva 16). Aquí el panel es: {panelLabel(A)}.</>}
        formula={'Ponderación_j = ( x_j1 + x_j2 + … + x_jn ) / n\nx = calificación entre 1 y 5 · n = calificaciones válidas del criterio j'}>
        {A.mode === 'q' && (
          <ol className="pbk-q" aria-label="Las 5 preguntas de evidencia">
            {A.questions.map((q, i) => <li key={i}><b>Q{i + 1}</b> {q}</li>)}
          </ol>
        )}
        {panel.length ? (
          <>
            <CalcMatrix mode={mode} corner="Criterio" caption="Calificaciones del panel (1 a 5) y ponderación"
              rows={panel.map(nm)}
              cols={[...cs.map((c) => c.label), 'Ponderación', `¿Pasa (≥ ${cutTxt})?`]}
              colHint={[...cs.map(() => (A.mode === 'q' ? 'pregunta' : 'evaluador')), 'promedio', undefined]}
              digits={2}
              cells={scores.map((s) => [
                ...s.cells.map((k) => (k.raw == null ? '—' : k.valid ? String(k.raw) : `${k.raw} ✕`)),
                s.mean == null ? '—' : s.mean,
                s.mean == null ? 'Sin calificar' : passes(A, s.cand) ? '✓ Pasa' : '✕ No pasa',
              ])}
              hl={(i, j) => (j === cs.length && scores[i].mean != null ? 'key' : undefined)}
              footer={[{
                label: A.mode === 'q' ? 'Promedio de la pregunta' : 'Promedio del evaluador',
                hint: A.mode === 'q' ? 'qué tan alto puntúa cada pregunta' : 'qué tan generoso es cada uno',
                cells: [...cs.map((_, k) => {
                  const v = scores.map((s) => s.cells[k]).filter((x) => x.valid).map((x) => x.raw as number);
                  return v.length ? num(v.reduce((a, b) => a + b, 0) / v.length, 2) : '—';
                }), '', ''],
              }]} />
            <p className="pbk-rule"><b>Qué cuenta y qué no.</b> Solo cuentan las calificaciones entre 1 y 5. Las casillas vacías («—») y los valores fuera de ese rango (marcados con ✕) se ignoran, y el promedio se divide entre las calificaciones válidas, no entre el número de evaluadores.</p>

            <Worked title="Con tus números: la aritmética de cada ponderación">
              {scores.map((s) => `${nm(s.cand)}: ${s.arithmetic}${s.n > 0 && s.n < s.cells.length ? `   ⚠ solo cuentan ${s.n} de ${s.cells.length}` : ''}`).join('\n')}
            </Worked>

            <CalcMatrix mode={mode} corner="Criterio" caption="Cómo se reparten las calificaciones de cada criterio"
              rows={scores.map((s) => nm(s.cand))}
              cols={['n', 'Suma', 'Promedio', 'Mínimo', 'Máximo', 'Desv. est.']}
              colHint={['válidas', 'Σ x', 'Σ x / n', undefined, undefined, 'muestral (n−1)']}
              digits={2}
              cells={scores.map((s) => [String(s.n), num(s.sum, 2), num(s.mean, 2), num(s.min, 2), num(s.max, 2), s.sd == null ? '—' : num(s.sd, 2)])} />
            <Reading>el promedio manda; el mínimo y el máximo muestran el rango de opiniones y la desviación estándar qué tan de acuerdo estuvo el panel (cerca de 0 = consenso, alta = desacuerdo). Con menos de 2 calificaciones válidas no hay desviación.</Reading>
            <Reading title="Qué dice tu caso">
              {scored.length
                ? `${scored.length} criterio${scored.length === 1 ? '' : 's'} con ponderación: el más alto es ${nm(scored[0].cand)} (${num(scored[0].mean, 2)}) y el más bajo ${nm(scored[scored.length - 1].cand)} (${num(scored[scored.length - 1].mean, 2)}).${maxSd ? ` El mayor desacuerdo del panel fue en ${nm(maxSd.cand)} (desv. est. ${num(maxSd.sd, 2)}, calificaciones de ${num(maxSd.min, 1)} a ${num(maxSd.max, 1)}).` : ''}`
                : 'Aún no hay calificaciones válidas en el panel.'}
            </Reading>
          </>
        ) : <p className="muted">Ningún candidato llegó al panel.</p>}
      </CalcStep>

      {/* 5 · Corte y brecha */}
      <CalcStep no={5} title={`Corte y brecha: ponderación ≥ ${cutTxt}`} mode={mode}
        meaning="El corte separa los criterios que se quedan de los que se documentan como descartados. Lo importante no es el número, sino que exista una brecha real entre el último que pasa y el primero que no, y que quede justificado por escrito."
        formula={`Pasa el corte  si  Ponderación ≥ ${cutTxt}\nBrecha = Ponderación(último que pasa) − Ponderación(primero que no pasa)`}>
        <PrioCutoffChart prio={A} mode={mode} />
        {ci.rows.length > 0 && (
          <Worked title="Con tus números">
            {[
              `Corte elegido = ${cutTxt}  →  pasan ${ci.nPass} de ${ci.rows.length} criterios calificados`,
              ci.last ? `Último que pasa: ${nm(ci.last.cand)} = ${num(ci.last.mean, 2)}  (margen ${num(ci.lastMargin, 2)} sobre el corte)` : 'Último que pasa: ninguno',
              ci.firstNo ? `Primero que no pasa: ${nm(ci.firstNo.cand)} = ${num(ci.firstNo.mean, 2)}  (le faltan ${num(A.cutoff - ci.firstNo.mean, 2)} para el corte)` : 'Primero que no pasa: ninguno',
              ci.gap != null && ci.last && ci.firstNo ? `Brecha = ${num(ci.last.mean, 2)} − ${num(ci.firstNo.mean, 2)} = ${num(ci.gap, 2)} puntos${ci.nearLimit ? `  →  «en el límite» (≤ ${NEAR_LIMIT})` : ''}` : 'Brecha: no aplica (no hay un último que pase y un primero que no)',
            ].join('\n')}
          </Worked>
        )}
        <div className="pbk-warn-box" role="note">
          <b>El corte es una convención práctica del curso, no un estándar de la literatura.</b> No existe un umbral universal: el valor lo decides tú, conviene fijarlo antes de ver los resultados (para no ajustarlo a conveniencia) y justificarlo por escrito. Alternativa: cortar por cantidad (quedarte con los N mejores).
        </div>
        <Reading>la línea discontinua es el corte. Las barras que la alcanzan (llenas, «✓ Pasa») se quedan; las rayadas («✕ No pasa») no. La fila «Brecha» mide cuánto separa a los dos lados: una brecha grande hace el corte fácil de defender, una estrecha exige más justificación.</Reading>
        <Reading title="Qué dice tu caso">{cutSentence(A)}</Reading>
      </CalcStep>

      {/* 6 · Finalistas */}
      <CalcStep no={6} title="Finalistas, descartados y verificación" mode={mode}
        meaning="Cada finalista lleva su justificación (por qué es crítico para el objetivo) y una verificación final: ¿se puede medir para todas las alternativas? Si no, hay que reformularlo o volver a tamizar. Cada descartado por el corte también se documenta.">
        {ci.nPass ? (
          <TextTable mode={mode} caption={`Finalistas (${ci.nPass})`}
            head={['Criterio', 'Ponderación', 'Por qué queda', 'Medible para todas las alternativas']}
            rows={ci.rows.filter((r) => r.pass).map((r, i) => [
              `${i + 1}. ${nm(r.cand)}`,
              num(r.mean, 2),
              r.cand.just.trim() || <span className="pbk-miss">Sin justificación escrita</span>,
              r.cand.measurable === true
                ? <>Sí{r.cand.measEvid?.trim() ? `: ${r.cand.measEvid.trim()}` : ''}</>
                : r.cand.measurable === false
                  ? <><b>No</b>{r.cand.measEvid?.trim() ? `: ${r.cand.measEvid.trim()}` : ''}</>
                  : <span className="pbk-miss">Sin verificar</span>,
            ])} />
        ) : <p className="muted">Ningún criterio pasa el corte ({cutTxt}).</p>}
        {ci.rows.some((r) => !r.pass) || ci.unrated.length > 0 ? (
          <TextTable mode={mode} caption="Descartados por el corte (panel de importancia)"
            head={['Criterio', 'Ponderación', 'Razón del descarte']}
            rows={[
              ...ci.rows.filter((r) => !r.pass).map((r) => [
                <>{nm(r.cand)}{r === ci.firstNo && ci.nearLimit && <> <span className="pbk-tag">en el límite</span></>}</>,
                num(r.mean, 2),
                r.cand.cutReason.trim() || <span className="pbk-miss">Sin razón documentada</span>,
              ]),
              ...ci.unrated.map((c) => [nm(c), 'sin calificar', c.cutReason.trim() || <span className="pbk-miss">Sin razón documentada</span>]),
            ]} />
        ) : null}
        <Reading>«Sin verificar» o «No» en medibilidad es una alerta: un criterio que no se puede medir para todas las alternativas no sirve para compararlas. Los criterios con «en el límite» son los que más conviene explicar.</Reading>
        <Reading title="Qué dice tu caso">
          {ci.nPass
            ? `Quedan ${ci.nPass} finalistas${ci.nPass >= MIN_FINALISTS ? ` (cumple el mínimo de ${MIN_FINALISTS} de la propuesta)` : ` (la propuesta pide al menos ${MIN_FINALISTS})`}. Medibilidad verificada en ${md.yes.length}, marcada como «no» en ${md.no.length} y pendiente en ${md.pending.length}.`
            : 'Aún no hay finalistas.'}
        </Reading>
        <div className="pbk-checks">
          <div className="pbk-checks-t">Qué revisar antes de entregar</div>
          {warnings.length ? <ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul> : <p>Sin avisos: la Parte A está completa y coherente.</p>}
        </div>
      </CalcStep>
    </CalcSection>
  );
}

/** Tabla de texto (celdas con frases largas): encabezados con scope, sin alineación numérica. En el informe se imprime con las filas enteras. */
function TextTable({ mode, caption, head, rows }: { mode: CalcMode; caption: string; head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="tbl calc-tbl" role="region" aria-label={caption} tabIndex={0}>
      <table className={'calc-table pbk-table' + (mode === 'report' ? ' rpt-table' : '')}>
        <caption className="calc-cap">{caption}</caption>
        <thead><tr>{head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row" className="alt">{c}</th> : <td key={j}>{c}</td>))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
