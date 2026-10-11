'use client';

/** Pestaña «Compartir» de un proyecto de decisión (no espacial), con el mismo orden que la del mapa
 * (GeoSharePanel): Enlace público · Qué ve quien abra el enlace · Descargas. */
import { useId, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import { PublicLinkBlock } from './ShareDialog';
import { methodBadge, publicSees, shareStateText } from '@/lib/shareUi';
import type { Method } from '@/lib/types';
import './share.css';

type Props = {
  isPublic: boolean;
  token: string;
  title: string;
  fileBase: string;
  method: Method;
  objectiveWeights: boolean;
  weightsLabel: string;
  onTogglePublic: (on: boolean) => void;
  /** Genera un enlace nuevo (el anterior deja de funcionar). */
  onRegenerate: () => void;
  onExcel: () => void;
  onPrioExcel: () => void;
};

export default function ShareTab(p: Props) {
  const uid = useId();
  const [confirm, setConfirm] = useState(false);
  const url = typeof window === 'undefined' ? '' : `${window.location.origin}/p/${p.token}`;
  const state = shareStateText(p.isPublic, 'decision');
  const see = publicSees({ kind: 'decision', method: p.method, objectiveWeights: p.objectiveWeights, weightsLabel: p.weightsLabel });
  const label = methodBadge(p.method).label;

  return (
    <div className="panel">
      <section className="card form sh-card" aria-labelledby={`${uid}-pub`}>
        <div className="sh-head">
          <h3 id={`${uid}-pub`}>Enlace público</h3>
          <span className={'sh-state' + (p.isPublic ? ' on' : '')}><span className="dot" aria-hidden="true" />{state.label}</span>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>{state.detail}</p>
        <label className="sh-switch">
          <input type="checkbox" checked={p.isPublic} onChange={(e) => p.onTogglePublic(e.target.checked)} /> Hacer público con enlace
        </label>
        {p.isPublic && (
          <>
            <PublicLinkBlock url={url} title={p.title} fileBase={p.fileBase} qrSubheading="Escanea para ver los resultados" />
            <div className="sh-acts">
              <button type="button" className="btn sm" onClick={() => setConfirm(true)}>Generar enlace nuevo</button>
            </div>
          </>
        )}
      </section>

      <section className="card form sh-card" aria-labelledby={`${uid}-see`}>
        <h3 id={`${uid}-see`}>Qué ve quien abra el enlace</h3>
        <div className="sh-grid">
          <div>
            <b>Sí verá</b>
            <ul className="sh-list">{see.sees.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
          <div>
            <b>No verá</b>
            <ul className="sh-list no">{see.hidden.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Es una vista de solo lectura: no puede cambiar nada de tu proyecto.</p>
      </section>

      <section className="card form sh-card" aria-labelledby={`${uid}-dl`}>
        <h3 id={`${uid}-dl`}>Descargas</h3>
        <div className="sh-dl">
          <div>
            <b>Excel del método ({label})</b>
            <p>{p.method === 'ahp'
              ? 'Notas, Criterios, una hoja por criterio y Síntesis, con fórmulas vivas.'
              : `Notas, Criterios, Matriz de decisión y la hoja de ${label}, con fórmulas vivas.`}</p>
          </div>
          <button type="button" className="btn primary sm" onClick={p.onExcel}>Descargar Excel</button>
        </div>
        <div className="sh-dl">
          <div>
            <b>Excel de la priorización de criterios</b>
            <p>La Sesión 1, en un archivo aparte, para no bajarla cada vez que solo hace falta el método.</p>
          </div>
          <button type="button" className="btn sm" onClick={p.onPrioExcel}>Descargar Excel de priorización</button>
        </div>
      </section>

      {confirm && (
        <ConfirmDialog
          title="¿Generar un enlace nuevo?"
          description={<>El enlace actual y su QR <b>dejan de funcionar</b> para quien ya los tenga. Tendrás que compartir el enlace nuevo.</>}
          confirmLabel="Generar enlace nuevo"
          onConfirm={() => { p.onRegenerate(); setConfirm(false); }}
          onClose={() => setConfirm(false)}
        />
      )}
    </div>
  );
}
