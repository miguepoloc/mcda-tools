'use client';

/** Insignia del método de decisión del proyecto: nombre completo + familia en texto y el color del método como
 * acompañante (punto y borde), nunca como único indicador. `MethodChip` es la versión de solo lectura (títulos,
 * vista pública); `MethodBadgeMenu` abre una frase de qué es el método y el atajo para cambiarlo. */
import type { CSSProperties } from 'react';
import type { Method } from '@/lib/types';
import { methodBadge } from '@/lib/shareUi';
import SharePopover from './SharePopover';

const colorStyle = (m: Method) => ({ '--sh-color': methodBadge(m).color }) as CSSProperties;

export function MethodChip({ method, label = 'Método' }: { method: Method; label?: string }) {
  const b = methodBadge(method);
  return (
    <span className="sh-chip" style={colorStyle(method)}>
      <span className="sh-dot" aria-hidden="true" />
      <span>{label}: {b.label}</span>
      <span className="sh-fam">· {b.family}</span>
    </span>
  );
}

export function MethodBadgeMenu({ method, onChangeMethod }: { method: Method; onChangeMethod: () => void }) {
  const b = methodBadge(method);
  return (
    <SharePopover
      triggerClassName="sh-trigger"
      style={colorStyle(method)}
      triggerLabel={`Método de decisión: ${b.label}, ${b.family}. Abrir detalles`}
      trigger={<>
        <span className="sh-dot" aria-hidden="true" />
        <span>Método: {b.label}</span>
        <span className="sh-fam">· {b.family}</span>
        <span className="sh-caret" aria-hidden="true">▾</span>
      </>}
    >
      {(close) => (
        <>
          <h3>{b.label} <span className="sh-fam">· {b.family}</span></h3>
          <p>{b.what}</p>
          <p className="sh-muted"><b>Con qué datos:</b> {b.input}</p>
          <p className="sh-muted"><b>Qué entrega:</b> {b.result}</p>
          <div className="sh-acts">
            <button type="button" className="btn sm primary" onClick={() => { close(); onChangeMethod(); }}>Cambiar el método</button>
            <a className="btn sm" href="/metodo" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>¿Cuál me conviene? (se abre aparte)</a>
          </div>
        </>
      )}
    </SharePopover>
  );
}
