'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Topbar from '@/components/Topbar';
import ScientificMethodModal, { METHOD_SPECS, type MethodKey } from '@/components/ScientificMethodModal';
import { FAMILY, METHOD_GUIDE, METHOD_ORDER, WEIGHTING_GUIDE, WEIGHTING_ORDER } from '@/lib/methodGuide';
import { WEIGHTING_REFS } from '@/lib/references';
import type { WeightingMethod } from '@/lib/types';

type QId = 'q1' | 'q1b' | 'q2' | 'q3';
type Step = QId | MethodKey;

interface Question {
  title: string;
  hint: string;
  options: { title: string; desc: string; target: Step; tag: string }[];
}

// El árbol tiene 4 preguntas como máximo (ramas de 1 a 4). Cubre los 7 métodos: q1 → AHP o Fuzzy TOPSIS;
// q1b → SAW; q2 → ELECTRE; q3 → VIKOR / TOPSIS / PROMETHEE.
const MAX_Q = 4;
const QUESTIONS: Record<QId, Question> = {
  q1: {
    title: '¿Qué información tienes para comparar tus alternativas?',
    hint: 'Elige la opción que mejor describa los datos de tu problema.',
    options: [
      { title: 'Números medidos para cada alternativa en cada criterio', desc: 'Precios, distancias en km, meses de batería, consumos, tasas técnicas…', target: 'q1b', tag: 'Datos exactos' },
      { title: 'Solo opiniones o percepciones («buena», «regular», «poco confiable»)', desc: 'No hay una medida numérica, pero sí puedes calificar cada alternativa con una etiqueta.', target: 'fuzzy_topsis', tag: 'Etiquetas difusas' },
      { title: 'Nada medido: mis expertos comparan las alternativas de a pares', desc: '«¿Cuál es mejor en este criterio y cuánto mejor?», con la escala 1–9 de Saaty.', target: 'ahp', tag: 'Comparación por pares' },
    ],
  },
  q1b: {
    title: '¿Qué tan importante es que el argumento sea simple de explicar?',
    hint: 'Piensa ante quién presentarás los resultados: un comité, una comunidad o un jurado.',
    options: [
      { title: 'Muy importante: que cualquiera pueda auditarlo', desc: 'Prefiero normalizar los datos y sumar peso × valor, como en una hoja de cálculo.', target: 'saw', tag: 'Suma directa' },
      { title: 'No es lo prioritario: prefiero un método más fino', desc: 'Acepto algoritmos con más parámetros si capturan mejor mi problema.', target: 'q2', tag: 'Más elaborado' },
    ],
  },
  q2: {
    title: '¿Está bien que el método diga que dos alternativas no se pueden comparar?',
    hint: 'Los métodos de sobreclasificación pueden dejar alternativas «incomparables»; los demás siempre dan un orden.',
    options: [
      { title: 'Sí, acepto la incomparabilidad', desc: 'No quiero que una nota muy buena compense una inaceptable: prefiero no forzar un orden.', target: 'electre', tag: 'No compensatorio' },
      { title: 'No, necesito un orden completo (1.º, 2.º, 3.º…)', desc: 'Todas las alternativas deben quedar en una posición definida.', target: 'q3', tag: 'Orden total' },
    ],
  },
  q3: {
    title: '¿Cuál es el principio rector de tu problema?',
    hint: 'Tres formas distintas de construir un ranking completo con datos numéricos.',
    options: [
      { title: 'Buscar un compromiso entre partes en conflicto', desc: 'Que la elegida no deje a nadie muy perjudicado, aunque no sea la mejor en promedio.', target: 'vikor', tag: 'Compromiso' },
      { title: 'Estar cerca de lo mejor y lejos de lo peor', desc: 'La alternativa más próxima a la combinación ideal y más lejana a la peor combinación.', target: 'topsis', tag: 'Distancia al ideal' },
      { title: 'Que la intensidad de cada diferencia importe', desc: 'Compara cada par de alternativas y pesa cuánto mejor es una que otra en cada criterio.', target: 'promethee', tag: 'Flujos netos' },
    ],
  },
};

const isQuestion = (s: Step): s is QId => s === 'q1' || s === 'q1b' || s === 'q2' || s === 'q3';

export default function MetodoClient({ loggedIn, userEmail }: { loggedIn: boolean; userEmail?: string }) {
  // Historial de pasos: permite volver a la pregunta anterior sin reiniciar todo el cuestionario.
  const [path, setPath] = useState<Step[]>(['q1']);
  const [weighting, setWeighting] = useState<WeightingMethod>('ahp');
  const [modalMethod, setModalMethod] = useState<MethodKey | null>(null);
  const step = path[path.length - 1];
  const headRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  // Al cambiar de pregunta o de resultado el foco pasa al título nuevo: quien navega con teclado o lector de
  // pantalla no se queda sobre un botón que ya no existe. No se mueve en la primera carga.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    headRef.current?.focus();
  }, [step]);

  function go(t: Step) {
    if (!isQuestion(t)) setWeighting('ahp');
    setPath((p) => [...p, t]);
  }
  const back = () => setPath((p) => (p.length > 1 ? p.slice(0, -1) : p));
  const restart = () => setPath(['q1']);

  function createUrl(method?: MethodKey) {
    const params = new URLSearchParams();
    if (method) {
      params.set('new_method', method);
      if (method !== 'ahp' && weighting !== 'ahp') params.set('new_weighting', weighting);
    }
    const qs = params.size ? `?${params}` : '';
    const target = `/dashboard${qs}#nuevo`;
    return loggedIn ? target : `/login?next=${encodeURIComponent(target)}`;
  }

  const q = isQuestion(step) ? QUESTIONS[step] : null;
  const method = !isQuestion(step) ? step : null;
  const guide = method ? METHOD_GUIDE[method] : null;
  const spec = method ? METHOD_SPECS[method] : null;
  const canChooseWeights = !!method && method !== 'ahp';
  const activeW: WeightingMethod = canChooseWeights ? weighting : 'ahp';

  return (
    <div className="wrap">
      <Topbar badge="TEORÍA" subtitle="← Ir al inicio" loggedIn={loggedIn} userEmail={userEmail} />

      <div className="ttl">
        <div className="eyebrow">Guía de selección</div>
        <h1>¿Qué método multicriterio debo usar?</h1>
        <p className="muted lnote" style={{ marginTop: 10, fontSize: 14.5, maxWidth: '62ch' }}>
          Son dos decisiones separadas. Primero eliges <b>cómo comparar tus alternativas</b> (siete métodos; te ayudamos con unas
          pocas preguntas). Después eliges <b>cómo pesar los criterios</b>: con juicios de expertos (AHP) o de forma objetiva
          con los datos (CRITIC o Entropía).
        </p>
      </div>

      <div className="card mcallout">
        <div>
          <b>¿Tu pregunta es «dónde»?</b>
          <p className="muted">
            Si vas a ubicar o zonificar algo en un territorio (una boya, una finca solar, un cultivo), no eliges entre 3–9
            alternativas: eliges entre las celdas de un mapa. Eso es un <b>mapa de aptitud (AHP + SIG)</b>, con los mismos
            pesos AHP de tus expertos.
          </p>
        </div>
        <Link className="btn" href="/tutorial#mapas">Ver cómo se hace</Link>
      </div>

      <section className="wz-wrap" aria-labelledby="wz-h">
        <h2 className="sr-only" id="wz-h">Cuestionario de selección de método</h2>

        {q && (
          <div className="card wz">
            <div className="wz-top">
              <span className="wz-step">Pregunta {path.length} <span className="muted">de hasta {MAX_Q}</span></span>
              <span className="wz-dots" aria-hidden="true">
                {Array.from({ length: MAX_Q }, (_, i) => <i key={i} className={i < path.length ? 'on' : ''} />)}
              </span>
            </div>
            <div>
              <h3 className="wz-q" tabIndex={-1} ref={headRef}>{q.title}</h3>
              <p className="muted wz-hint">{q.hint}</p>
            </div>
            <div className="wz-opts">
              {q.options.map((o, i) => (
                <button key={o.title} type="button" className="wz-opt" onClick={() => go(o.target)}>
                  <span className="wz-badge" aria-hidden="true">{String.fromCharCode(65 + i)}</span>
                  <span className="wz-body">
                    <span className="wz-title">{o.title}</span>
                    <span className="wz-desc">{o.desc}</span>
                    <span className="wz-tag">{o.tag}</span>
                  </span>
                  <span className="wz-arrow" aria-hidden="true">→</span>
                </button>
              ))}
            </div>
            {path.length > 1 && (
              <div className="wz-foot">
                <button className="btn sm" type="button" onClick={back}>← Pregunta anterior</button>
                <button className="btn sm" type="button" onClick={restart}>Empezar de nuevo</button>
              </div>
            )}
          </div>
        )}

        {guide && spec && method && (
          <div className="card rec" data-method={method} style={{ ['--fam' as string]: `var(--fam-${guide.family})` }}>
            <div className="rec-top">
              <span className="rec-fam">{FAMILY[guide.family]}</span>
              <span className="muted rec-lbl">Método recomendado</span>
              <button className="btn sm" type="button" onClick={restart} style={{ marginLeft: 'auto' }}>Empezar de nuevo</button>
            </div>

            <div>
              <h3 className="rec-name" tabIndex={-1} ref={headRef}>{spec.name}</h3>
              <p className="rec-sum">{spec.summary}</p>
            </div>

            <dl className="rec-grid">
              <div><dt>Úsalo cuando</dt><dd>{guide.when}</dd></div>
              <div><dt>Ten en cuenta</dt><dd>{guide.watch}</dd></div>
              <div><dt>Necesita</dt><dd>{guide.input}</dd></div>
              <div><dt>Resultado</dt><dd>{guide.result}</dd></div>
            </dl>

            {/* Segunda decisión: pesos. Con AHP no hay elección (pesa siempre por pares). */}
            <div className="rec-w">
              <h4>Ahora: ¿cómo pesas los criterios?</h4>
              {!canChooseWeights ? (
                <p className="rec-wnote">
                  Con <b>AHP</b> los pesos siempre salen de los juicios por pares de tus expertos: no hay que elegir. Si quisieras
                  pesos objetivos calculados desde los datos, necesitas un método que use matriz de decisión (todos los demás).
                </p>
              ) : (
                <>
                  <p className="rec-wnote">
                    Regla rápida: <b>¿tienes expertos que puedan opinar?</b> Usa AHP. <b>¿Solo tienes los datos?</b> Usa CRITIC, o
                    Entropía si prefieres algo más simple. Puedes cambiarlo después en el proyecto.
                  </p>
                  <div className="rec-wopts" role="radiogroup" aria-label="Método de ponderación de criterios">
                    {WEIGHTING_ORDER.map((k) => {
                      const g = WEIGHTING_GUIDE[k];
                      const on = weighting === k;
                      return (
                        <label key={k} className={'rec-wopt' + (on ? ' on' : '')}>
                          <input type="radio" name="weighting" value={k} checked={on} onChange={() => setWeighting(k)} />
                          <b>{g.label}</b>
                          <span className="sub">{g.short}</span>
                          <span className="whn">{g.when}</span>
                          <span className="nds"><i>Necesita</i> {g.needs}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="rec-wcaveat" aria-live="polite">
                    <b>{WEIGHTING_REFS[activeW].label}.</b> {WEIGHTING_REFS[activeW].caveat}
                    {method === 'fuzzy_topsis' && activeW !== 'ahp' && (
                      <> Con Fuzzy TOPSIS, CRITIC y Entropía se calculan sobre el valor central de cada etiqueta; el método original (Chen, 2000) usa pesos dados por los decisores, así que AHP es lo más cercano a ese planteamiento.</>
                    )}
                    <span className="rec-ref">{WEIGHTING_REFS[activeW].apa[0]}</span>
                  </div>
                </>
              )}
            </div>

            <div className="rec-ref-box">
              <span className="rec-ref-lbl">Referencia del método (APA 7.ª)</span>
              <span className="rec-ref-txt">{spec.citationApa}</span>
            </div>

            <div className="acts rec-acts">
              <button type="button" className="btn sm" onClick={() => setModalMethod(method)}>Ver fórmulas →</button>
              <a href={spec.doiUrl} target="_blank" rel="noreferrer" className="btn sm">Abrir artículo (DOI) ↗<span className="sr-only"> (se abre en otra pestaña)</span></a>
              <Link href={createUrl(method)} className="btn primary rec-cta">Crear proyecto con {guide.label}{canChooseWeights && weighting !== 'ahp' ? ` y pesos ${WEIGHTING_GUIDE[weighting].label}` : ''} →</Link>
            </div>
            <div className="acts">
              <button className="btn sm" type="button" onClick={back}>← Pregunta anterior</button>
            </div>
          </div>
        )}
      </section>

      {/* Comparación de los 7 métodos, una fila por método (más legible que una matriz con celdas combinadas). */}
      <section className="card mcard" aria-labelledby="cmp-h">
        <h3 id="cmp-h">Los 7 métodos, lado a lado</h3>
        <p className="muted">Qué necesita cada uno, qué entrega y cuándo conviene.</p>
        <div className="tbl" tabIndex={0} role="region" aria-label="Tabla comparativa de los siete métodos (se desplaza horizontalmente)">
          <table className="cmp">
            <thead>
              <tr>
                <th scope="col">Método</th>
                <th scope="col">Compara alternativas con</th>
                <th scope="col">Resultado</th>
                <th scope="col">Cuándo conviene</th>
                <th scope="col">Ten en cuenta</th>
              </tr>
            </thead>
            <tbody>
              {METHOD_ORDER.map((k) => {
                const g = METHOD_GUIDE[k];
                return (
                  <tr key={k} data-method={k}>
                    <th scope="row"><span className="cmp-name"><i aria-hidden="true" />{g.label}</span><span className="cmp-fam">{FAMILY[g.family]}</span></th>
                    <td>{g.input}</td>
                    <td>{g.result}</td>
                    <td>{g.when}</td>
                    <td>{g.watch}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted mnote">
          Pesos de los criterios: AHP usa siempre juicios de expertos; los otros seis pueden usar AHP, CRITIC o Entropía.
        </p>
      </section>

      <section className="card mcard" aria-labelledby="w-h">
        <h3 id="w-h">Pesos de los criterios: AHP, CRITIC o Entropía</h3>
        <p className="muted">
          Los pesos objetivos no miden qué tan importante es un criterio para ti, sino cuánto se diferencian tus alternativas en él.
          Úsalos como respaldo o cuando no hay expertos, no como sustituto de una decisión de valores.
        </p>
        <div className="wref-grid">
          {WEIGHTING_ORDER.map((k) => {
            const r = WEIGHTING_REFS[k];
            const g = WEIGHTING_GUIDE[k];
            return (
              <article className="wref" key={k}>
                <h4>{r.label}</h4>
                <p>{r.how}</p>
                <p><b>Cuándo conviene.</b> {g.when}</p>
                <p><b>Necesita.</b> {g.needs}</p>
                <p><b>Ojo.</b> {r.caveat}</p>
                <ul className="wref-apa">{r.apa.map((a) => <li key={a}>{a}</li>)}</ul>
              </article>
            );
          })}
        </div>
      </section>

      <section className="card mcard" aria-labelledby="bib-h">
        <h3 id="bib-h">Bibliografía de los métodos</h3>
        <p className="muted">Publicaciones de referencia (formato APA 7.ª). Las fórmulas de cada método están en «Fórmulas».</p>
        <div className="bib">
          {METHOD_ORDER.map((k) => {
            const s = METHOD_SPECS[k];
            return (
              <div className="bib-item" key={k} data-method={k}>
                <div className="bib-txt">
                  <b>{s.name}</b>
                  <span>{s.citationApa}</span>
                </div>
                <div className="bib-acts">
                  <button type="button" className="btn sm" onClick={() => setModalMethod(k)}>Fórmulas</button>
                  <a href={s.doiUrl} target="_blank" rel="noreferrer" className="btn sm">Abrir (DOI) ↗<span className="sr-only"> (se abre en otra pestaña)</span></a>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="lcta" style={{ marginBlock: '36px 28px' }}>
        <h2>¿Listo para modelar tu caso?</h2>
        <p>Crea tu proyecto, define criterios y alternativas y calcula el resultado con el método que elijas.</p>
        <div className="acts">
          <Link className="btn primary" href={createUrl()}>{loggedIn ? 'Ir a mis proyectos' : 'Entrar o crear cuenta'}</Link>
          <Link className="btn" href="/tutorial">Ver el paso a paso</Link>
        </div>
      </div>

      {modalMethod && <ScientificMethodModal methodKey={modalMethod} onClose={() => setModalMethod(null)} />}
    </div>
  );
}
