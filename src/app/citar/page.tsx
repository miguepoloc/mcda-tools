import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import Topbar from '@/components/Topbar';
import Footer from '@/components/Footer';
import CitationBox from '@/components/CitationBox';
import { APP_VERSION, APP_DOI, APP_DOI_URL, APP_AUTHOR, APP_REPO_URL } from '@/lib/version';
import { METHOD_GUIDE, METHOD_ORDER } from '@/lib/methodGuide';

export const metadata: Metadata = {
  title: 'Cómo Citar · Plataforma MCDA (mcda-tools)',
  description:
    'Guía y formatos de citación académica (APA 7ma ed., IEEE, BibTeX, RIS) para la plataforma web de toma de decisiones multicriterio mcda-tools y sus modelos de idoneidad espacial.',
};

export default async function CitarPage() {
  const supabase = await createClient();
  let logged = false;
  let userEmail: string | undefined;
  try {
    const { data } = await supabase.auth.getUser();
    logged = !!data.user;
    userEmail = data.user?.email;
  } catch {
    /* sin configurar */
  }

  return (
    <>
      <div className="wrap">
        <Topbar subtitle="Citación Académica" loggedIn={logged} userEmail={userEmail} />

        <div className="lhero" style={{ paddingBottom: 24 }}>
          <div>
            <div className="eyebrow">Rigor y Reproducibilidad Académica</div>
            <h1>Cómo citar MCDA Tools en tus publicaciones</h1>
            <p className="lead">
              El software científico abierto es un producto de investigación evaluable. Si utilizas <strong>MCDA Tools</strong> en tu tesis de posgrado, clases universitarias o artículos indexados, citar la plataforma permite que cualquier evaluador reproduzca tus resultados y reconoce el trabajo de desarrollo académico.
            </p>
            <div className="acts" style={{ marginTop: 20 }}>
              <a className="btn primary" href="#citation-box">
                Copiar cita en APA / IEEE
              </a>
              <a
                className="btn"
                href={APP_DOI_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ver registro en Zenodo
              </a>
              <Link className="btn" href="/tutorial">
                Cómo funciona la plataforma
              </Link>
            </div>
          </div>
        </div>
      </div>

      <section className="lsection alt" style={{ paddingTop: 32 }}>
        <div className="wrap">
          <div className="lhead">
            <div className="eyebrow">Generador de Citas</div>
            <h2>Formatos normalizados listos para usar</h2>
            <p>
              Selecciona tu formato preferido. Puedes copiar el texto con un clic o descargar los archivos <code className="mono">.bib</code> y <code className="mono">.ris</code> para tu gestor bibliográfico.
            </p>
          </div>

          <CitationBox />
        </div>
      </section>

      {/* Sección pedagógica: Por qué y cómo citar */}
      <section className="lsection">
        <div className="wrap">
          <div className="lhead">
            <div className="eyebrow">Buenas Prácticas</div>
            <h2>Pautas para la sección de Metodología de tu documento</h2>
            <p>
              Recomendaciones para redactar la aplicación de métodos multicriterio de manera clara y reproducible.
            </p>
          </div>

          <div className="laudience" style={{ marginTop: 24 }}>
            <div className="laud">
              <b>1. Cita el software con su versión</b>
              <span>
                Los algoritmos numéricos pueden recibir mejoras. Especificar siempre la versión (<code className="mono">v{APP_VERSION}</code>) y el DOI (<code className="mono">{APP_DOI}</code>) garantiza que tu trabajo quede indexado con la implementación exacta con la que calculaste los resultados.
              </span>
            </div>

            <div className="laud">
              <b>2. Cita la teoría fundacional</b>
              <span>
                Para sustentar el porqué elegiste un método en tu marco teórico, cita a los autores originales (por ejemplo, Saaty para AHP, Hwang & Yoon para TOPSIS, Opricovic para VIKOR). Para sustentar la herramienta computacional que procesó las matrices, cita a <code className="mono">mcda-tools</code>.
              </span>
            </div>

            <div className="laud">
              <b>3. Adjunta el Excel con fórmulas vivas</b>
              <span>
                La plataforma genera libros Excel con fórmulas nativas activas (<code className="mono">SUMPRODUCT</code>, matrices dinámicas). Puedes anexar ese archivo como material complementario (Supplementary Data) en tu artículo o repositorio de tesis.
              </span>
            </div>
          </div>

          {/* Tabla de citas teóricas cruzadas */}
          <div style={{ marginTop: 48 }}>
            <h3 style={{ fontSize: 18, marginBottom: 12 }}>Referencias teóricas complementarias por método</h3>
            <p className="muted" style={{ marginBottom: 18, fontSize: 14 }}>
              Cuando redactes tu artículo o tesis, acompaña la cita de la plataforma con la referencia clásica del método matemático empleado:
            </p>

            <div className="tbl">
              <table>
                <thead>
                  <tr>
                    <th>Método</th>
                    <th>Familia</th>
                    <th>Referencia Clásica sugerida</th>
                    <th>¿Cuándo usarlo?</th>
                  </tr>
                </thead>
                <tbody>
                  {METHOD_ORDER.map((mk) => {
                    const g = METHOD_GUIDE[mk];
                    return (
                      <tr key={mk}>
                        <td><strong>{g.label}</strong></td>
                        <td><span className="cite-tab-badge">{g.family}</span></td>
                        <td style={{ fontSize: 13, lineHeight: 1.4 }}>
                          {mk === 'ahp' && 'Saaty, T. L. (1980). The Analytic Hierarchy Process. McGraw-Hill.'}
                          {mk === 'topsis' && 'Hwang, C. L., & Yoon, K. (1981). Multiple Attribute Decision Making. Springer-Verlag.'}
                          {mk === 'vikor' && 'Opricovic, S., & Tzeng, G. H. (2004). Compromise solution by MCDM methods: A comparative analysis of VIKOR and TOPSIS. EJOR.'}
                          {mk === 'electre' && 'Roy, B. (1968). Classement et choix en présence de points de vue multiples. RIRO.'}
                          {mk === 'promethee' && 'Brans, J. P., & Vincke, P. (1985). Note—A Preference Ranking Organisation METHod: (The PROMETHEE Method). Management Science.'}
                          {mk === 'saw' && 'MacCrimmon, K. R. (1968). Decisionmaking among multiple-attribute alternatives. RAND Corporation.'}
                          {mk === 'fuzzy_topsis' && 'Chen, C. T. (2000). Extensions of the TOPSIS for group decision-making under fuzzy environment. Fuzzy Sets and Systems.'}
                        </td>
                        <td className="muted" style={{ fontSize: 12.5 }}>{g.when}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <div className="wrap">
        <div className="lcta">
          <h2>¿Tienes dudas sobre qué método utilizar?</h2>
          <p>Utiliza nuestro asistente guiado para encontrar el método multicriterio óptimo según tus datos.</p>
          <div className="acts">
            <Link className="btn primary" href="/metodo">Explorar asistente de métodos</Link>
            <Link className="btn" href="/tutorial">Ver tutorial paso a paso</Link>
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}
