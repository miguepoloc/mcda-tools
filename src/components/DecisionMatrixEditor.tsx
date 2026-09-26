'use client';

import WeightBars from './WeightBars';
import { useState } from 'react';
import { missingUnits, withUnit } from '@/lib/units';
import ReorderList from './ReorderList';
import type { Alternative, Criterion, DecisionMatrix, MatrixKind, TargetSpec } from '@/lib/types';
import { getCell, getKind, getTarget, targetDistance } from '@/lib/topsis';
import { LINGUISTIC_LABELS, type LinguisticLabel } from '@/lib/fuzzy_topsis';

const LINGUISTIC_ES: Record<LinguisticLabel, string> = {
  VP: 'Muy mala (VP)',
  P:  'Mala (P)',
  F:  'Regular (F)',
  G:  'Buena (G)',
  VG: 'Muy buena (VG)',
};

function getFuzzyCell(dm: DecisionMatrix, altId: string, critId: string): LinguisticLabel {
  const v = dm.values[altId]?.[critId];
  return (typeof v === 'string' && LINGUISTIC_LABELS.includes(v as LinguisticLabel))
    ? (v as LinguisticLabel)
    : 'F';
}

type Props = {
  criteria: Criterion[];
  alternatives: Alternative[];
  matrix: DecisionMatrix;
  method?: string;
  onSetCell: (altId: string, critId: string, value: number | null) => void;
  onSetFuzzyCell?: (altId: string, critId: string, value: LinguisticLabel) => void;
  onSetType: (critId: string, type: MatrixKind) => void;
  /** Objetivo (valor y tolerancia) de un criterio de tipo «Objetivo». */
  onSetTarget: (critId: string, spec: TargetSpec) => void;
  /** Objetivo de decisión del proyecto: se recuerda aquí porque al llenar la matriz es cuando más se necesita saber qué se busca. */
  objective?: string;
  onEditObjective?: () => void;
  /** Pesos que salen de esta matriz (CRITIC o Entropía), para verlos cambiar mientras se llena. Solo con pesos objetivos. */
  liveWeights?: { label: string; rows: { name: string; weight: number }[] };
  /** «AHP», «CRITIC» o «Entropía»: de dónde salen los pesos del proyecto. */
  weightingLabel?: string;
  /** Con pesos AHP: ningún experto ha pesado todavía los criterios, así que Resultados no calcula nada. */
  noExpertWeights?: boolean;
  onGoExperts?: () => void;
  /** Guarda la unidad de un criterio (km, USD, «escala 1–5»…). */
  onSetUnit?: (critId: string, unit: string) => void;
  /** Mueve un criterio o una alternativa de la posición `from` a la `to`: para que la tabla quede en el mismo orden que tu Excel. */
  onReorder?: (kind: 'criteria' | 'alternatives', from: number, to: number) => void;
};

/** Unidad como sufijo dentro de la celda solo si es corta («km», «USD»); las largas («escala 1–5») quedan en la cabecera. */
const cellUnit = (u?: string): string => { const t = u?.trim() ?? ''; return t.length > 0 && t.length <= 6 ? t : ''; };

export default function DecisionMatrixEditor({ criteria, alternatives, matrix, method, onSetCell, onSetFuzzyCell, onSetType, onSetTarget, objective, onEditObjective, liveWeights, weightingLabel, noExpertWeights, onGoExperts, onSetUnit, onReorder }: Props) {
  const isFuzzy = method === 'fuzzy_topsis';
  const [ordering, setOrdering] = useState(false);
  const [scrolled, setScrolled] = useState(false); // la sombra de la columna fija solo aparece cuando hay algo debajo
  const targetCrit = isFuzzy ? [] : criteria.filter((c) => getKind(matrix, c.id) === 'target');
  const sinObjetivo = targetCrit.filter((c) => !getTarget(matrix, c.id));
  // ancho mínimo por columna: los 3 botones (Beneficio · Costo · Objetivo) caben sin apretarse y la tabla
  // hace scroll horizontal (envoltorio .tbl) si hay muchos criterios, en vez de deformarse
  const minWidth = 200 + criteria.length * 232;

  return (
    <div className="panel">
      <div className="card" style={{ marginBottom: 12, borderLeft: '3px solid var(--accent)' }}>
        <div className="eyebrow">Lo que estás decidiendo</div>
        {objective?.trim()
          ? <p style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 600, maxWidth: '110ch' }}>{objective}</p>
          : (
            <p className="muted" style={{ margin: '4px 0 0', maxWidth: '110ch' }}>
              Aún no escribiste el objetivo de decisión.{' '}
              {onEditObjective && <button type="button" className="btn" onClick={onEditObjective}>Escribirlo en Proyecto</button>}
            </p>
          )}
      </div>
      <p className="muted" style={{ maxWidth: '110ch' }}>
        {isFuzzy
          ? 'Para cada alternativa, selecciona la variable lingüística que mejor describe su desempeño en cada criterio: desde Muy mala (VP) hasta Muy buena (VG). Marca si el criterio es de beneficio (MÁS es mejor) o costo (MENOS es mejor).'
          : 'Para cada alternativa, escribe el valor real que tiene en cada criterio — un dato (precio, kilómetros, años, una métrica técnica), no un juicio de 1 a 9 como en AHP. Marca el tipo de cada criterio: Beneficio (MÁS es mejor), Costo (MENOS es mejor) u Objetivo (lo mejor es un valor específico, por ejemplo un voltaje de 110 V: ni más ni menos es mejor).'}
      </p>
      {!isFuzzy && onSetUnit && missingUnits(criteria).length > 0 && (
        <div className="banner" role="status" style={{ marginBottom: 12 }}>
          <span><b>Falta la unidad de:</b> {missingUnits(criteria).map((c) => c.name).join(', ')}. Escríbela bajo el nombre del criterio (km, años, USD, «escala 1–5»…); si es un puntaje, «escala 1–5» o «sin unidad».</span>
        </div>
      )}
      {sinObjetivo.length > 0 && (
        <div className="banner" role="alert" style={{ marginBottom: 12 }}>
          <span><b>Falta el valor objetivo</b> de: {sinObjetivo.map((c) => c.name).join(', ')}. Escríbelo en la fila «Valor objetivo»; mientras tanto ese criterio no distingue entre alternativas.</span>
        </div>
      )}
      {onReorder && (criteria.length > 1 || alternatives.length > 1) && (
        <div style={{ marginBottom: 12 }}>
          <button type="button" className="btn sm" aria-expanded={ordering} onClick={() => setOrdering((v) => !v)}>
            {ordering ? 'Listo, cerrar el orden' : '⇅ Cambiar el orden de filas y columnas'}
          </button>
          {ordering && (
            <div className="card" style={{ marginTop: 10 }}>
              <p className="muted" style={{ margin: '0 0 12px', fontSize: 13.5, maxWidth: '78ch' }}>
                Arrastra <b>⠿</b> (o enfócalo y usa las flechas ↑ ↓) para dejar las <b>alternativas</b> (filas) y los <b>criterios</b> (columnas) en el mismo orden que tu Excel. Los datos que ya escribiste se mueven con su fila y su columna: no se pierde nada.
              </p>
              <div className="rord">
                <div>
                  <h4>Alternativas (filas)</h4>
                  <ReorderList
                    items={alternatives} getKey={(a) => a.id} getLabel={(a) => a.name} label="alternativas"
                    onMove={(from, to) => onReorder('alternatives', from, to)}
                    renderItem={(a, i, handle) => (
                      <>
                        {handle}
                        <span className="nm">{a.name}</span>
                        <button type="button" className="btn icon sm mv" aria-label={`Subir «${a.name}»`} disabled={i === 0} onClick={() => onReorder('alternatives', i, i - 1)}>↑</button>
                        <button type="button" className="btn icon sm mv" aria-label={`Bajar «${a.name}»`} disabled={i === alternatives.length - 1} onClick={() => onReorder('alternatives', i, i + 1)}>↓</button>
                      </>
                    )}
                  />
                </div>
                <div>
                  <h4>Criterios (columnas)</h4>
                  <ReorderList
                    items={criteria} getKey={(c) => c.id} getLabel={(c) => c.name} label="criterios"
                    onMove={(from, to) => onReorder('criteria', from, to)}
                    renderItem={(c, i, handle) => (
                      <>
                        {handle}
                        <span className="nm">{c.name}{c.unit?.trim() ? <span className="un"> · {c.unit.trim()}</span> : null}</span>
                        <button type="button" className="btn icon sm mv" aria-label={`Mover «${c.name}» a la izquierda`} disabled={i === 0} onClick={() => onReorder('criteria', i, i - 1)}>↑</button>
                        <button type="button" className="btn icon sm mv" aria-label={`Mover «${c.name}» a la derecha`} disabled={i === criteria.length - 1} onClick={() => onReorder('criteria', i, i + 1)}>↓</button>
                      </>
                    )}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      <div className={'card mx' + (scrolled ? ' scrolled' : '')}>
        <div className="tbl" onScroll={(e) => setScrolled(e.currentTarget.scrollLeft > 2)}>
          <table style={{ minWidth }}>
            <caption className="sr-only">Matriz de decisión: valor de cada alternativa en cada criterio y tipo de criterio</caption>
            <thead>
              <tr>
                <th scope="col">Alternativa</th>
                {criteria.map((c) => (
                  <th key={c.id} scope="col">
                    <span className="crit-name">{c.name}</span>
                    {!isFuzzy && onSetUnit && (
                      <input type="text" className={'unit-in' + (c.unit?.trim() ? '' : ' missing')} value={c.unit ?? ''} placeholder="unidad…" autoComplete="off" aria-label={`Unidad de ${c.name}`} onChange={(e) => onSetUnit(c.id, e.target.value)} />
                    )}
                    <div className="seg" role="group" aria-label={`Tipo de ${c.name}`}>
                      <button type="button" aria-pressed={getKind(matrix, c.id) === 'max'} onClick={() => onSetType(c.id, 'max')}>Beneficio</button>
                      <button type="button" className="d" aria-pressed={getKind(matrix, c.id) === 'min'} onClick={() => onSetType(c.id, 'min')}>Costo</button>
                      {!isFuzzy && <button type="button" className="o" aria-pressed={getKind(matrix, c.id) === 'target'} onClick={() => onSetType(c.id, 'target')}>Objetivo</button>}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {targetCrit.length > 0 && (
                <>
                  <tr className="obj">
                    <th scope="row">
                      Valor objetivo
                      <span className="mxh">Lo ideal para ese criterio</span>
                    </th>
                    {criteria.map((c) => {
                      const t = getTarget(matrix, c.id);
                      return (
                        <td key={c.id}>
                          {getKind(matrix, c.id) === 'target' ? (
                            <input type="number" inputMode="decimal" step="any" aria-label={`Valor objetivo de ${c.name}`}
                              aria-invalid={!t} placeholder="ej. 110" value={t?.value ?? ''}
                              onChange={(e) => e.target.value !== '' && onSetTarget(c.id, { value: Number(e.target.value), tol: t?.tol ?? 0 })} />
                          ) : <span className="muted" aria-hidden="true">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="obj end">
                    <th scope="row">
                      Tolerancia ±
                      <span className="mxh">Banda donde todo valor es igual de bueno. 0 = valor exacto</span>
                    </th>
                    {criteria.map((c) => {
                      const t = getTarget(matrix, c.id);
                      return (
                        <td key={c.id}>
                          {getKind(matrix, c.id) === 'target' ? (
                            <input type="number" inputMode="decimal" step="any" min="0" aria-label={`Tolerancia del objetivo de ${c.name}`}
                              disabled={!t} value={t?.tol ?? 0}
                              onChange={(e) => { if (t && e.target.value !== '') onSetTarget(c.id, { value: t.value, tol: Math.max(0, Number(e.target.value)) }); }} />
                          ) : <span className="muted" aria-hidden="true">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                </>
              )}
              {alternatives.map((a) => (
                <tr key={a.id}>
                  <th scope="row" className="alt">{a.name}</th>
                  {criteria.map((c) => {
                    const t = getTarget(matrix, c.id), x = getCell(matrix, a.id, c.id);
                    return (
                      <td key={c.id}>
                        {isFuzzy ? (
                          <select
                            aria-label={`${a.name}, ${withUnit(c)}`}
                            value={getFuzzyCell(matrix, a.id, c.id)}
                            onChange={(e) => onSetFuzzyCell?.(a.id, c.id, e.target.value as LinguisticLabel)}
                          >
                            {LINGUISTIC_LABELS.map((lbl) => (
                              <option key={lbl} value={lbl}>{LINGUISTIC_ES[lbl]}</option>
                            ))}
                          </select>
                        ) : (
                          <>
                            <div className={'mx-cell' + (cellUnit(c.unit) ? ' has-u' : '')}>
                              <input
                                type="number"
                                inputMode="decimal"
                                step="any"
                                aria-label={`${a.name}, ${withUnit(c)}`}
                                value={x ?? ''}
                                onChange={(e) => onSetCell(a.id, c.id, e.target.value === '' ? null : Number(e.target.value))}
                              />
                              {cellUnit(c.unit) && <span className="mx-u" aria-hidden="true" title={c.unit?.trim()}>{cellUnit(c.unit)}</span>}
                            </div>
                            {getKind(matrix, c.id) === 'target' && t && x != null && (
                              <span className="mxh">distancia {Number(targetDistance(x, t.value, t.tol).toPrecision(6))}</span>
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!alternatives.length && <tr><td className="muted" colSpan={criteria.length + 1}>Agrega alternativas en la pestaña «Proyecto» primero.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* De dónde salen los pesos de los criterios: sin esto, elegir CRITIC o Entropía no muestra ningún efecto en ninguna pantalla de captura */}
      {liveWeights ? (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="eyebrow">Pesos de los criterios · {liveWeights.label}</div>
          <p className="muted" style={{ margin: '4px 0 8px', maxWidth: '110ch' }}>
            No se digitan: se calculan solos a partir de la matriz de arriba y cambian cuando cambias un dato.
            {liveWeights.label === 'CRITIC'
              ? ' CRITIC da más peso al criterio que más varía entre alternativas (contraste) y que menos se repite con los demás (correlación baja).'
              : ' La entropía da más peso al criterio cuyos valores más se diferencian entre alternativas.'}
            {' '}Un criterio con el mismo valor en todas las alternativas no distingue nada y recibe peso 0.
          </p>
          {alternatives.length >= 2
            ? <WeightBars rows={liveWeights.rows} />
            : <p className="muted">Agrega al menos 2 alternativas con datos para ver los pesos.</p>}
        </div>
      ) : weightingLabel === 'AHP' && onGoExperts ? (
        noExpertWeights ? (
          <div className="banner" role="status" style={{ marginTop: 12 }}>
            <span><b>Faltan los pesos de los criterios.</b> Con ponderación AHP salen de la comparación por pares de los expertos, no de esta matriz, y todavía nadie la ha hecho: mientras tanto Resultados no calcula el ranking.</span>
            <button type="button" className="btn" onClick={onGoExperts}>Ir a Expertos</button>
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 12, maxWidth: '110ch' }}>
            Los pesos de los criterios salen de la comparación por pares de los expertos, no de esta matriz.{' '}
            <button type="button" className="btn" onClick={onGoExperts}>Ir a Expertos</button>
          </p>
        )
      ) : null}
    </div>
  );
}
