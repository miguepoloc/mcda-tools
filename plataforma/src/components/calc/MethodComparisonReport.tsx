'use client';

import { useMemo } from 'react';
import { pairwiseAgreement, summarizeAgreement, type ElectreCompareInfo } from '@/lib/rankCompare';
import { CalcSection, CalcStep, Reading, num, type CalcMode } from './CalcKit';
import TextTable, { type TextCell, type TextRow } from './TextTable';

/** Comparación entre métodos sobre las MISMAS alternativas (y los mismos pesos): posiciones, parámetros usados, y grado de acuerdo (ρ de
 * Spearman y τ de Kendall) entre cada par de métodos que dan ranking. ELECTRE se trata APARTE: no da ranking, así que no recibe
 * posición ni entra en ρ/τ; se muestra su relación de superación, sus incomparables y su núcleo. */
export type CompareMethod = {
  key: string;
  label: string;
  /** `ranks[i]` = puesto de la alternativa `alternatives[i]` (1 = mejor; empates comparten puesto). null = el método no tiene datos suficientes o hay empate total: se muestra «—» y queda fuera de ρ/τ. */
  ranks: (number | null)[] | null;
  /** Puntaje de cada alternativa (mismo orden), solo para mostrarlo junto al puesto. */
  scores?: (number | null)[];
  /** Qué es el puntaje: «cercanía C», «Q (menor es mejor)», «φ»… */
  scoreLabel?: string;
  /** Parámetros usados, en texto llano (ver `describeMethodParams` de lib/rankCompare). */
  params?: string;
  /** Solo VIKOR: nombres del conjunto de compromiso cuando NO hay ganador único; su 1.º no se cuenta como ganador. */
  compromise?: string[];
  /** Por qué el método no aparece (p. ej. «faltan datos»). */
  unavailableReason?: string;
};

export type MethodComparisonReportProps = {
  mode: CalcMode;
  /** Nombres de las alternativas, en el orden de `ranks`. */
  alternatives: string[];
  methods: CompareMethod[];
  /** Resultado de ELECTRE (`electreCompareInfo(electreSynthesis(...))`); omitir si no hay datos. */
  electre?: ElectreCompareInfo;
  /** Texto de los pesos comunes, p. ej. «AHP, de los juicios de los expertos» o «CRITIC, calculados de la matriz». */
  weightsNote?: string;
};

const f2 = (x: number | null) => (x == null ? '—' : x.toFixed(2));

export default function MethodComparisonReport({ mode, alternatives, methods, electre, weightsNote }: MethodComparisonReportProps) {
  // Métodos con ranking completo utilizable (sin datos → fuera de ρ/τ; ELECTRE nunca entra aquí)
  const ranked = useMemo(
    () => methods.filter((m): m is CompareMethod & { ranks: number[] } => !!m.ranks && m.ranks.length === alternatives.length && m.ranks.every((r) => r != null)),
    [methods, alternatives.length],
  );
  const pairs = useMemo(() => pairwiseAgreement(ranked.map((m) => ({ key: m.key, label: m.label, ranks: m.ranks }))), [ranked]);
  const summary = useMemo(() => summarizeAgreement(alternatives, ranked.map((m) => ({ key: m.key, label: m.label, ranks: m.ranks }))), [alternatives, ranked]);

  const TITLE = 'Comparación entre métodos';
  if (alternatives.length < 2 || (ranked.length === 0 && !electre)) {
    return <CalcSection title={TITLE} mode={mode}><p className="sens-note">Todavía no hay al menos dos métodos con resultados sobre las mismas alternativas para compararlos.</p></CalcSection>;
  }

  // ¿1.º de cada método (solo los que dan ganador único)?
  const first = (m: CompareMethod & { ranks: number[] }) => alternatives.filter((_, i) => m.ranks[i] === 1);
  const clean = ranked.filter((m) => !m.compromise?.length);
  const electreLine = electre
    ? `ELECTRE (c* = ${electre.cStar.toFixed(2)}, d* = ${electre.dStar.toFixed(2)}) no ordena: deja ${electre.incomparable.length} par${electre.incomparable.length === 1 ? '' : 'es'} incomparable${electre.incomparable.length === 1 ? '' : 's'} y ${electre.winner
      ? `su núcleo es una sola alternativa, ${electre.winner}${clean.length && clean.every((m) => first(m).length === 1 && first(m)[0] === electre.winner) ? ', que coincide con el 1.º de los demás métodos' : clean.length ? ', que NO coincide con el 1.º de todos los demás métodos' : ''}`
      : 'no hay un ganador único (su núcleo tiene varios elementos o no hay relaciones)'}.`
    : null;

  const posCell = (m: CompareMethod, i: number): TextCell => {
    const r = m.ranks?.[i];
    if (r == null) return { t: '—', n: true, title: m.unavailableReason ?? 'Sin datos suficientes' };
    const inSoft = !!m.compromise?.includes(alternatives[i]);
    const s = m.scores?.[i];
    return {
      t: <>#{r}{inSoft ? ' ◆' : ''}{s != null && Number.isFinite(s) ? <span className="calc-hint">{num(s, 4)}</span> : null}</>,
      n: true,
      hl: r === 1 ? (m.compromise?.length ? 'key' : 'good') : undefined,
      title: inSoft ? 'Conjunto de compromiso de VIKOR: no hay ganador único' : r === 1 ? 'En 1.er lugar' : undefined,
    };
  };
  const electreCell = (i: number): TextCell => {
    if (!electre) return '—';
    const tag = electre.winner === electre.names[i] ? ' · ✓ única del núcleo' : electre.isolated[i] ? ' · ○ aislada (en el núcleo solo porque no se relaciona)' : electre.inKernel[i] ? ' · ○ en el núcleo' : '';
    return { t: `supera a ${electre.out[i]} · superada por ${electre.inn[i]}${tag}`, hl: electre.winner === electre.names[i] ? 'good' : undefined, title: 'ELECTRE no da posición (#1, #2…): da relaciones entre pares' };
  };

  return (
    <CalcSection title={TITLE} mode={mode}
      intro={`Los mismos datos${weightsNote ? ` y los mismos pesos de criterio (${weightsNote})` : ''}, procesados por cada método. Si difieren, la causa está en cómo cada uno agrega (compensatorio o no), normaliza y en los parámetros que se eligieron.`}>
      <div className="sens-case">
        <p className="sens-case-h">Qué dice tu caso</p>
        <p className="sens-case-lead">{ranked.length >= 2 ? summary.headline : ranked.length === 1 ? `Solo ${ranked[0].label} tiene ranking; no hay otro ranking con el cual medir el acuerdo.` : 'Ningún método con ranking tiene datos suficientes.'}</p>
        {(summary.points.length > 0 || electreLine) && (
          <ul>
            {summary.points.map((p, i) => <li key={i}>{p}</li>)}
            {electreLine && <li>{electreLine}</li>}
          </ul>
        )}
      </div>

      <CalcStep no={1} title="Posición de cada alternativa por método" mode={mode} defaultOpen
        meaning="1 = la mejor. Bajo cada posición va el puntaje que la produjo (no son comparables entre métodos: cada uno usa su propia escala; compara posiciones, no puntajes).">
        <TextTable mode={mode} wide caption="Posiciones por método (1 = mejor)" corner="Alternativa"
          cols={[...methods.map((m) => m.label), ...(electre ? ['ELECTRE (sin ranking)'] : [])]}
          colHint={[...methods.map((m) => m.scoreLabel), ...(electre ? ['relaciones de superación'] : [])]}
          rows={alternatives.map((a, i): TextRow => ({ head: a, cells: [...methods.map((m) => posCell(m, i)), ...(electre ? [electreCell(i)] : [])] }))} />
        <Reading>una fila con el mismo número en todas las columnas es una alternativa sobre la que los métodos están de acuerdo. «—» = ese método no tuvo datos suficientes.
          {methods.some((m) => m.compromise?.length) ? ' ◆ = conjunto de compromiso de VIKOR: no declara ganador único, así que su 1.º no cuenta como primer lugar.' : ''}
          {electre ? ' ELECTRE no da posiciones: «supera a X · superada por Y» cuenta relaciones; ✓ = única alternativa del núcleo, ○ = está en el núcleo pero no es ganadora única.' : ''}</Reading>
      </CalcStep>

      <CalcStep no={2} title="Parámetros que usó cada método" mode={mode}
        meaning="Algunos resultados dependen de parámetros que NO salen de los datos sino que los elige quien decide. Deben declararse para que el resultado se pueda reproducir.">
        <TextTable mode={mode} caption="Parámetros por método" corner="Método" cols={['Parámetros y convenciones']}
          rows={[...methods.map((m): TextRow => ({ head: m.label, cells: [m.params || '—'] })), ...(electre ? [{ head: 'ELECTRE', cells: [`c* = ${electre.cStar.toFixed(2)} (concordancia mínima) y d* = ${electre.dStar.toFixed(2)} (discordancia máxima); los elige quien decide, no salen de los datos.`] } as TextRow] : [])]} />
      </CalcStep>

      {ranked.length >= 2 && (
        <CalcStep no={3} title="Grado de acuerdo entre rankings (ρ de Spearman y τ de Kendall)" mode={mode}
          formula={'ρ = 1 − 6·Σd² / [n(n² − 1)]   (d = diferencia de posiciones)\nτ = (pares concordantes − discordantes) / [n(n − 1)/2]'}
          meaning="ρ y τ miden cuánto se parecen dos órdenes: 1 = idénticos, 0 = sin relación, −1 = invertidos. Con empates se usan las versiones corregidas (ρ sobre puestos promedio y τ-b). ELECTRE no entra: no tiene un ranking completo.">
          <TextTable mode={mode} caption="Acuerdo entre cada par de métodos con ranking" corner="Par de métodos"
            cols={['ρ de Spearman', 'τ de Kendall', '¿Mismo 1.º?', '¿Mismo último?']}
            rows={pairs.map((p): TextRow => ({
              head: `${p.aLabel} – ${p.bLabel}`,
              cells: [
                { t: f2(p.rho), n: true, hl: p.rho != null && p.rho >= 0.999 ? 'good' : undefined },
                { t: f2(p.tau), n: true, hl: p.tau != null && p.tau >= 0.999 ? 'good' : undefined },
                p.sameFirst ? 'Sí' : { t: 'No', hl: 'bad' }, p.sameLast ? 'Sí' : { t: 'No', hl: 'bad' },
              ],
            }))} />
          <Reading>cerca de 1 = los métodos casi no discrepan (aunque los números difieran, el orden es el mismo). Un ρ bajo con el mismo 1.º significa que solo discrepan en las posiciones intermedias. «—» = no se puede calcular (un ranking con todo empatado).</Reading>
        </CalcStep>
      )}

      {electre && (
        <CalcStep no={ranked.length >= 2 ? 4 : 3} title="ELECTRE, aparte: relaciones e incomparables" mode={mode}
          meaning="ELECTRE no produce un orden: dice qué alternativa supera a cuál con los umbrales elegidos, y deja «incomparables» a las que ninguna supera a la otra. Por eso no se le asigna posición ni se mezcla con ρ y τ.">
          <TextTable mode={mode} caption="Relaciones de superación de ELECTRE" corner="Resultado" cols={['Detalle']}
            rows={[
              { head: 'Relaciones de superación', cells: [electre.relations.length ? electre.relations.map((r) => `${r.winner} supera a ${r.loser}`).join('; ') : 'Ninguna alternativa supera a otra con estos umbrales.'] },
              { head: 'Pares incomparables', cells: [electre.incomparable.length ? electre.incomparable.map(([a, b]) => `${a} y ${b}`).join('; ') : 'Ninguno: todos los pares tienen una relación.'] },
              { head: 'Núcleo', cells: [electre.kernelSummary] },
            ]} />
          {electre.kernelReasons.length > 0 && <ul className="sens-note" style={{ paddingLeft: 18, margin: 0 }}>{electre.kernelReasons.map((r) => <li key={r}>{r}</li>)}</ul>}
          <Reading>un par incomparable no es una falla: significa que los datos no alcanzan para preferir una sobre la otra con esos umbrales.
            {electre.incomparable.length > 0 ? ' Si otros métodos ponen a esas alternativas en posiciones distintas, explica en la discusión por qué ELECTRE se niega a decidir entre ellas (es un método no compensatorio: un mal valor decisivo puede vetar).' : ''}</Reading>
        </CalcStep>
      )}
    </CalcSection>
  );
}
