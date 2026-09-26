'use client';

import { useEffect } from 'react';

/** Red de seguridad de «Mi cuenta»: si algo lanza al pintar (una respuesta inesperada de la base, un dato raro),
 * se muestra esto en vez de la pantalla de error genérica de Next. No se enseña el mensaje técnico: puede traer
 * nombres internos; va a la consola para quien depure. */
export default function CuentaError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[cuenta]', error); }, [error]);
  return (
    <div className="wrap">
      <div className="panel">
        <div className="banner" role="alert">
          <span><b>El página no pudo mostrarse.</b> Es un fallo de esta pantalla; tus datos no se tocaron.{error.digest ? ` (ref. ${error.digest})` : ''}</span>
          <span className="acts">
            <button type="button" className="btn sm" onClick={reset}>Reintentar</button>
            <a className="btn sm" href="/dashboard">Ir a mis proyectos</a>
          </span>
        </div>
      </div>
    </div>
  );
}
