'use client';

import { useMemo, useRef, useState } from 'react';
import { buildMethodologyParagraph, type MethodologyInput, type MethodologyLang } from '@/lib/methodologyText';

/** Párrafo de metodología listo para pegar (es/en), generado desde el estado del proyecto. «Copiar» usa el portapapeles y, si el
 * navegador lo niega, deja el texto seleccionado para copiarlo a mano con Ctrl/Cmd+C. */
export default function MethodologyParagraph({ input }: { input: MethodologyInput }) {
  const [lang, setLang] = useState<MethodologyLang>('es');
  const [msg, setMsg] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const text = useMemo(() => buildMethodologyParagraph(input, lang), [input, lang]);

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('sin clipboard');
      await navigator.clipboard.writeText(text);
      setMsg(lang === 'es' ? 'Párrafo copiado' : 'Paragraph copied');
      setTimeout(() => setMsg(''), 6000);
      return;
    } catch {
      // Fallback: seleccionar el texto y probar el comando clásico; si tampoco, queda seleccionado para Ctrl/Cmd+C.
      const el = ref.current;
      el?.focus();
      el?.select();
      let done = false;
      try { done = document.execCommand('copy'); } catch { done = false; }
      setMsg(done ? 'Párrafo copiado' : 'No se pudo copiar solo: el texto quedó seleccionado, cópialo con Ctrl/Cmd+C');
    }
    // El aviso de fallo (instrucciones para copiar a mano) no desaparece solo: queda hasta el siguiente intento.
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom: 4 }}>Párrafo de metodología</h3>
      <p className="muted" style={{ fontSize: 13, margin: '0 0 10px', maxWidth: '72ch' }}>
        Se genera con el estado actual del proyecto (método, pesos, CR y parámetros) y la versión de la plataforma. Revísalo antes de pegarlo: si cambias algo, se actualiza solo.
      </p>
      <div className="sheetnav" role="group" aria-label="Idioma del párrafo">
        <button type="button" aria-pressed={lang === 'es'} onClick={() => setLang('es')}><b>Español</b></button>
        <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}><b>English</b></button>
      </div>
      <textarea
        ref={ref} readOnly value={text} rows={7} aria-label="Párrafo de metodología"
        style={{ width: '100%', marginTop: 10, fontSize: 13.5, lineHeight: 1.5 }}
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="acts" style={{ marginTop: 8, alignItems: 'center' }}>
        <button type="button" className="btn sm" onClick={copy}>Copiar</button>
        <span role="status" className="muted" style={{ fontSize: 12.5 }}>{msg}</span>
      </div>
    </div>
  );
}
