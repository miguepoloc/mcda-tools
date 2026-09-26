import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import Topbar from '@/components/Topbar';

export const metadata = { title: 'Cómo funciona · Plataforma MCDA' };

export default async function TutorialPage() {
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
    <div className="wrap">
      <Topbar badge="GUÍA" subtitle="← Ir al inicio" loggedIn={logged} userEmail={userEmail} />

      <div className="ttl">
        <div className="eyebrow">Guía completa</div>
        <h1>Del objetivo al ranking, paso a paso</h1>
        <p className="muted lnote" style={{ marginTop: 10 }}>
          Este es el mismo flujo que verías montando el ejercicio a mano en Excel: la plataforma solo se encarga de
          las cuentas, los enlaces y la aritmética. Nada de esto reemplaza entender los métodos; te deja tiempo para
          pensar en los juicios y los datos en vez de en las fórmulas.
        </p>
      </div>

      <div className="tlayout">
        <div className="tmain">
          <div className="tphase" id="antes">
            <span className="k">Antes de empezar</span>
            <h2>Qué necesitas tener listo</h2>

            <div className="titem">
              <span className="no">1</span>
              <h3>Un objetivo de decisión claro</h3>
              <p>Una frase concreta: qué vas a elegir y en qué contexto. Ej.: «seleccionar la estrategia de adaptación de un modelo ASR para hablantes de español rural».</p>
            </div>
            <div className="titem">
              <span className="no">2</span>
              <h3>Tus criterios y alternativas</h3>
              <p>Los criterios con los que vas a juzgar (idealmente ya priorizados: 3 a 9 es el rango manejable) y las alternativas entre las que vas a elegir (2 o más). Si usas un método con datos, también necesitas el valor de cada alternativa en cada criterio.</p>
              <div className="tip"><b>Tip:</b> si ya hiciste la priorización de criterios de la Sesión 1 (lluvia de ideas → tamizaje → independencia → panel → corte), la pestaña «Priorización (A)» del proyecto reproduce ese mismo proceso y luego lleva los finalistas directo al AHP con un clic.</div>
            </div>
            <div className="titem">
              <span className="no">3</span>
              <h3>Elige el método y cómo pesar los criterios</h3>
              <p>Son dos decisiones. <b>Método</b> (cómo comparas las alternativas): AHP con juicios por pares; TOPSIS, VIKOR, PROMETHEE, ELECTRE o SAW con una matriz de datos; Fuzzy TOPSIS con etiquetas como «buena» o «regular». <b>Pesos</b> (cuánto importa cada criterio): por juicios de expertos (AHP) o, en los métodos con datos, calculados desde la matriz con CRITIC o Entropía. <Link href="/metodo">Responde unas pocas preguntas y te decimos cuál</Link>.</p>
            </div>
          </div>

          <div className="tphase" id="configurar">
            <span className="k">Configurar tu proyecto</span>
            <h2>Crear y ajustar el modelo</h2>

            <div className="titem">
              <span className="no">4</span>
              <h3>Crea el proyecto</h3>
              <p>Desde «Mis proyectos» → «Nuevo proyecto»: elige el tipo (decisión con alternativas o mapa de aptitud), el método y, si no es AHP, cómo pesar los criterios; escribe el título y el objetivo. El proyecto nace en blanco, con «Criterio 1–3» y «Alternativa 1–3» de relleno que renombras, agregas o quitas en la pestaña «Proyecto». Si quieres ver el flujo completo antes de meter tus datos, marca «Empezar con el caso de ejemplo del curso».</p>
              <div className="tip"><b>Tip:</b> ¿ya tienes un respaldo de la herramienta HTML del curso (.json o el .xlsx que descargaste) o el Excel del taller de AHP? Usa «Importar un archivo» en vez de empezar de cero: trae el proyecto, los expertos y todos los juicios.</div>
            </div>
            <div className="titem">
              <span className="no">5</span>
              <h3>Escribe la regla de cada criterio</h3>
              <p>Junto a cada criterio hay un campo «Regla: ¿qué es mejor?». Es la frase que verán tus expertos al comparar — importante sobre todo en criterios donde <i>menos es mejor</i> (costo, riesgo), para comparar en la dirección correcta.</p>
            </div>
            <div className="titem">
              <span className="no">6</span>
              <h3>Llena la matriz de decisión (métodos con datos)</h3>
              <p>Con TOPSIS, VIKOR, PROMETHEE, ELECTRE o SAW, la pestaña «Matriz de decisión» pide un número por alternativa y criterio, y si cada criterio es de beneficio (más es mejor), de costo (menos es mejor) o de valor objetivo. Con Fuzzy TOPSIS eliges una etiqueta (Muy mala → Muy buena) en cada celda. Con AHP no hay matriz: tus expertos comparan las alternativas de a pares.</p>
              <div className="tip"><b>Ojo:</b> con CRITIC o Entropía los pesos salen de esta matriz, así que cambiarla los recalcula. Miden cuánto se diferencian tus alternativas, no qué tan importante es un criterio para ti.</div>
            </div>
          </div>

          <div className="tphase" id="expertos">
            <span className="k">Los expertos</span>
            <h2>Reunir los juicios</h2>
            <p className="muted" style={{ fontSize: 14, maxWidth: '60ch', marginTop: 6 }}>Aplica cuando los pesos salen de juicios por pares (AHP), o cuando usas AHP como método. Si pesas con CRITIC o Entropía, la pestaña «Expertos» no se usa y puedes saltar a los resultados.</p>

            <div className="titem">
              <span className="no">7</span>
              <h3>Agrega a tus expertos</h3>
              <p>Pestaña «Expertos» → nombre y rol de cada uno. Cada persona genera automáticamente un enlace propio (<code className="mono">/e/&lt;token&gt;</code>) que solo funciona para ella.</p>
            </div>
            <div className="titem">
              <span className="no">8</span>
              <h3>Comparte el enlace</h3>
              <p>Copia y envía el enlace de cada experto (WhatsApp, correo, lo que uses). No necesitan crear cuenta ni instalar nada: abren el enlace, mueven un control por cada par de elementos, y pulsan «Enviar respuestas» al terminar. Pueden cerrar la pestaña y volver después con el mismo enlace.</p>
              <div className="tip"><b>Tip:</b> ¿entrevistaste a un experto en persona o por llamada? Puedes llenar sus juicios tú mismo desde «Llenar yo por él/ella», sin que necesite abrir nada.</div>
            </div>
          </div>

          <div className="tphase" id="resultados">
            <span className="k">Resultados</span>
            <h2>Leer y compartir lo que salió</h2>

            <div className="titem">
              <span className="no">9</span>
              <h3>Revisa pesos y consistencia</h3>
              <p>Pestaña «Resultados»: el ranking (o, en ELECTRE, el grafo de superación), cuánto aporta cada criterio, los pesos y su procedencia, y el CR (razón de consistencia) de cada matriz — agregado o por experto. Un CR ≥ 0.10 es la señal de que alguien se contradijo y vale la pena revisar esos juicios con esa persona. La pestaña «Comparativa» pone los métodos lado a lado sobre los mismos datos, y el simulador de sensibilidad te deja mover un peso para ver si el ganador cambia.</p>
            </div>
            <div className="titem">
              <span className="no">10</span>
              <h3>Exporta o publica</h3>
              <p>Descarga el Excel con la misma estructura del ejercicio del curso (fórmulas vivas, listo para el informe) o genera el informe ejecutivo en PDF desde «Resultados». En «Compartir» puedes activar un enlace público de solo resultados — sin nombres de expertos, sin sus enlaces, sin la priorización de criterios.</p>
            </div>
          </div>

          <div className="tphase" id="mapas">
            <span className="k">Cuando la pregunta es «dónde»</span>
            <h2>Mapas de aptitud (AHP + SIG)</h2>

            <div className="titem">
              <span className="no">1</span>
              <h3>Qué es y en qué se parece a lo de arriba</h3>
              <p>Es el mismo AHP: tus expertos comparan <em>criterios</em> de a pares y de ahí salen los pesos. Lo que cambia es que las «alternativas» ya no son 3-9 filas de una tabla sino <b>las celdas de un mapa</b>. Cada criterio es una capa (una temperatura, una distancia, una profundidad…), una <b>regla de idoneidad</b> la traduce a un valor de 0 a 1, y el mapa final es la suma ponderada. Es el método de Polo-Castañeda et al. (2021) para ubicar una boya de monitoreo oceanográfico.</p>
              <div className="tip"><b>Tip:</b> el resultado es un <b>índice de 0 a 100, no una probabilidad</b>. Sirve para comparar zonas entre sí, no para decir «hay 87 % de probabilidad de que funcione».</div>
            </div>

            <div className="titem">
              <span className="no">2</span>
              <h3>El recorrido: cuatro pasos</h3>
              <p><b>Área</b> → <b>Capas</b> → <b>Reglas</b> → <b>Pesos</b>. En el proyecto, la pestaña «Geovisor» te lo muestra con marcas de progreso arriba a la izquierda. La primera vez arranca un recorrido guiado; puedes repetirlo con el botón «Recorrido».</p>
              <ul>
                <li><b>Proyecto y Expertos</b>: define tus criterios (uno por capa) e invita a tus expertos, igual que en AHP. Sin juicios, el mapa usa pesos iguales y te lo avisa.</li>
                <li><b>Capas → Área de estudio</b>: sube un archivo y el área se propone sola, o dibuja un rectángulo en el mapa. Elige la resolución (metros por celda): más fino es más detalle pero más lento.</li>
                <li><b>Capas → Añadir mapas</b>: arrastra <b>GeoTIFF</b>, <b>GeoJSON</b>, <b>shapefile en .zip</b> (con su .prj), <b>KML</b> o <b>GPX</b>. Los archivos se procesan en tu navegador; solo se guarda la grilla ya alineada.</li>
                <li><b>Modelo</b>: para cada criterio elige la capa y la regla (por rangos, trapecio, más/menos es mejor) y un veto si aplica. El mapa se actualiza en vivo.</li>
                <li><b>Clic en el mapa</b>: ves el % de idoneidad del punto y cuánto aporta cada criterio. <b>Exportar</b>: GeoTIFF (+ estilo para QGIS), PNG, KMZ, CSV, Excel y un .zip con todo; y una <b>vista pública</b> con enlace.</li>
              </ul>
            </div>

            <div className="titem">
              <span className="no">3</span>
              <h3>Qué papel juega cada archivo</h3>
              <p>Al subir cada archivo dices <b>qué es</b>:</p>
              <ul>
                <li><b>Criterio</b>: un valor por celda. Un vector se convierte en <em>distancia en metros</em> al elemento más cercano (p. ej. «distancia a zonas de pesca»), en <em>dentro/fuera</em>, o toma el <em>valor de un atributo</em> numérico.</li>
                <li><b>Exclusión</b>: zonas donde no se puede (concesiones, áreas protegidas). Salen en gris y no entran al cálculo.</li>
                <li><b>Área de estudio</b>: la zona que se analiza (p. ej. la isóbata de 200 m). Fuera de ella no se calcula nada.</li>
              </ul>
              <div className="tip"><b>Ojo con:</b> el sistema de coordenadas (un ráster sin CRS no se puede ubicar), las unidades (profundidad en metros <em>positivos</em>) y que un shapefile necesita <b>.shp, .dbf, .shx y .prj juntos en un .zip</b>.</div>
            </div>

            <div className="titem">
              <span className="no">4</span>
              <h3>Dos casos para practicar</h3>
              <p>Al crear un proyecto de tipo «Mapa de aptitud» elige un punto de partida: <b>Aptitud cacaotera · Sierra Nevada</b> (trae los datos del notebook de la Sesión 5), o la <b>boya con datos</b> (el caso real del artículo de 2021: sus 4 capas, las concesiones y los 4 expertos de la encuesta). Con cualquiera de las dos puedes añadir después tus propios mapas. Si tu docente publicó paquetes en el catálogo, aparecen ahí como «del curso».</p>
            </div>

            <div className="titem">
              <span className="no">5</span>
              <h3>Mini-tutorial: ¿dónde instalar una finca de paneles solares?</h3>
              <p>Empieza con «En blanco» y estos criterios y archivos (todos gratuitos):</p>
              <div className="tbl"><table>
                <thead><tr><th>Criterio</th><th>Archivo</th><th>De dónde</th><th>Regla</th></tr></thead>
                <tbody>
                  <tr><td>Radiación solar</td><td>GeoTIFF de GHI (kWh/m²/día)</td><td>Global Solar Atlas (globalsolaratlas.info → Data download)</td><td>Más es mejor: 0 hasta 4.5, 1 desde 6</td></tr>
                  <tr><td>Pendiente</td><td>GeoTIFF de pendiente (°)</td><td>DEM SRTM/Copernicus → QGIS «Pendiente»</td><td>Menos es mejor: 1 hasta 5°, 0 desde 15°; veto ≥ 20°</td></tr>
                  <tr><td>Distancia a la red eléctrica</td><td>Líneas eléctricas (GeoJSON)</td><td>OpenStreetMap <code>power=line</code> (Overpass turbo)</td><td>Distancia (m): menos es mejor, 1 hasta 1 000, 0 desde 15 000</td></tr>
                  <tr><td>Distancia a vías</td><td>Vías (GeoJSON)</td><td>OpenStreetMap <code>highway</code></td><td>Distancia (m): menos es mejor</td></tr>
                  <tr><td>Exclusión</td><td>Áreas protegidas, cuerpos de agua, poblados</td><td>RUNAP/WDPA, IGAC, OSM</td><td>Papel «Exclusión»</td></tr>
                  <tr><td>Área de estudio</td><td>Polígono del municipio</td><td>DANE / IGAC</td><td>Papel «Área de estudio»</td></tr>
                </tbody>
              </table></div>
              <p>Pasos: 1) crea el proyecto en blanco y renombra los 4 criterios; 2) sube el polígono del municipio como <b>Área de estudio</b> (el área y la resolución se proponen solos); 3) sube cada archivo asignándolo a su criterio; 4) en «Modelo» ajusta las reglas de la tabla; 5) pide a tus expertos que comparen los criterios; 6) haz clic en el mapa sobre los mejores sitios y revisa qué criterio los limita; 7) exporta el GeoTIFF y sigue el análisis en QGIS (Sesión 6) si necesitas áreas contiguas mínimas.</p>
              <div className="tip"><b>Tip:</b> para «voltaje de red = 110 V», «pH 6» u otro <b>valor objetivo</b> usa la regla «Valor objetivo (± tolerancia)». Y si lo que tienes son <b>isolíneas o puntos con un valor</b> (curvas de nivel, batimetría, estaciones), súbelos como «Superficie continua desde un atributo»: la plataforma interpola una superficie entre ellos. Para una finca solar, en «Modelo → Parcelas contiguas» fija el área mínima (p. ej. 20 ha) y la plataforma busca los cuerpos de alta aptitud de ese tamaño, con su CSV y GeoTIFF; y «Comparar escenarios» te muestra qué cambia si mueves un peso o una regla.</div>
            </div>
          </div>

          <div className="tphase" id="referencias">
            <span className="k">Marco científico</span>
            <h2>Literatura y referencias fundacionales</h2>
            <p className="muted" style={{ fontSize: 14, maxWidth: '60ch', marginTop: 6 }}>
              La lista completa, con enlaces al artículo (DOI) y las fórmulas de cada método, está en <Link href="/metodo#bib-h">¿Qué método uso?</Link>.
            </p>
            {[
              ['AHP (Analytic Hierarchy Process)', 'Saaty, T. L. (1980).', 'The Analytic Hierarchy Process: Planning, Priority Setting, Resource Allocation', ' McGraw-Hill. Fundamenta la escala de juicios pareados 1 a 9 y el autovector principal como estimador de pesos, con razón de consistencia CR < 0.10.'],
              ['TOPSIS', 'Hwang, C. L., & Yoon, K. (1981).', 'Multiple Attribute Decision Making: Methods and Applications', '. Springer-Verlag. Introduce la proximidad simultánea a la solución ideal positiva (PIS) y la lejanía de la anti-ideal (NIS).'],
              ['VIKOR (solución de compromiso)', 'Opricovic, S., & Tzeng, G. H. (2004).', 'Compromise solution by MCDM methods: A comparative analysis of VIKOR and TOPSIS', '. European Journal of Operational Research, 156(2), 445–455. Optimización de compromiso con la utilidad de grupo (S) y el pesar individual (R).'],
              ['PROMETHEE', 'Brans, J. P., & Vincke, P. (1985).', 'A preference ranking organisation method: The PROMETHEE method for multiple criteria decision-making', '. Management Science, 31(6), 647–656. Relaciones de superación con funciones de preferencia y flujos netos Φ.'],
              ['ELECTRE', 'Roy, B. (1991).', 'The outranking approach and the foundations of ELECTRE methods', '. Theory and Decision, 31(1), 49–73. Relaciones de superación no compensatorias con umbrales de concordancia y discordancia.'],
              ['SAW (suma ponderada simple)', 'MacCrimmon, K. R. (1968).', 'Decisionmaking among multiple-attribute alternatives: A survey and consolidated approach', '. RAND Memorandum RM-4823-ARPA.'],
              ['Fuzzy TOPSIS', 'Chen, C.-T. (2000).', 'Extensions of the TOPSIS for group decision-making under fuzzy environment', '. Fuzzy Sets and Systems, 114(1), 1–9. Evaluaciones lingüísticas como números difusos triangulares.'],
              ['Ponderación objetiva (CRITIC y Entropía)', 'Diakoulaki, D., Mavrotas, G., & Papayannakis, L. (1995).', 'Determining objective weights in multiple criteria problems: The CRITIC method', '. Computers & Operations Research, 22(7), 763–770. Junto con Shannon, C. E. (1948), A mathematical theory of communication (Bell System Technical Journal, 27(3), 379–423), permite calcular pesos estadísticos cuando no hay panel de expertos.'],
            ].map(([t, a, ti, rest], i) => (
              <div className="titem" key={t}>
                <span className="no">{i + 1}</span>
                <h3>{t}</h3>
                <p><b>{a}</b> <em>{ti}</em>{rest}</p>
              </div>
            ))}
          </div>
        </div>

        <nav className="trail" aria-label="Secciones de esta guía">
          <span className="lbl">En esta guía</span>
          <a href="#antes">1. Antes de empezar</a>
          <a href="#configurar">2. Configurar tu proyecto</a>
          <a href="#expertos">3. Los expertos</a>
          <a href="#resultados">4. Resultados</a>
          <a href="#mapas">5. Mapas de aptitud (SIG)</a>
          <a href="#referencias">6. Referencias científicas</a>
        </nav>
      </div>

      <div className="lcta" style={{ marginBlock: '48px 24px' }}>
        <h2>Ya sabes cómo funciona — el resto es tu criterio</h2>
        <div className="acts">
          <Link className="btn primary" href={primaryHref}>{primaryLabel}</Link>
          <Link className="btn" href="/">← Volver al inicio</Link>
        </div>
      </div>
    </div>
  );
}
