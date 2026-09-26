'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Alternative, Criterion, Method } from '@/lib/types';
import { friendlyError } from '@/lib/errors';
import {
  CRIT_SHEET, altSheet, analyze, answeredCount, expertMatrix, pairsOf, phrase, getV, setV, sheetItems,
  type JMap,
} from '@/lib/ahp';

type Props = {
  criteria: Criterion[];
  alternatives: Alternative[];
  /** Cualquier método distinto de 'ahp': el experto solo pesa criterios (sheet 'crit'); las
   * alternativas se comparan con una matriz de decisión cuantitativa (DecisionMatrixEditor), no de a
   * pares. Default 'ahp'. */
  method?: Method;
  /** Juicios iniciales de este experto: hoja -> (clave de par -> valor). */
  initial: Record<string, JMap>;
  readOnly?: boolean;
  /** Guarda un juicio (value null = borrar). Debe lanzar/rechazar si falla. */
  onSet: (sheet: string, pairKey: string, value: number | null) => Promise<void>;
  /** Avisa al padre de cada cambio local (para actualizar resultados en vivo). */
  onLocalChange?: (sheet: string, pairKey: string, value: number | null) => void;
};

type Save = 'idle' | 'saving' | 'saved' | 'error';

export default function JudgmentEditor({ criteria, alternatives, method = 'ahp', initial, readOnly, onSet, onLocalChange }: Props) {
  const [local, setLocal] = useState<Record<string, JMap>>(initial);
  const [sheet, setSheet] = useState(CRIT_SHEET);
  const [save, setSave] = useState<Save>('idle');
  const [err, setErr] = useState('');
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const inflight = useRef(0);

  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  const sheets = useMemo(
    () => (method === 'ahp'
      ? [{ key: CRIT_SHEET, label: 'Criterios' }, ...criteria.map((c) => ({ key: altSheet(c.id), label: c.name }))]
      : [{ key: CRIT_SHEET, label: 'Criterios' }]),
    [criteria, method],
  );
  const cur = sheets.find((s) => s.key === sheet) ?? sheets[0];
  const items = sheetItems(cur.key, criteria, alternatives);
  const map = local[cur.key] ?? {};
  const pairs = pairsOf(items.length);
  const critId = cur.key === CRIT_SHEET ? null : cur.key.slice(4);
  const hint = critId ? criteria.find((c) => c.id === critId)?.hint : undefined;

  function commit(sh: string, key: string, value: number | null) {
    inflight.current++;
    setSave('saving');
    onSet(sh, key, value)
      .then(() => { if (--inflight.current === 0) setSave('saved'); })
      .catch((e: unknown) => { inflight.current = Math.max(0, inflight.current - 1); setSave('error'); setErr(friendlyError(e, 'No se pudo guardar.')); });
  }

  function change(i: number, j: number, v: number) {
    if (readOnly) return;
    const a = items[i].id, b = items[j].id, key = a + '-' + b, sh = cur.key;
    setLocal((prev) => ({ ...prev, [sh]: setV(prev[sh] ?? {}, a, b, v) }));
    onLocalChange?.(sh, key, v);
    clearTimeout(timers.current[sh + '|' + key]);
    timers.current[sh + '|' + key] = setTimeout(() => commit(sh, key, v), 450);
  }

  function clearSheet() {
    if (readOnly) return;
    const sh = cur.key, keys = Object.keys(local[sh] ?? {});
    setLocal((prev) => ({ ...prev, [sh]: {} }));
    keys.forEach((k) => { onLocalChange?.(sh, k, null); commit(sh, k, null); });
  }

  const mine = analyze(expertMatrix(items, map));
  const done = answeredCount(items, map);
  const max = Math.max(...mine.w, 0.0001) * 1.12;

  return (
    <div className="panel">
      <div className="sheetnav" role="group" aria-label="Hojas">
        {sheets.map((s) => {
          const it = sheetItems(s.key, criteria, alternatives);
          const m = local[s.key] ?? {};
          const n = answeredCount(it, m), tot = pairsOf(it.length).length;
          return (
            <button key={s.key} type="button" aria-pressed={s.key === cur.key} onClick={() => setSheet(s.key)}>
              <b>{s.label}</b>
              <span>{n}/{tot} pares{n === tot && tot > 0 ? ' ✓' : ''}</span>
            </button>
          );
        })}
      </div>

      <div className="hint">
        {cur.key === CRIT_SHEET
          ? '¿Qué criterio es más importante para el objetivo? Mueve cada control hacia el que gana; el centro es «igual».'
          : `Respecto a «${cur.label}», ¿qué estrategia es mejor? ${hint ?? ''}`}
      </div>

      <div className="pairs">
        {pairs.map(([i, j]) => {
          const key = items[i].id + '-' + items[j].id;
          const val = getV(map, items[i].id, items[j].id);
          return (
            <div key={key} className={'pair' + (val == null ? ' un' : '')}>
              <div className="names"><span>{items[i].name}</span><span>{items[j].name}</span></div>
              <input
                type="range" min={-8} max={8} step={1} value={val ?? 0} disabled={readOnly}
                aria-label={`${items[i].name} contra ${items[j].name}`}
                onChange={(e) => change(i, j, Number(e.target.value))}
              />
              <div className="ticks" aria-hidden="true">
                {[9, 7, 5, 3, 1, 3, 5, 7, 9].map((t, k) => <span key={k}>{t}</span>)}
              </div>
              <div className="read">{phrase(items, i, j, val)}</div>
            </div>
          );
        })}
      </div>

      <div className="card res">
        <h3>Tu resultado en esta hoja ({done}/{pairs.length} pares)</h3>
        <div className="chips">
          <span className={'pill' + (mine.ok ? '' : ' warn')}>
            {mine.ok ? 'Consistente' : 'Inconsistente'} · CR {mine.cr.toFixed(3)} {mine.ok ? '< 0.10' : '≥ 0.10: revisa tus juicios'}
          </span>
          <span className="savest" aria-live="polite">
            {save === 'saving' && 'Guardando…'}{save === 'saved' && '✓ Guardado'}{save === 'error' && `Error: ${err}`}
          </span>
        </div>
        {items.map((it, i) => (
          <div className="wbar" key={it.id}>
            <span className="nm">{it.name}</span>
            <div className="track">
              <div className="fill" style={{ width: `${(mine.w[i] / max) * 100}%` }} />
              <span className="val" style={{ left: `${(mine.w[i] / max) * 100}%` }}>{(mine.w[i] ?? 0).toFixed(3)}</span>
            </div>
          </div>
        ))}
        {!readOnly && done > 0 && <div><button type="button" className="btn sm" onClick={clearSheet}>Borrar mis juicios de esta hoja</button></div>}
      </div>
    </div>
  );
}
