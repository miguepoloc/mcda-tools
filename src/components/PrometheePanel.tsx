'use client';

import { useId, useMemo, useState } from 'react';
import type { Alternative, Criterion, DecisionMatrix, PrometheeCriterionConfig, PrometheeFn } from '@/lib/types';
import { promethee, prometheeI, prometheeInputs } from '@/lib/promethee';
import { DEFAULT_PROMETHEE_FN, PROMETHEE_FNS, PROMETHEE_FN_INFO, resolvePref, validatePrefSpec } from '@/lib/prometheeConfig';
import { withUnit } from '@/lib/units';
import { PreferenceCurve } from './calc/PrometheeBreakdown';
import { listNames, n4, sgn } from './calc/calcFormat';

/**
 * Todo lo específico de PROMETHEE que no es «una lista ordenada»: elegir por criterio una de las seis funciones de preferencia de
 * Brans y Vincke (1985) con sus umbrales q, p y σ, y el orden parcial de PROMETHEE I (preferencia, indiferencia e
 * incomparabilidad) junto al flujo neto de PROMETHEE II. La configuración vive en `decision_matrix.prometheeConfig` (aditivo);
 * sin ella cada criterio usa el Tipo III con q = 0 y p = rango, que es lo que enseña el curso y da los mismos números de siempre.
 * Los umbrales NO salen de los datos: los fija quien decide.
 */

type Props = {
  criteria: Criterion[];
  alternatives: Alternative[];
  /** Matriz EFECTIVA (criterios «objetivo» ya convertidos), la misma que lee prometheeSynthesis. */
  dm: DecisionMatrix;
  /** Pesos de los criterios en el orden de `criteria` (se normalizan a suma 1). */
  weights: number[];
  onChange: (cfg: Record<string, PrometheeCriterionConfig> | undefined) => void;
  /** true = el dueño del proyecto (se guarda); false = vista pública (solo en pantalla). */
  persisted: boolean;
};

const fmt = (x: number) => String(Number(x.toPrecision(5)));

/** Campo numérico con borrador local: vacío = «usar el valor por defecto» (se muestra como marcador de posición). */
function NumField({ value, placeholder, label, error, errId, onCommit }: { value: number | undefined; placeholder: string; label: string; error?: string; errId: string; onCommit: (v: number | undefined) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <>
      <input
        type="number" inputMode="decimal" step="any" min="0" style={{ width: 96 }}
        aria-label={label} aria-invalid={!!error} aria-describedby={error ? errId : undefined}
        placeholder={placeholder} value={draft ?? (value == null ? '' : String(value))}
        onChange={(e) => {
          setDraft(e.target.value);
          if (e.target.value === '') onCommit(undefined);
          else { const v = Number(e.target.value); if (Number.isFinite(v)) onCommit(v); }
        }}
        onBlur={() => setDraft(null)}
      />
      {error && <span id={errId} role="alert" style={{ display: 'block', fontSize: 12, color: 'var(--ink)', background: 'var(--warn-soft)', borderRadius: 6, padding: '2px 6px', marginTop: 4, textAlign: 'left' }}>Atención: {error}</span>}
    </>
  );
}

export default function PrometheePanel({ criteria, alternatives, dm, weights, onChange, persisted }: Props) {
  const uid = useId().replace(/:/g, '');
  const cfg = dm.prometheeConfig;
  const { matrix, types, cfg: cfgArr } = useMemo(() => prometheeInputs(criteria, alternatives, dm), [criteria, alternatives, dm]);
  const res = useMemo(() => promethee(matrix, weights, types, cfgArr), [matrix, weights, types, cfgArr]);
  const p1 = useMemo(() => prometheeI(res.phiPlus, res.phiMinus), [res]);
  const names = alternatives.map((a) => a.name);
  const n = names.length;
  const labels = criteria.map((c) => withUnit(c));
  const anyCustom = res.prefs.some((x) => x.custom);

  const commit = (id: string, next: PrometheeCriterionConfig | null) => {
    const out: Record<string, PrometheeCriterionConfig> = { ...(cfg ?? {}) };
    const isDefault = !next || (next.fn === DEFAULT_PROMETHEE_FN && next.q == null && next.p == null && next.s == null);
    if (isDefault) delete out[id]; else out[id] = next;
    onChange(Object.keys(out).length ? out : undefined);
  };
  const setFn = (id: string, fn: PrometheeFn) => {
    const cur = cfg?.[id];
    const info = PROMETHEE_FN_INFO[fn];
    const next: PrometheeCriterionConfig = { fn };
    if (info.q && cur?.q != null) next.q = cur.q;
    if (info.p && cur?.p != null) next.p = cur.p;
    if (info.s && cur?.s != null) next.s = cur.s;
    commit(id, next);
  };
  const setField = (id: string, field: 'q' | 'p' | 's', v: number | undefined) => {
    const cur = cfg?.[id] ?? { fn: DEFAULT_PROMETHEE_FN };
    const next: PrometheeCriterionConfig = { ...cur };
    if (v === undefined) delete next[field]; else next[field] = v;
    commit(id, next);
  };

  const relWord = (i: number, k: number) => p1.rel[i][k];
  const list = (i: number, rel: 'precedes' | 'preceded' | 'incomparable' | 'indifferent') => names.filter((_, k) => k !== i && relWord(i, k) === rel);

  return (
    <>
      <div className="card">
        <div className="eyebrow">Funciones de preferencia de PROMETHEE</div>
        <h3 style={{ margin: '4px 0 6px' }}>
          {anyCustom ? 'Funciones elegidas por criterio' : 'Tipo III (en V) con q = 0 y p = rango'}
          <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}> · Brans y Vincke (1985)</span>
        </h3>
        <div className="tbl">
          <table aria-label="Función de preferencia y umbrales de cada criterio">
            <thead>
              <tr>
                <th scope="col">Criterio</th>
                <th scope="col">Función</th>
                <th scope="col" className="n">q (indiferencia)</th>
                <th scope="col" className="n">p (preferencia)</th>
                <th scope="col" className="n">σ (gaussiana)</th>
                <th scope="col" className="n">Rango de los datos</th>
                <th scope="col"><span className="sr-only">Restablecer</span></th>
              </tr>
            </thead>
            <tbody>
              {criteria.map((c, j) => {
                const spec = cfg?.[c.id];
                const fn = spec?.fn ?? DEFAULT_PROMETHEE_FN;
                const info = PROMETHEE_FN_INFO[fn];
                const pr = res.prefs[j];
                const err = validatePrefSpec(spec);
                const ref = resolvePref({ fn }, res.range[j]);
                return (
                  <tr key={c.id}>
                    <th scope="row">{labels[j]}</th>
                    <td>
                      <select aria-label={`Función de preferencia de ${c.name}`} value={fn} onChange={(e) => setFn(c.id, e.target.value as PrometheeFn)}>
                        {PROMETHEE_FNS.map((f) => <option key={f} value={f}>{`Tipo ${PROMETHEE_FN_INFO[f].type} · ${PROMETHEE_FN_INFO[f].label}${f === DEFAULT_PROMETHEE_FN ? ' (curso)' : ''}`}</option>)}
                      </select>
                    </td>
                    <td className="n">
                      {info.q
                        ? <NumField value={spec?.q} placeholder={fmt(ref.q)} label={`Umbral de indiferencia q de ${c.name}`} error={err.q} errId={`${uid}-${j}-q`} onCommit={(v) => setField(c.id, 'q', v)} />
                        : <span className="muted"><span aria-hidden="true">—</span><span className="sr-only">No aplica</span></span>}
                    </td>
                    <td className="n">
                      {info.p
                        ? <NumField value={spec?.p} placeholder={fmt(ref.p)} label={`Umbral de preferencia p de ${c.name}`} error={err.p} errId={`${uid}-${j}-p`} onCommit={(v) => setField(c.id, 'p', v)} />
                        : <span className="muted"><span aria-hidden="true">—</span><span className="sr-only">No aplica</span></span>}
                    </td>
                    <td className="n">
                      {info.s
                        ? <NumField value={spec?.s} placeholder={fmt(ref.s)} label={`Escala sigma de ${c.name}`} error={err.s} errId={`${uid}-${j}-s`} onCommit={(v) => setField(c.id, 's', v)} />
                        : <span className="muted"><span aria-hidden="true">—</span><span className="sr-only">No aplica</span></span>}
                    </td>
                    <td className="n">{fmt(pr.range)}{c.unit?.trim() ? ` ${c.unit.trim()}` : ''}</td>
                    <td>
                      <button type="button" className="btn sm" disabled={!spec} aria-label={`Restablecer la función de ${c.name} al valor del curso`} onClick={() => commit(c.id, null)}>Restablecer</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: '10px 0 0', maxWidth: '78ch' }}>
          <b>Los umbrales no se calculan a partir de los datos: los fija quien decide.</b> Dejar un campo vacío usa su valor por defecto
          (el que se ve en gris: p = rango del criterio; q, p y σ como fracciones del rango en las demás funciones). Se exige q ≤ p; un
          valor inválido se corrige y se avisa. Los umbrales van en la unidad del criterio. Si el ranking cambia al mover las funciones,
          repórtalo: es una elección de modelo, no un resultado.
          {persisted
            ? ' Se guardan con el proyecto y los ven quienes abran el enlace público.'
            : ' Aquí solo cambian en tu pantalla: no modifican el proyecto.'}
        </p>
        {res.prefs.some((x) => x.issues.length > 0) && (
          <p role="status" style={{ fontSize: 13, margin: '8px 0 0' }}>
            <b>Valores corregidos: </b>{res.prefs.flatMap((x, j) => x.issues.map((t) => `${criteria[j].name}: ${t}`)).join('; ')}.
          </p>
        )}
        <div className="ob-curves" role="group" aria-label="Curvas de la función de preferencia de cada criterio" style={{ marginTop: 12 }}>
          {criteria.map((c, j) => {
            const ds: number[] = [];
            for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) if (i !== k) ds.push(res.g[i][j] - res.g[k][j]);
            return <PreferenceCurve key={c.id} title={labels[j]} unit={c.unit?.trim() || undefined} fn={res.fn[j]} q={res.q[j]} p={res.p[j]} s={res.s[j]} range={res.range[j]} d={ds} type={types[j]} />;
          })}
        </div>
      </div>

      {n >= 2 && (
        <div className="card">
          <div className="eyebrow">PROMETHEE I y II</div>
          <h3 style={{ margin: '4px 0 6px' }}>Orden parcial (I) y flujo neto (II)</h3>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 10px', maxWidth: '78ch' }}>
            PROMETHEE II ordena por el flujo neto φ = φ⁺ − φ⁻ y siempre da un orden completo. PROMETHEE I mantiene los dos flujos por separado:
            A precede a B solo si es mejor o igual en ambos (φ⁺ mayor o igual y φ⁻ menor o igual, con una estricta); son indiferentes si
            los dos flujos coinciden; si un flujo favorece a A y el otro a B son <b>incomparables</b>.
          </p>
          <div className="tbl">
            <table aria-label="PROMETHEE I y II: flujos y relaciones de cada alternativa">
              <thead>
                <tr>
                  <th scope="col">Alternativa</th>
                  <th scope="col" className="n">φ⁺</th>
                  <th scope="col" className="n">φ⁻</th>
                  <th scope="col" className="n">φ (II)</th>
                  <th scope="col">Precede a (I)</th>
                  <th scope="col">Indiferente con</th>
                  <th scope="col">Incomparable con</th>
                </tr>
              </thead>
              <tbody>
                {names.map((nm, i) => (
                  <tr key={alternatives[i].id}>
                    <th scope="row">{nm}</th>
                    <td className="n">{n4(res.phiPlus[i])}</td>
                    <td className="n">{n4(res.phiMinus[i])}</td>
                    <td className="n">{sgn(res.phi[i])}</td>
                    <td>{list(i, 'precedes').join(', ') || '—'}</td>
                    <td>{list(i, 'indifferent').join(', ') || '—'}</td>
                    <td>{list(i, 'incomparable').join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 13, margin: '10px 0 0', maxWidth: '78ch' }} role="status">
            {p1.incomparable.length === 0
              ? `PROMETHEE I da un orden completo: no hay pares incomparables${p1.indifferent.length ? ` (${p1.indifferent.length} par${p1.indifferent.length === 1 ? '' : 'es'} indiferente${p1.indifferent.length === 1 ? '' : 's'})` : ''}, así que coincide con el orden de PROMETHEE II.`
              : `PROMETHEE I deja ${p1.incomparable.length} par${p1.incomparable.length === 1 ? '' : 'es'} sin relación: ${listNames(p1.incomparable.map(([i, k]) => `${names[i]} y ${names[k]}`))}. PROMETHEE II los ordena por φ, pero con esas funciones y umbrales la diferencia depende de cómo se combinen los flujos.`}
          </p>
        </div>
      )}
    </>
  );
}
