# Plan: hacer la plataforma publicable (2 artículos, meta 2027)

Estado: **borrador del 25 sep 2026**, resultado de una revisión investigativa + sesión grill-me con el docente.
Objetivo declarado del docente: **(a) productos académicos para su perfil docente-investigador**, hasta **dos artículos**:
uno sobre el geovisor AHP+SIG y otro sobre la plataforma multimétodo.

> **Cómo leer las afirmaciones externas.** Lo marcado *(verificado)* se leyó en la fuente durante la revisión. Lo marcado
> *(por verificar)* viene de un resumen automático o de memoria y debe confirmarse leyendo la fuente antes de citarlo en un
> manuscrito. En particular **no se pudo verificar**: límites de extensión y tarifas (APC) de SoftwareX, cuartiles de las
> revistas y la literatura de educación en MCDA.

---

## 1. Decisión de fondo: qué NO se puede afirmar

«Nuestra plataforma es mejor que AHP-OS» **no es un argumento publicable**, y con la evidencia actual tampoco es cierto:

- **AHP-OS** (Goepel) *(verificado)*: artículo en [IJAHP 10(3), 2018](https://ijahp.org/index.php/IJAHP/article/view/590);
  código [GPLv3](https://github.com/bpmsg/ahp-os) (PHP, último commit jun 2024); 6 idiomas; consenso de grupo por entropía de
  Shannon; incertidumbre de pesos por Monte Carlo; sensibilidad; varias escalas AHP a posteriori; media geométrica ponderada;
  importación/exportación CSV y JSON.
- **AHP-WEB** *(por verificar leyendo el paper)*: [MethodsX 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10372897/);
  AHP de grupo web; declara como limitación que no admite subcriterios y solo agrega por media geométrica.
- Software comercial (Expert Choice, Super Decisions, MakeItRational, TransparentChoice): de pago o dependiente de plataforma
  *(según el propio AHP-WEB, por verificar)*.

Lo que **sí** es defendible, y es cosa distinta: **amplitud + integración + espacial + docencia**. Nadie de los revisados
junta, en una web gratuita: AHP de grupo por enlace sin cuenta para el experto, 7 métodos con la misma matemática
verificable, Excel exportado con fórmulas vivas, y un mapa de aptitud con capas propias en el navegador.

## 2. Panorama comparado

| | AHP-OS | AHP-WEB | pymcdm (SoftwareX 2023, v1.4) | pyDecision (JMM 2026) | AgriSuit (Comput. Electron. Agric. 2017) | **Esta plataforma** |
|---|---|---|---|---|---|---|
| Tipo | Web (PHP+SQL) | Web | Librería Python | Librería Python | Web sobre Google Earth Engine | Web (Next.js+Supabase) |
| Métodos | AHP | AHP | ~15+ MCDM + 10 pesos | ~70 | GIS-MCDA agrícola | AHP, TOPSIS, VIKOR, ELECTRE, PROMETHEE, SAW, Fuzzy-TOPSIS |
| Grupo de expertos | Sí (Shannon, geométrica) | Sí (geométrica) | No | No | Parcial | Sí, por enlace sin cuenta; geométrica |
| Subcriterios | Sí *(por verificar)* | **No** | n/a | n/a | n/a | **No** (jerarquía plana) — limitación a declarar |
| Sensibilidad / incertidumbre | Sí, incl. Monte Carlo | — | Sí (analítica) | Sí | — | Simulador de sensibilidad; **sin Monte Carlo ni índice de consenso** |
| Espacial | No | No | No | No | Sí | **Sí: geovisor AHP+SIG con capas propias, exporta GeoTIFF/QML** |
| Excel con fórmulas vivas | No (CSV) | — | No | No | No | **Sí** (con recálculo verificado en LibreOffice) |
| Idiomas UI | 6 | ? | n/a | n/a | ? | **1 (es)** — brecha |
| Licencia | GPLv3 | abierta *(por verificar)* | *(por verificar)* | MIT *(por verificar)* | — | MIT |
| Evidencia publicada | Paper 2018, uso amplio | Paper 2023, >100 usuarios | Paper 2023 | Paper 2026 | Paper 2017 | **Ninguna aún** |

**Brechas frente a AHP-OS que un revisor notará** (y qué hacer): ver §4 (Monte Carlo y consenso: baratos, hacer; subcriterios:
caros, declarar como limitación; escalas alternativas: baratas, opcional).

## 3. Estrategia de dos artículos

Regla: **cada artículo debe tener una contribución propia y un resultado propio**, si no es *salami slicing*.

| | **A — Geovisor AHP+SIG** | **B — Plataforma multimétodo** |
|---|---|---|
| Contribución | Método+herramienta: pesos AHP de un panel real → mapa de aptitud recalculable en el navegador, sin instalar SIG | Software: arquitectura, motor de cálculo único verificado, Excel de fórmulas vivas, uso docente |
| Evidencia central | **Reproducir el mapa de la boya (Polo-Castañeda et al. 2021)** y compararlo píxel a píxel (§5); caso cacao SNSM como segundo caso ilustrativo | Tests de referencia contra pyDecision/notebooks + estudio de uso con estudiantes (§7) |
| Peso para el objetivo (a) | **Alto** (resultados, validación) | Medio (descriptor de software) |
| Revistas a evaluar *(por verificar alcance/cuartil)* | Environmental Modelling & Software, Computers & Geosciences, IJGI (MDPI), Annals of GIS, Transactions in GIS | SoftwareX (precedente pymcdm), MethodsX (precedente AHP-WEB), JOSS (solo si cumple criterios 2026, §8), revista de educación en ingeniería |
| Orden | **Primero**, envío ≈ mar-abr 2027 | **Después**, cita A, envío ≈ may-jun 2027 |
| Riesgo principal | Que el mapa reproducido no coincida y haya que explicar por qué (ver §5) | Que parezca «una app de curso» sin uso real |

Fuera de esta división: la revista específica no se decide hasta tener resultados; se elige leyendo 3-4 artículos recientes
de cada candidata.

## 4. Brechas del repositorio y su plan

Estado hoy: repo público, MIT, 40 commits, primer commit 18 sep 2026, sin releases, sin CI, sin DOI.

### 4.1 Hecho en esta sesión
- [x] `LICENSE` MIT ya existía en la raíz (se corrigió una afirmación errónea anterior).
- [x] `CITATION.cff`, `CONTRIBUTING.md`, `CHANGELOG.md`, `.github/workflows/ci.yml`, `plataforma/README.en.md` (borradores).
- [x] Este plan.

### 4.2 Hacer antes de cualquier envío
| # | Tarea | Por qué | Esfuerzo |
|---|---|---|---|
| R1 | **Decidir repo aparte** para la plataforma (ver D1) | El repo actual mezcla notebooks del curso, HTML con datos de tesis de Harold y la app; un revisor de SoftwareX/JOSS espera un repo enfocado con README/LICENSE claros | 0.5 día |
| R2 | Sacar `plataforma/prototipos/` con datos de Harold (ver D2) | Ya está **público**; consentimiento y privacidad de un estudiante | 0.5 día + limpiar historial si se decide |
| R3 | Recorrer el checklist RLS y correr `npm run test:db` en CI | Un revisor preguntará por la seguridad de datos de expertos | 1 día |
| R4 | Tabla de **licencias de datos** de los paquetes `public/geo-packs/` (WorldClim, SoilGrids, RUNAP, Copernicus, Sentinel-2) y atribución en la app | Redistribuir datos exige cumplir sus licencias | 1 día |
| R5 | Publicar un **release** con DOI (Zenodo) y versión fija del código citada en el artículo | SoftwareX/JOSS lo piden; sin versión citable no hay reproducibilidad | 0.5 día |
| R6 | Instancia de demo estable + **script de despliegue reproducible** (Supabase + Vercel) y opción de correr local con Supabase CLI | Reproducibilidad: que un revisor lo levante sin tu cuenta | 2 días |
| R7 | Documentación en inglés: README, tutorial corto, descripción de la arquitectura y de cada método con su referencia | Público internacional | 2-3 días |
| R8 | ~~**Monte Carlo de pesos**~~ **Hecho (25 sep 2026)**: `src/lib/ahpGroup.ts` + panel en Resultados; probado contra los casos de validación de Goepel (2018) | Cierra la brecha con AHP-OS | — |
| R9 | ~~**Índice de consenso de grupo**~~ **Hecho (25 sep 2026)**: S* de Goepel (2018, ec. 11-21), entropía de Shannon α/β | Idem | — |
| R11 | ~~Eigenvector exacto~~ **Hecho y predeterminado** (25 sep 2026, ver §5.2.1), Excel incluido; queda la plantilla HTML heredada sin sincronizar | Pesos idénticos al artículo de 2021 y a AHP-OS | — |
| R10 | Declarar límites explícitos: jerarquía plana, sin ANP, distancia euclidiana (no por red vial), etc. | Los revisores castigan más lo oculto que lo declarado | 0.5 día |

No hacer: subcriterios multinivel (semanas de trabajo y toca las tres copias de la matemática, ver CLAUDE.md); ANP; nuevas
funciones que no aparezcan en A ni en B.

## 5. Validación del artículo A (caso boya, 2021)

Artículo de referencia: Polo-Castañeda, Gómez-Rojas & Linero-Cueto (2021), *IJASEIT* 11(5) 1696-1703,
[DOI 10.18517/ijaseit.11.5.14293](https://doi.org/10.18517/ijaseit.11.5.14293). PDF local en
`Toma de decisiones/03_Bibliografia_general/combinaciones/PoloCastaneda_etal_2021_AHP_GIS_WSN_Oceanografico.pdf`.
(El `AHP_GIS190718.docx` de `Maestria/Artículo/` es el **borrador de 2019: otro modelo** — 5 criterios con GSM, Taganga —,
no sirve como referencia.)

**Datos ubicados** (OneDrive, solo lectura, **no copiar al repo público** sin revisar licencias y permisos):
- `Maestria/Mapas/TESIS/Raster/`: `Ecosistemas_Marinos.tif`, `Lanchas.tif`, `Pesca_Artesanal.tif`, `Batimetria.tif` (criterios ya
  clasificados 1/2/3) y `Final.tif` (resultado). Float32, 10 000 × 10 000, MAGNA-SIRGAS Bogotá (EPSG:3116),
  celda **38.68 × 17.89 m (no cuadrada)**, 381 MB cada una.
- `Maestria/Mapas/TESIS/Tesis.qgz`, `…/Tesis/MAPAS/Proyecto.qgz`, carpetas `Corales`, `Lanchas`, `Pesca`, `Batimetria`, `Costa`, `UAC`,
  `Areas Concesionadas`: vectores de entrada y proyectos QGIS.

### 5.1 Hecho (25 sep 2026)

| Comprobación | Resultado |
|---|---|
| Los 5 rásteres tienen el **mismo conjunto de píxeles válidos** | 12 232 559 píxeles ≈ 8 466 km² (el artículo dice ≈ 9 887 km² dentro de la isóbata de 200 m; la diferencia sería lo excluido por concesiones — **por confirmar**) |
| `Final = 1 + Σ wᵢ·(clase ᵢ − 1)` | Mínimos cuadrados sobre todos los píxeles: **residuo máximo 1.2 × 10⁻⁷**. La álgebra de mapas es exactamente la suma ponderada lineal |
| Pesos recuperados del ráster | 0.5482 (ecosistemas) · 0.1423 (tráfico) · 0.2020 (pesca) · 0.1075 (batimetría): **idénticos a la Tabla V del artículo** (script: `scripts/validation/boya-map-algebra.mjs`) |
| Clases 1/2/3 | En el artículo **1 = apto, 3 = no apto** (menor valor = mejor). El geovisor usa el sentido inverso (índice 0-1, mayor = mejor): S del geovisor = (3 − S del artículo)/2 |

### 5.2 Hallazgos

1. **Eigenvector exacto (resuelto, con una salvedad).** Con la matriz de la Tabla IV del artículo (triángulo superior + recíprocos exactos), el
   eigenvector principal da [0.5482, 0.1425, 0.2018, 0.1075] y CR ≈ 0.0646 (publicado: 0.5482 / 0.1423 / 0.2020 / 0.1075, CR 0.0652; la
   diferencia de 2×10⁻⁴ viene del redondeo de la tabla). El promedio de columnas normalizadas da [0.5355, 0.1476, 0.2063, 0.1107] (0.013 de diferencia en
   el peso principal). **`analyze()` admite ambos métodos** (`'mean'` | `'eigenvector'`, `ahp.ts`) y **desde el 25 sep 2026 el predeterminado es el eigenvector** (decisión del docente, que
   hará la aclaración a los estudiantes: la sesión 2 y el notebook 01 enseñan el promedio de columnas, validado contra `pyDecision wd='m'`). `Results` tiene un selector para
   ver el promedio del curso. El Excel exportado calcula el eigenvector con iteración de potencias en fórmulas vivas y muestra el promedio al lado; `test:excel:recalc`
   (LibreOffice) confirma que las fórmulas recalculadas coinciden. Pruebas: `check-ahp.ts` (ambos métodos), `check-ahp-eigen.ts`. **No sincronizado:** la plantilla HTML
   heredada (`prototipos/fuente/mcda_template.html`) y los HTML generados conservan el promedio de columnas.
2. **Los porcentajes del artículo (62.36 / 30.88 / 6.76 %) son un artefacto de cómo se sumó el campo `area` — hallazgo del 25 sep 2026.** Se reproducen **exactamente**
   (a dos decimales, las tres clases) sumando el atributo `area` de `Final/Resultado.shp`, donde **un solo registro (fid 302, un polígono apto de 4 619 km²) quedó
   desbordado** en el campo DBF de 10 caracteres y se guardó como `**********`, así que cualquier suma por atributo lo omite. Sumando la **geometría** (y contando píxeles de `Final.tif`,
   que coincide) salen **82.89 % apto / 14.03 % moderado / 3.07 % no apto** (7 018.0 / 1 188.1 / 260.2 km²; total 8 466.3 km²). Script: `scripts/validation/boya-resultado-areas.mjs`.
   - **Confirmado en QGIS por el docente (25 sep 2026):** la tabla de atributos de `Resultado` (499 registros) muestra `fid 302, DN 1, area NULL`. Que el 62.36 % salió de sumar el atributo es una conclusión por
     reproducción exacta de las tres cifras (no una prueba de lo que se hizo en 2021), pero el registro nulo está verificado a la vista.
   - **Alcance:** el resumen, la interpretación de resultados y la conclusión del artículo de 2021 y la diapositiva 32 de la sustentación citan 62.36 %. El mapa (Fig. 10) y los pesos no cambian; cambian los porcentajes.
     Corregirlo (fe de erratas en IJASEIT, si procede) es decisión del docente. El artículo A debe **reportar las cifras corregidas y explicar la diferencia**.
   - Descartado en la búsqueda: cortes por intervalos iguales (90.18 / 6.71 / 3.11 %), corte 1.5/2.5 (= `Resultado.shp`, 82.89 / 14.03 / 3.07 %), permutaciones de pesos y `Tesis_Migue.tif` (no existe en OneDrive ni en Drive).
   - Los borradores de Drive (`AHP_GIS/`, 2019 a may 2021) no describen el cálculo; «4.26 / 23.03 / 69.73 %» del borrador de enero 2021 es de un artículo citado (Yunis et al.). `Articulos` de Drive no trae datos SIG.
3. **Rejilla:** el ráster original tiene 10⁸ celdas y celdas rectangulares; el geovisor limita a 1.5 M celdas cuadradas. La comparación debe
   hacerse por **ventanas** de ≈ 30 × 30 km a ≈ 40 m (los umbrales de 50-150 m no se resuelven con celdas de 250 m).
4. **Material del curso:** en `Toma de decisiones/` no hay nada sobre la boya ni sobre el eigenvector; la sesión 2 y el notebook 01 usan el promedio de columnas.

### 5.2b Encuesta de la boya recuperada (25 sep 2026)

`Drive/Maestria/Articulos/AHP_GIS/Datos_encuesta_sin_GSM.xlsx` trae los juicios de los **4 expertos** del modelo de 4 criterios. La hoja «Todo» es la **media geométrica exacta** de los 4
(diferencia < 1e-15) y **es la Tabla IV del artículo** (4.05, 4.16, 3.01, 0.58, 1.86, 2.45). Con esos 4 expertos la plataforma reproduce los pesos publicados
0.5482 / 0.1423 / 0.2020 / 0.1075 (eigenvector; CR 0.0650 vs 0.0652 publicado). Están cargados como el ejemplo «Boya con datos» (identidad reservada, «Experto 1..4»; fixture anonimizado
`scripts/validation/data/encuesta-2021.json`). CR por experto: 0.089, 0.065, 0.059 y **0.382** (el Experto 4 es inconsistente); consenso S* = 82.2 % (alto).

**Aclarado por el autor (25 sep 2026):** en ese archivo el 4.º criterio figura como **«Distancia a zonas de bañistas»**, pero es la **zona batimétrica** del artículo (etiqueta del archivo sin actualizar); el peso 0.1075 es el de la batimetría.
(Los 4 expertos son los mismos de `Datos_encuesta.xlsx`, el modelo de 2019 de 5 criterios.)

### 5.3 Pendiente

1. Reproducir cada criterio **desde los vectores** (distancia euclidiana + rangos de la Tabla VI) en 2-3 ventanas y comparar píxel a píxel con
   `Ecosistemas_Marinos.tif`, `Lanchas.tif`, `Pesca_Artesanal.tif` y `Batimetria.tif`. Hay que **identificar qué capas vectoriales** produjeron
   cada ráster (`Marinos_Invemar` / `Union_Vegetal_Invemar` / `Corales_*` para ecosistemas; `Rutas_Lanchas*` para tráfico;
   `Intensidad_pesca_artesanal_*` para pesca; `Batimetria_*` / `Profundidad` para batimetría). Se identifican probando cuál reproduce el ráster.
2. Decidir qué hacer con la cifra publicada (hallazgo 5.2.2: fe de erratas / corregir en el artículo A).
3. Comparación final con umbral de aceptación fijado de antemano (p. ej. porcentaje de celdas que cambian de clase) y reporte aunque falle.
4. Sensibilidad al redondeo de pesos y a la resolución de la rejilla.

**Trampa que ya vimos:** una diferencia pequeña entre el geovisor y QGIS *no es necesariamente un bug*: el geovisor usa su propia rejilla y
transformada de distancia; hay que explicar las diferencias, no esconderlas.

**Pregunta abierta:** ¿el artículo de 2021 tuvo coautores con derechos sobre los datos y figuras? (Gómez-Rojas y Linero-Cueto aparecen como
coautores del artículo; los datos vienen de SIAM/INVEMAR, ANH, Wikiloc y Shipmap: revisar sus licencias antes de redistribuir nada.)

## 6. Internacionalización y código en inglés

Medición actual (`plataforma/src`): **81 de 95 archivos** `.ts/.tsx` tienen texto en español; ~1 255 líneas con tildes o
signos españoles; ~757 líneas de comentarios. Hoy no hay ninguna librería de i18n.

**Enfoque recomendado (incremental, sin romper lo que funciona):**
1. **Infraestructura**: `next-intl` (o equivalente) con `es` por defecto y `en` como segundo idioma; ruta sin prefijo para `es`
   (no romper enlaces `/e/<token>` ya entregados a expertos) y `/en/...` para inglés. *(Confirmar compatibilidad con Next 15 y con el middleware actual antes de adoptar.)*
2. **Extraer cadenas por pantalla**, en este orden: landing → `/metodo` → editor de juicios y flujo del experto → resultados →
   geovisor → admin. El flujo del **experto** y los **resultados públicos** se traducen primero: es lo que ve un revisor.
3. **Código**: los identificadores nuevos en inglés; los existentes se renombran solo al tocarlos (renombrado masivo = conflictos
   y regresiones en las tres copias de la matemática). Comentarios nuevos en inglés. Los textos de `README`/docs se traducen en R7.
4. **Cadenas de dominio** (nombres de métodos, mensajes del Excel exportado, hojas del Excel de curso `Ejercicio.xlsx`): el Excel debe
   poder salir en inglés; `courseExcel.ts` (formato del curso) **se queda en español** a propósito.
5. Prueba: un test que falle si una cadena visible no tiene traducción en `en`.

Esfuerzo estimado: 1.5-2 semanas de trabajo real repartidas en 2 meses. **No se empieza hasta cerrar el semestre** (S5 el 2 oct, S6
después): cambiar las cadenas ahora choca con lo que están usando los estudiantes.

## 7. Estudio de uso (para el artículo B, y como apoyo de A)

Decisión (grill-me): usar la plataforma con la cohorte actual (S1-S6) y reunir evidencia.

Cuidados que hay que resolver **antes** de recolectar nada:
- **Comité de ética / consentimiento informado** de la Universidad del Magdalena (por verificar quién lo exige y en qué formato).
  Sin esto no se publica ningún dato de uso o encuesta.
- **Tamaño de la muestra**: una cohorte de maestría es pequeña (≈ decenas como mucho). Alcanza para un estudio de usabilidad
  exploratorio (SUS, tareas cronometradas, comentarios), **no** para afirmar efectos en aprendizaje. Prever una segunda cohorte
  (2027-1) o otros cursos.
- **Instrumentos**: escala de usabilidad estándar (p. ej. SUS), tiempo por tarea, errores de consistencia (CR) antes/después del aviso; anónimo.
- Las métricas del backoffice (`/admin`) ya cuentan proyectos, expertos y consistencia: definir cuáles serían datos de investigación y anonimizarlas.

## 8. Uso de IA y criterios de las revistas

El repositorio se desarrolló con asistencia de Claude Code (consta en `CLAUDE.md`). JOSS exige declaración de uso de IA y evidencia
de creatividad y diseño humano *(verificado: [blog JOSS, ene 2026](https://blog.joss.theoj.org/2026/01/preparing-joss-for-a-generative-ai-future))*.
**Borrador de declaración — el docente debe confirmar qué es cierto antes de usarla**: qué partes escribió/diseñó él, qué
partes generó la IA, y cómo se verificó (tests contra valores de referencia, notebooks de `pyDecision`, recálculo en
LibreOffice). Verificar la política de cada revista objetivo (SoftwareX, MethodsX, las de GIS) porque varían.

## 9. Cronograma (tentativo)

| Cuándo | Qué |
|---|---|
| Sep-oct 2026 | Curso en curso (S5 2 oct, S6). **Congelar cadenas** de la app. Tramitar ética/consentimiento. R2, R3, R4 |
| Oct-nov 2026 | Ubicar y reproducir el mapa de la boya (§5, pasos 1-3). R1 (repo aparte), R5 (primer release), CI |
| Nov-dic 2026 | Recolectar uso de la cohorte (con consentimiento). R8, R9 |
| Ene-feb 2027 | i18n (es/en) + docs en inglés (R7). Comparación completa del mapa (§5, 4-5) |
| Mar-abr 2027 | **Envío del artículo A** |
| May-jun 2027 | Segunda cohorte o datos ampliados; **envío del artículo B** (cita A) |

## 10. Decisiones abiertas (necesitan al docente)

- **D1 — ¿Repo aparte?** *Recomendado: sí*, `mcda-tools` (o similar) solo con la plataforma, README en inglés, historial limpio; el repo actual queda como material del curso. Alternativa: mantener todo junto y aclarar en el README (peor para revisores).
- **D2 — Datos de Harold** en `plataforma/prototipos/` y en `semilla_priorizacion_ASR.json`: hoy son públicos. Consentimiento de Harold; si se saca, decidir si además se reescribe el historial (hoy sigue accesible en commits antiguos).
- **D3 — Coautoría/permisos** del caso boya 2021 y de los datos (UAC, ANH, INVEMAR, etc.) que aparecen en los shapefiles.
- **D4 — Firma y afiliación** de los artículos (ORCID del docente para `CITATION.cff`; ¿algún estudiante o colega coautor de A o B?).
- **D5 — Hosting**: el dominio `mcda.tools` y el plan gratuito de Supabase/Vercel pueden no bastar para citar una demo durante años. Decidir cómo se archiva (Zenodo del código + captura de la demo).

## 11. Riesgos

- El mapa reproducido no coincide con el de 2021 → se reporta la diferencia y su causa; si la causa es un error nuestro, se corrige antes de enviar.
- El revisor pide comparación con AHP-OS con datos reales → prever una tabla de resultados idénticos sobre 2-3 casos públicos, y explicar los métodos distintos.
- Solapamiento entre A y B → §3: A cita B o viceversa, y ambos declaran qué aporta cada uno.
- Dependencia de Supabase/Vercel → declarar la arquitectura y ofrecer alternativa local.
- «Es solo un proyecto de curso»: se mitiga con uso fuera del curso (segunda cohorte, otro programa).
