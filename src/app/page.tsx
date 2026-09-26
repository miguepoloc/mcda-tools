import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import Topbar from '@/components/Topbar';
import { FAMILY, METHOD_GUIDE, METHOD_ORDER, WEIGHTING_GUIDE, WEIGHTING_ORDER } from '@/lib/methodGuide';
import { WEIGHTING_REFS } from '@/lib/references';

export const metadata: Metadata = {
  title: 'Plataforma MCDA · Toma de decisiones multicriterio',
  description:
    'Pesa tus criterios con expertos (AHP) o con los datos (CRITIC, Entropía), compara alternativas con 7 métodos multicriterio y exporta el resultado a Excel.',
};

const famVar = (v: string): CSSProperties => ({ '--fam': `var(--fam-${v})` } as CSSProperties);

export default async function Home() {
  const supabase = await createClient();
  let logged = false;
  let userEmail: string | undefined;
  try {
    const { data } = await supabase.auth.getUser();
    logged = !!data.user;
    userEmail = data.user?.email;
  } catch { /* sin configurar */ }
  const primaryHref = logged ? '/dashboard' : '/login';
  const primaryLabel = logged ? 'Ir a mis proyectos' : 'Entrar o crear cuenta';

  return (
    <>
      <div className="wrap">
        <Topbar badge="v2.0" subtitle="Ingeniería de Decisión" loggedIn={logged} userEmail={userEmail} />

        <div className="lhero">
          <div>
            <div className="eyebrow">Toma de Decisiones Multicriterio</div>
            <h1>Pesa lo que importa. Decide con números, no con corazonadas.</h1>
            <p className="lead">
              Define tus criterios y alternativas, pesa los criterios con juicios de expertos (o deja que los datos lo
              hagan) y elige entre siete métodos para compararlas. Ves los pesos, qué tan consistentes son los juicios
              y el resultado final, listo para exportar o compartir.
            </p>
            <div className="acts" style={{ marginTop: 22 }}>
              <Link className="btn primary" href={primaryHref}>{primaryLabel}</Link>
              <Link className="btn" href="/metodo">¿Qué método uso?</Link>
            </div>
            <p className="muted lnote">
              ¿Eres experto y te compartieron un enlace? No necesitas cuenta: ábrelo y responde directamente.
            </p>
            <ul className="lstrip" aria-label="En cifras">
              <li className="fact"><b>7 métodos</b><span>para comparar alternativas</span></li>
              <li className="fact"><b>3 formas</b><span>de pesar los criterios</span></li>
              <li className="fact"><b>0 cuentas</b><span>para que un experto responda</span></li>
            </ul>
          </div>

          <div className="lmock" role="img" aria-label="Ejemplo ilustrativo: un juicio por pares entre LoRaWAN y Sigfox, con el resultado calculado al lado.">
            <span className="tag">Así se ve un juicio</span>
            <div className="pair">
              <div className="names"><span>LoRaWAN</span><span>Sigfox</span></div>
              <input type="range" min={-8} max={8} value={4} disabled tabIndex={-1} aria-hidden="true" readOnly />
              <div className="ticks" aria-hidden="true"><span>9</span><span>7</span><span>5</span><span>3</span><span>1</span><span>3</span><span>5</span><span>7</span><span>9</span></div>
              <div className="read">5 · Sigfox es fuertemente preferida que LoRaWAN.</div>
            </div>
            <hr />
            <span className="tag">Y el resultado, en vivo</span>
            <div className="wbar"><span className="nm">Sigfox</span><div className="track"><div className="fill" style={{ width: '78%' }} /><span className="val" style={{ left: '78%' }}>0.401</span></div></div>
            <div className="wbar"><span className="nm">LoRaWAN</span><div className="track"><div className="fill" style={{ width: '51%' }} /><span className="val" style={{ left: '51%' }}>0.263</span></div></div>
            <div className="wbar"><span className="nm">GSM/GPRS</span><div className="track"><div className="fill" style={{ width: '38%' }} /><span className="val" style={{ left: '38%' }}>0.197</span></div></div>
            <span className="lmock-cap">Ejemplo ilustrativo del caso guiado del curso (tecnologías IoT), no un resultado real.</span>
          </div>
        </div>
      </div>

      <section className="lsection alt">
        <div className="wrap">
          <div className="lhead">
            <div className="eyebrow">El problema</div>
            <h2>Calificar del 1 al 5 no es lo mismo que decidir</h2>
            <p>
              Repartir puntajes a ojo entre varios criterios esconde una trampa: es fácil calificar dos cosas
              distintas con el mismo número sin darte cuenta de que una te importa mucho más que la otra. Comparar
              de a pares — «¿A o B? ¿cuánto más?» — obliga a esa decisión explícita una y otra vez, y de ahí salen
              pesos que sí reflejan tu criterio real, con un número (CR) que te avisa si te contradijiste. Y si no
              tienes expertos, los pesos también pueden salir de los propios datos (CRITIC o Entropía). Después, lo
              único que cambia entre los siete métodos es cómo comparan las alternativas.
            </p>
          </div>
        </div>
      </section>

      <section className="lsection">
        <div className="wrap">
          <div className="lhead">
            <div className="eyebrow">Cómo funciona</div>
            <h2>De la idea al resultado, en cuatro pasos</h2>
            <p>El mismo flujo que verías en las sesiones del curso, pero con base de datos, enlaces y cálculo en vivo.</p>
          </div>
          <ol className="lgrid4">
            <li className="lstep">
              <span className="no" aria-hidden="true">01</span>
              <h3>Define tu proyecto y el método</h3>
              <p>Objetivo de decisión, criterios y alternativas — los que necesites, no una plantilla fija — y cómo vas a comparar: por pares, con datos o con etiquetas.</p>
            </li>
            <li className="lstep">
              <span className="no" aria-hidden="true">02</span>
              <h3>Reúne los juicios o los datos</h3>
              <p>Cada experto recibe un enlace propio: responde sin crear cuenta y sin ver lo que respondieron los demás. Si pesas con CRITIC o Entropía, solo llenas la matriz.</p>
            </li>
            <li className="lstep">
              <span className="no" aria-hidden="true">03</span>
              <h3>Mira los resultados</h3>
              <p>Pesos, consistencia (CR) y ranking se recalculan solos con cada respuesta, y puedes probar qué pasa si un peso cambia.</p>
            </li>
            <li className="lstep">
              <span className="no" aria-hidden="true">04</span>
              <h3>Exporta o comparte</h3>
              <p>Descarga el Excel con fórmulas vivas o el informe ejecutivo, o publica un enlace de solo resultados.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="lsection alt" id="metodos">
        <div className="wrap">
          <div className="lhead">
            <div className="eyebrow">7 métodos</div>
            <h2>Un mismo modelo, siete formas de comparar</h2>
            <p>Los pesos de los criterios salen de juicios por pares o de los datos. Lo que elige el método es cómo se comparan las alternativas.</p>
          </div>
          <div className="lmethods">
            {METHOD_ORDER.map((k) => {
              const g = METHOD_GUIDE[k];
              return (
                <div className="lmethod" key={k} style={famVar(g.family)}>
                  <span className="fam">{FAMILY[g.family]}</span>
                  <b>{g.label}</b>
                  <span className="txt">{g.what}</span>
                  <span className="need"><i>Necesita</i> {g.input}</span>
                </div>
              );
            })}
          </div>
          <p className="lmethods-note">
            El color de cada tarjeta marca su familia. ¿Dudas entre varios?{' '}
            <Link href="/metodo">Responde unas pocas preguntas y te decimos cuál usar</Link>.
          </p>
        </div>
      </section>

      <section className="lsection" id="pesos">
        <div className="wrap">
          <div className="lhead">
            <div className="eyebrow">Pesos de los criterios</div>
            <h2>Tres formas de decidir cuánto pesa cada criterio</h2>
            <p>
              Con AHP los pesos son siempre los que dicen tus expertos. Con los otros seis métodos puedes elegir: los
              expertos o un cálculo objetivo sobre la matriz de datos. Ninguna es «la mejor»: responden preguntas distintas.
            </p>
          </div>
          <div className="lweights">
            {WEIGHTING_ORDER.map((k) => {
              const g = WEIGHTING_GUIDE[k];
              return (
                <div className="lweight" key={k}>
                  <b>{g.label}</b>
                  <span className="sub">{g.short}</span>
                  <p>{WEIGHTING_REFS[k].how}</p>
                  <p className="when"><i>Cuándo conviene</i> {g.when}</p>
                </div>
              );
            })}
          </div>
          <p className="lmethods-note">
            Los pesos objetivos miden cuánto se diferencian tus alternativas, no qué tan importante es un criterio para ti.
            La plataforma te lo recuerda al mostrar los resultados.
          </p>
        </div>
      </section>

      <section className="lsection alt" id="mapas">
        <div className="wrap">
          <div className="lgeo">
            <div className="lhead" style={{ marginBottom: 0 }}>
              <div className="eyebrow">Cuando la pregunta es «dónde»</div>
              <h2>Mapas de aptitud: AHP + SIG</h2>
              <p>
                Si vas a ubicar o zonificar algo en un territorio (una boya, una finca solar, un cultivo), las
                alternativas ya no son filas de una tabla sino las celdas de un mapa. Subes tus capas (GeoTIFF, GeoJSON,
                shapefile, KML), defines reglas de idoneidad y los pesos salen de tus expertos con el mismo AHP.
                Exportas el mapa a GeoTIFF, PNG, KMZ o Excel.
              </p>
              <div className="acts" style={{ marginTop: 6 }}>
                <Link className="btn" href="/tutorial#mapas">Ver cómo se hace</Link>
              </div>
            </div>
            <ul className="lgeo-list">
              <li><b>Tus capas, en tu navegador.</b> Los archivos se procesan localmente; solo se guarda la grilla alineada.</li>
              <li><b>Un índice, no una probabilidad.</b> El resultado va de 0 a 100 y sirve para comparar zonas entre sí.</li>
              <li><b>Consulta por punto.</b> Haz clic en el mapa y ve qué criterio limita cada zona.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="lsection">
        <div className="wrap">
          <div className="lhead">
            <div className="eyebrow">Para quién</div>
            <h2>Pensado para decisiones con criterios en conflicto</h2>
          </div>
          <div className="laudience">
            <div className="laud"><b>Estudiantes de tesis</b><span>que necesitan un modelo propio con su número exacto de criterios, alternativas y expertos — el método que mejor encaje, no el ejemplo fijo del curso.</span></div>
            <div className="laud"><b>Investigadores</b><span>que consultan un panel de expertos y quieren agregar sus juicios con rigor (media geométrica), no promediarlos a mano.</span></div>
            <div className="laud"><b>Equipos y organizaciones</b><span>que eligen entre proveedores, tecnologías o estrategias y quieren dejar el porqué documentado, no solo el resultado.</span></div>
          </div>
        </div>
      </section>

      <section className="lsection alt">
        <div className="wrap">
          <div className="lhead">
            <div className="eyebrow">Privacidad por diseño</div>
            <h2>Cada quien ve solo lo suyo</h2>
          </div>
          <div className="lpriv">
            <ul>
              <li>Tus proyectos son privados por defecto; nadie más los ve ni los edita.</li>
              <li>Un experto solo ve su propio formulario — nunca las respuestas de los demás.</li>
            </ul>
            <ul>
              <li>Si publicas resultados, se ocultan los nombres de los expertos y sus enlaces de invitación.</li>
              <li>Puedes desactivar el enlace público en cualquier momento; deja de verse al instante.</li>
            </ul>
          </div>
        </div>
      </section>

      <div className="wrap">
        <div className="lcta">
          <h2>¿Listo para pesar lo que de verdad importa?</h2>
          <p>Crea tu proyecto en un par de minutos, o revisa primero el paso a paso completo.</p>
          <div className="acts">
            <Link className="btn primary" href={primaryHref}>{primaryLabel}</Link>
            <Link className="btn" href="/tutorial">Ver el paso a paso</Link>
          </div>
        </div>

        <footer className="lfoot">
          <span>Plataforma MCDA — Toma de Decisiones Multicriterio</span>
          <nav aria-label="Enlaces del pie">
            <Link href="/metodo">¿Qué método uso?</Link>
            <Link href="/tutorial">Cómo funciona</Link>
          </nav>
        </footer>
      </div>
    </>
  );
}
