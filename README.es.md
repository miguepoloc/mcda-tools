# Plataforma MCDA (`mcda.tools`)

> **Plataforma web de código abierto para el Análisis de Decisiones Multicriterio (MCDA / MCDM) y Modelado de Idoneidad Espacial (GIS-MCDA).**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI Status](https://github.com/miguepoloc/mcda-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/miguepoloc/mcda-tools/actions/workflows/ci.yml)
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23002791.svg)](https://doi.org/10.5281/zenodo.23002791)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL_17_(Supabase)-336791?logo=postgresql)](https://supabase.com/)

**Despliegue en producción:** [https://mcda.tools](https://mcda.tools)  
**Repositorio oficial:** [https://github.com/miguepoloc/mcda-tools](https://github.com/miguepoloc/mcda-tools)  
**Idioma:** [English](README.md) | [Español](README.es.md)

**En producción:** <https://mcda.tools> — landing (`/`) explica qué hace y para quién; `/tutorial` trae la
guía paso a paso; `/login` es donde el estudiante crea cuenta. Nadie necesita este README para usarla, es para quien la
mantiene/despliega.

## Qué hace

| Quién | Qué puede hacer |
|---|---|
| **Estudiante** (con cuenta) | Crea proyectos; define criterios y alternativas; hace la priorización (Parte A); agrega expertos; ve lo que respondió cada uno; ve pesos, consistencia (CR) y ranking; descarga el Excel con la estructura del ejercicio del curso. |
| **Experto** (sin cuenta) | Abre el enlace `/e/<token>` que le dio el estudiante, responde solo sus comparaciones (se guardan solas) y pulsa «Enviar respuestas». No ve nada de otros expertos. |
| **Estudiante por el experto** | Puede llenar los juicios él mismo por un experto (p. ej. tras una entrevista): pestaña *Expertos* → «Llenar yo por él/ella». |
| **Cualquier persona** | Solo ve un proyecto si el dueño lo hace **público** y le comparte el enlace `/p/<token>`. La vista pública muestra resultados, sin nombres de expertos, sin sus enlaces y sin la Parte A. |

Privacidad por diseño: las tablas tienen *Row Level Security*; el dueño solo ve lo suyo, y los expertos y el público entran
únicamente por funciones SQL que validan un token secreto (ver `supabase/migrations/20240101000001_init.sql`), con límite
de frecuencia por token desde `20240101000006_rate_limit_and_constraints.sql`.

## Puesta en marcha (≈ 20 minutos)

### 1. Supabase
1. Crea un proyecto en <https://supabase.com> (plan gratuito sirve para un curso).
2. **SQL Editor** → pega y ejecuta, en orden, los 6 archivos de `supabase/migrations/` (`20240101000001_init.sql` …
   `20240101000006_rate_limit_and_constraints.sql`). Si el proyecto de Supabase está conectado a GitHub (Settings →
   Integrations), esto se aplica solo con cada push a `main` — ver "Despliegue actual" abajo.
3. **Project Settings → API**: copia *Project URL* y la clave *anon / publishable*.
4. **Authentication → URL Configuration**: en *Site URL* pon la URL de Vercel (o `http://localhost:3000` en desarrollo) y en
   *Redirect URLs* agrega `https://TU-DOMINIO/auth/callback` y `http://localhost:3000/auth/callback`.
5. **Authentication → Providers → Email**: deja activo el registro por correo. Si quieres que los estudiantes entren sin
   confirmar el correo (útil en clase), desactiva *Confirm email*; si no, recibirán un mensaje de confirmación.

### 2. Local
```bash
cd plataforma
cp .env.example .env.local     # y pega tus dos claves
npm install
npm run dev                    # http://localhost:3000
npm test                       # comprueba la matemática AHP contra valores de referencia
npm run typecheck
```

### 3. Vercel
1. Sube este repositorio a GitHub e importa el proyecto en <https://vercel.com/new>.
2. **Root Directory**: `plataforma`. Framework: Next.js (se detecta solo).
3. **Environment Variables**: `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Despliega. Luego actualiza *Site URL* y *Redirect URLs* en Supabase con el dominio real.

## Despliegue actual (19-20 sep 2026)
- **Supabase**: proyecto `hymmznfylafdldfngxcu` (`https://hymmznfylafdldfngxcu.supabase.co`), migraciones 000001-000008
  ya ejecutadas; 000009_admin_v2 (22 sep 2026) todavía no — ver nota en "Qué está verificado y qué no". Claves en
  `.env.local` (gitignored) y en Vercel.
- **Vercel**: proyecto `plataforma` en el scope `migue-polos-projects`. Dominio de producción:
  **`mcda.tools`** (comprado directo en Vercel, 22 sep 2026).
  - **Trampa real con la que se perdió tiempo:** Vercel activa protección SSO (`ssoProtection: all_except_custom_domains`)
    para *cualquier* alias que no esté registrado como **Domain** del proyecto (Settings → Domains), aunque apunte al mismo
    deployment que el dominio de producción "de verdad". Un alias creado con `vercel alias set` (CLI) NO cuenta como Domain
    y queda protegido (redirige a `vercel.com/sso-api`, pide login de Vercel) — rompe por completo el propósito de esta app
    (expertos sin cuenta, resultados públicos). Arreglo: agregar el dominio deseado en **Settings → Domains** del dashboard
    (no solo `vercel alias set`); eso lo excluye de la protección igual que el alias automático de producción.
  - Variable de entorno `preview` por rama de Git: `vercel env add NOMBRE preview --value X --yes` a veces la rechaza
    pidiendo desambiguar rama incluso con `--yes` (bug/rareza del CLI 53.x); si pasa, se agrega manualmente desde el
    dashboard con el checkbox de "aplicar a todos los entornos".
- **Supabase Auth → URL Configuration**: *Site URL* en `https://mcda.tools`. En *Redirect URLs*, agregar
  `http://localhost:3000/auth/callback` (dev) y `https://mcda.tools/auth/callback` (prod).

## Traer tu trabajo de la herramienta HTML
En *Mis proyectos* → **Importar de la herramienta HTML**: sube el respaldo `.json` o el `.xlsx` que descargaste de
`prototipos/MCDA_ASR_Harold.html`. Se crean el proyecto, los expertos, los juicios y la priorización.
El Excel que descarga la plataforma usa el mismo formato, así que también se puede volver a cargar en la herramienta HTML.

## Estructura
```
plataforma/
├─ supabase/migrations/                20240101000001_init.sql (tablas, RLS, funciones por token) +
│                                      000002_decision_matrix (method/decision_matrix) + 000003/000004_*_methods
│                                      (amplían method a los 7) + 000005_public_get_weighting_method +
│                                      000006_rate_limit_and_constraints (límite de frecuencia por token +
│                                      longitud máxima en texto libre) + 000007_admin_stats (backoffice, reemplazada
│                                      por 000008) + 000008_admin_role (profiles.role 'user'|'admin', reemplaza el
│                                      email hardcodeado de 000007; no siembra ningún admin) + 000009_admin_v2
│                                      (auditoría CTO+CPO+UX: mezcla de métodos/ponderación, crecimiento semanal,
│                                      embudo de expertos, consistencia AHP agregada, rate-limiter, proyectos
│                                      abandonados, historiales; agrega experts.first_saved_at, profiles.cohort y
│                                      la tabla admin_access_log, ver Visión)
├─ src/app/                            Páginas: /, /tutorial, /metodo, /login, /dashboard, /projects/[id], /e/[token],
│                                      /p/[token], /admin (backoffice, solo profiles.role = 'admin', sin link en el nav)
│                                      icon.tsx, apple-icon.tsx (favicon generado con next/og, ver Historial)
├─ src/components/                     JudgmentEditor, DecisionMatrixEditor, Results, PrioritizationEditor,
│                                      ProjectWorkspace, GeoVisor + GeoMap/GeoLayersPanel/GeoModelPanel (kind:'spatial'), Logo, …
├─ src/lib/                            ahp.ts, topsis.ts, vikor.ts, promethee.ts, electre.ts (cálculo), prio.ts
│                                      (Parte A), excel.ts, legacy.ts/importer.ts, supabase/*, geo/ (geovisor AHP+SIG:
│                                      membership, suitability, crs, grid, vector, raster, mapper, overlay, paint, export,
│                                      data, examples — puros; pack, parse, store — solo navegador), geoExcel.ts
├─ scripts/                            check-{ahp,topsis,vikor,promethee,electre}.ts (matemática), check-excel.ts
│                                      (exportación e ida y vuelta), check-geo-{membership,suitability,crs,raster,export,publish,analysis}.ts,
│                                      geo/export_pack.py (genera public/geo-packs/ desde data/ahp_sig_snsm/cache/
│                                      del repo raíz — no corre en CI, es manual cuando cambia el caso guiado)
├─ supabase/tests/                     run.sh + stubs.sql + geo_rls.sql: corre TODAS las migraciones en un PostgreSQL 17
│                                      temporal y prueba RLS/cuota/publicación/catálogo (`npm run test:db`, necesita
│                                      `brew install postgresql@17`; no toca ninguna base real)
├─ public/geo-packs/                   Paquetes estáticos del geovisor (snsm-cacao-v1: ~810 KB, capas + hillshade)
└─ prototipos/                         Herramientas HTML autónomas, Excel de ejemplo y datos semilla (referencia,
                                       incluye datos de tesis de Harold — ver Notas sobre hacerlo público)
```

## Modelo de datos
- `projects`: dueño, título, objetivo, `kind` (`'decision' | 'spatial'`, default `'decision'` — ver "Geovisor" abajo),
  `method` (`'ahp' | 'topsis' | 'vikor' | 'electre' | 'promethee' | 'saw' | 'fuzzy_topsis'`), `criteria` y
  `alternatives` (JSON), `decision_matrix` (JSON, solo con `method != 'ahp'`: valores por alternativa×criterio + tipo
  beneficio/costo por criterio — un único formato que reusan los métodos de matriz, `src/lib/types.ts` § `DecisionMatrix`),
  `prioritization` (JSON de la Parte A), `geo` (JSON, solo con `kind:'spatial'` — `src/lib/types.ts` § `GeoConfig`),
  `is_public`, `public_token`.
- `experts`: uno por experto del proyecto, con `invite_token`, estado (`pending` → `in_progress` → `submitted`) y quién lo llenó.
- `judgments`: un renglón por par comparado: `(expert_id, sheet, pair_key, value)`. `value ∈ [-8, 8]`; 0 = igual; negativo = gana el primero;
  la intensidad de Saaty es `|value| + 1`. `sheet` es `crit` o `alt:<id del criterio>`.

## Geovisor (AHP + SIG, `kind:'spatial'`)
Un proyecto `kind:'spatial'` ("Mapa de aptitud (SIG)") reemplaza las alternativas por las celdas de un
territorio: en vez de comparar 3-9 opciones, se zonifica un mapa. Es la versión con app de lo que
hace `07_ahp_sig_cacao_snsm.ipynb` (Sesión 5) y del artículo Polo-Castañeda et al. (2021) sobre la
boya oceanográfica — ver `docs/PLAN_geovisor_ahp_sig.md` (plan, UX, fases). Segunda entrega (25 sep
2026): mapa web real, carga de capas propias y exportación; ver Historial.

- **Nace en blanco**, como un proyecto de decisión (3 criterios «Criterio 1/2/3»). Los ejemplos son
  opcionales (`src/lib/geo/examples.ts`): *cacao SNSM* y *boya con datos* (`boya-2021`, paquete
  `public/geo-packs/boya-wsn-v1`); ambos traen datos y admiten añadir mapas propios. (La plantilla de la boya sin datos se retiró el 25 sep 2026.)
- **Boya con datos (`boya-wsn-v1`, 25 sep 2026).** Caso real de la tesis del docente (Polo-Castañeda et al. 2021): las 4 capas ya
  clasificadas 1/2/3 por el autor (1 apto · 3 no apto), reducidas de 38.68×17.89 m a 250 m tomando la moda de cada bloque, EPSG:3116, las
  concesiones como exclusión y fuera de la isóbata de 200 m como sin dato; ≈ 27 KB. Regla `classes` (1→1, 2→0.5, 3→0) y cortes 0.75/0.25
  (= los cortes 1.5/2.5 de `Final/Resultado.shp`). Con los pesos publicados el motor da 83.20 / 13.62 / 3.18 % (original 82.89 / 14.03 /
  3.07 %; **no** los 62.36 / 30.88 / 6.76 % del artículo, que eran un artefacto, ver `docs/PLAN_publicacion.md` §5). El proyecto trae un
  **experto de ejemplo** con la Tabla IV redondeada a la escala entera (pesos 0.541/0.144/0.203/0.111), marcado como reconstrucción y no como
  respuestas reales. Se regenera con `scripts/geo/export-boya-pack.ts` (necesita los rásteres del autor; no corre en CI) y lo prueba
  `scripts/check-geo-boya-pack.ts`. Pendiente: partir de los vectores (distancias) en vez de las clases ya calculadas.
- **`method` se fija en `'saw'`** aunque no haya matriz de decisión ni alternativas: es un atajo
  deliberado para que `JudgmentEditor`/`expert_get` (que ya solo muestran la hoja `crit` cuando
  `method !== 'ahp'`) sirvan sin tocarlos. Los pesos salen del mismo `sheetResult(CRIT_SHEET, …)` de
  `ahp.ts` que usan TOPSIS/VIKOR/etc.; sin juicios se usan pesos iguales (y la UI lo dice).
- **Mapa web (Leaflet, `GeoMap.tsx`)**: mapa base mundial (Satélite Esri, Calles OSM, Relieve
  OpenTopoMap, Océano Esri, Oscuro CARTO), pan/zoom, escala, coordenadas del cursor, capas con
  visibilidad y opacidad, vectores originales, marcadores, dibujo del área de estudio arrastrando un
  rectángulo. Las capas ráster se reproyectan de la grilla (UTM/9377) a Web Mercator **una vez por
  grilla** (`overlay.ts`: retícula gruesa + interpolación, ~60 ms para 1.5 M celdas) y recolorear es un
  `gather`. Necesita red para las teselas (no hay CSP en `next.config.mjs`).
- **Datos, dos orígenes**: `geo.packId` (paquete del catálogo en `public/geo-packs/<id>/`, solo
  lectura, generado por `scripts/geo/export_pack.py`, Uint8+gzip — `snsm-cacao-v1` ~810 KB) o
  `geo.grid` + `geo.layers` (capas del estudiante). La **grilla** se define con un rectángulo lon/lat y
  una resolución en m, en el UTM de la zona (`grid.ts`; tope 1.5 M celdas). Cada archivo subido se
  alinea a ella y se guarda ya alineado como **Float32 + gzip** en Supabase Storage (bucket privado
  `geo-layers`, `<uid>/<proyecto>/<capa>.f32.gz`; migración `20240101000011_geo_storage.sql`; tope
  blando de 60 MB por proyecto en `store.ts` — la cuota editable por admin sigue pendiente).
- **Formatos de entrada** (`parse.ts`): GeoTIFF (ventana + remuestreo, CRS por GeoKeys, EPSG raros
  vía epsg.io), GeoJSON, shapefile en `.zip` (shpjs reproyecta con el `.prj`), KML, GPX. Un vector se
  vuelve *distancia euclidiana en metros* (transformada exacta de Felzenszwalb), *dentro/fuera* o
  *valor de un atributo* (`vector.ts`). Un archivo puede ser **criterio**, **exclusión** (valor > 0 =
  excluido, p. ej. concesiones) o **área de estudio** (valor > 0 = dentro, p. ej. isóbata de 200 m).
- **Reglas de idoneidad** (`membership.ts`, editor en `GeoModelPanel.tsx` con vista previa): por
  rangos (`steps`, Tabla VI del artículo), trapecio, más/menos es mejor, y veto opcional.
  `S = Σ wᵢ·sᵢ(x) × vetos`, 4 clases (UPRA) con umbrales editables; superficie por clase sobre el
  área evaluada (`areaStats`, separa exclusión de fuera-del-área con la máscara).
- **Consulta de punto**: clic en el mapa → % de idoneidad, clase y aporte de cada criterio.
- **Exportar** (pestaña Exportar, `export.ts`): GeoTIFF de idoneidad 0–100 y de clases (UInt8,
  georreferenciados, con estilo `.qml` de QGIS), PNG del mapa (con mapa base, título y leyenda; captura
  las teselas, requiere `crossOrigin`) y solo-resultado transparente, KMZ (Google Earth), CSV de
  píxeles (lon, lat, %, clase), Excel de resumen (`geoExcel.ts`, valores, no fórmulas vivas) y un
  `.zip` con todo + cada capa de entrada como GeoTIFF + `receta.json`.
- **`idoneidad_pendiente` no está definida en `membership.py`** (el notebook la importa y usa, pero
  falta) — se reconstruyó por regresión contra ~200 000 píxeles reales: `down(x, 12, 45)`, error <
  0.01. Documentado en `membership.ts` § `SNSM_CACAO_RULES.pend`; pendiente que el docente decida si
  el notebook debería definirla así.
- **Verificado**: `check-geo-membership/suitability` reproducen a 6 decimales los 4 puntos del
  notebook; `check-geo-crs` (pixel↔lon/lat, UTM, Bogotá); `check-geo-raster` (área rasterizada ±2 %,
  distancia exacta, remuestreo 4326→UTM, interpolación); `check-geo-export` (el GeoTIFF escrito se
  relee con `geotiff.js`: mismos valores, origen, resolución y EPSG; zip/KMZ/CSV). **En navegador
  real** (Playwright contra `next dev`, sin login, con una página de prueba ya borrada): mapa con
  teselas, ejemplo cacao, carga de 5 GeoJSON + 1 GeoTIFF + 1 shapefile en MAGNA (9377), recorte al área,
  exclusión en gris, edición de reglas que actualiza el mapa, dibujo del área, las 10 descargas.
  **No verificado**: la subida/descarga a Supabase Storage (no hay login en la prueba: sin migración
  aplicada la capa queda «solo en esta sesión» y la UI lo avisa), la RLS del bucket, la pestaña dentro
  de `ProjectWorkspace` autenticado, shapefiles con `.prj` exóticos, GeoTIFF > 200 MB.
- **Vista pública** (`/p/<token>` para `kind:'spatial'`): «Geovisor → Exportar → Vista pública». El resultado se
  guarda EN la base (`geo_results`: 2 planos Uint8 idoneidad+clase, gzip, base64, `publish.ts`) y se sirve solo por
  `public_geo_get(token)` (rate limit, exige `is_public`; devuelve `{status:'unpublished'}` si aún no se publicó; nunca
  capas de entrada ni expertos). `PublicGeoView.tsx`: mapa, pesos, superficie por clase, clic → % de idoneidad y clase.
  Al quitar «público» se revoca al instante. Un `sig` en los metadatos avisa si el mapa publicado quedó desactualizado.
  `PublicView.tsx` prueba primero `public_geo_get` y, si es null, cae al `public_get` de siempre.
- **Cuota editable** (migración 12): se mide sobre los objetos REALES de Storage (`storage.objects.metadata.size`), no
  sobre lo que declare el cliente; `geo_check_upload(ruta, bytes)` la exige antes de cada subida (y `cloneLayers` al
  duplicar). Topes globales en `app_settings` (cuota MB, capas, celdas, tamaño publicable) y cuota individual en
  `profiles.geo_quota_mb`, editables desde `/admin` (`GeoAdmin.tsx`). **Bajar la cuota no borra nada**: solo bloquea
  nuevas subidas. La interfaz muestra el uso y «sobre la cuota».
- **Catálogo del docente**: un admin publica un proyecto de mapa suyo como paquete (Geovisor → Exportar → «Catálogo
  del curso»): las capas ya alineadas van al bucket PÚBLICO `geo-catalog` y la configuración a `geo_packs`. Aparece
  como «del curso» en «Punto de partida» de proyectos nuevos y se abre de solo lectura (`geo.packId = 'cat:<id>'`).
  `/admin` los activa, oculta o borra. Los paquetes estáticos (`public/geo-packs`) siguen funcionando.
- **Limpieza de Storage**: al borrar un proyecto se borran sus archivos (`removeProjectFolder`); duplicar un mapa copia
  las capas a la carpeta del duplicado (antes duplicar un mapa lo convertía en proyecto de decisión sin datos: bug
  corregido). Huérfanos: `admin_geo_orphans()` los lista y el admin los borra desde `/admin` — solo huérfanos, con
  una política de Storage acotada (`_geo_is_orphan`); el admin NO puede leer ni borrar capas de proyectos vivos.
- **Tutorial**: `/tutorial#mapas` (qué es, los 4 pasos, papeles de cada archivo, casos, mini-tutorial de la finca
  solar con fuentes de datos y reglas), recorrido guiado in-app (`GeoTour.tsx`, primera visita + botón «Recorrido»),
  aviso en `/metodo`.
- **Verificado**: además de lo anterior, `check-geo-publish` (ida y vuelta del mapa publicado) y
  `supabase/tests/geo_rls.sql` — 65 comprobaciones contra un PostgreSQL 17 real con roles `anon`/`authenticated` y
  `request.jwt.claim.sub` (RLS de `geo_results`/`geo_packs`/Storage, cuota, tope de capas, publicación, vista pública,
  revocación, rate limit, catálogo, huérfanos, EXECUTE cerrado a `anon`; migraciones 10–12 idempotentes). En navegador
  (Playwright, Supabase simulado en memoria) con **datos reales de la tesis** (shapefiles SIAM/INVEMAR en MAGNA Bogotá:
  área de estudio, ecosistemas, rutas de lanchas, pesca artesanal, batimetría, concesiones ANH): carga, recorte al
  área, exclusión, cuota, publicar, vista pública con clic, publicar al catálogo y crear otro proyecto desde él
  (mismas estadísticas), panel de admin. **No verificado**: contra Supabase Storage/Auth reales (los mocks no prueban
  las políticas de Storage reales — solo los stubs de Postgres), el flujo autenticado dentro de `ProjectWorkspace`.
- **Análisis adicional** (`check-geo-analysis.ts`): *superficie desde isolíneas o puntos* (`vector.ts`:
  `nearestSource` + `interpolateSurface`, relajación de Laplace con las celdas conocidas fijas — rampa suave entre
  curvas, plana más allá de la última, no extrapola; 1 M de celdas en < 6 s); regla **valor objetivo** (`target`:
  1 dentro de ± tolerancia, cae linealmente a 0); **parcelas contiguas** de alta aptitud con área mínima
  (`patches.ts`, componentes conexos de 8 vecinos; capa «Parcelas», CSV y GeoTIFF con el número de cada una;
  `geo.minPatchHa`); **comparar escenarios** (guarda el resultado actual como A; capa «Diferencia» rojo/verde y
  tabla en hectáreas; solo en la sesión); **licencia por capa** (`GeoLayerMeta.license`, la escribe el docente al
  publicar al catálogo y se muestra en «Capas»).
- **Falta**: filtro por proximidad a puntos concretos, escenarios persistentes, GeoTIFF multibanda/rotado, y probar
  contra Supabase real (Storage/Auth).

## Qué está verificado y qué no
Verificado aquí: compila (`next build`), el chequeo de tipos pasa, la matemática de los 7 métodos de ranking
(AHP/TOPSIS/VIKOR/ELECTRE/PROMETHEE/SAW/Fuzzy TOPSIS) y de los 2 métodos de ponderación (CRITIC/Entropía) da los
mismos números que sus notebooks/casos de referencia (`npm test`, un `check-*.ts` por método), el Excel de cada
uno de los 7 métodos de ranking tiene las fórmulas correctas y sus valores cacheados coinciden con esa misma
matemática (`npm run test:excel`, un `check-excel-<método>.ts` por método) y la ida y vuelta con el formato de la
herramienta HTML funciona. Para PROMETHEE/ELECTRE (a mano) y SAW/Fuzzy TOPSIS (automatizado, `npm run
test:excel:recalc`), además, se forzó un recálculo real en LibreOffice headless (no solo el valor cacheado) antes
de dar las fórmulas por buenas — ver "Historial de cambios", 20 sep 2026 noche, el hallazgo de `MEDIAN`/`MAX`
sobre una expresión-arreglo. VIKOR sí pasó por ese recálculo real desde el 24 sep 2026 (`check-excel-recalc.ts`, v
editable + condiciones de Opricovic & Tzeng). TOPSIS no ha pasado todavía (solo por el cacheado-vs-JS de
`check-excel-topsis.ts`) — sus fórmulas son más simples (sin `MEDIAN`/`MAX` sobre expresión-arreglo), pero sigue
siendo una verificación pendiente, no hecha. Las rutas
protegidas redirigen a `/login`.

**Ya hay un Supabase real desplegado** (proyecto `hymmznfylafdldfngxcu`, migraciones 000001-000008 ejecutadas,
`role = 'admin'` ya otorgado a mano — `/admin` funciona en producción con la auditoría CTO+CPO+UX todavía **sin**
aplicar: `20240101000009_admin_v2.sql` (22 sep 2026) falta correrla a mano en el SQL Editor, y hasta entonces
`/admin` en producción sigue mostrando solo lo que tenía 000008 —, variables de entorno puestas en local y en
Vercel — production, preview y development) y la app corre en producción en
<https://mcda.tools>. Lo que **todavía no se caminó explícitamente de punta a punta** es el checklist de RLS: la lectura
del SQL (políticas + funciones `SECURITY DEFINER`) se ve correcta, pero eso no reemplaza probarlo contra Postgres real. Pendiente:
1. Crear cuenta e iniciar sesión.
2. Crear un proyecto, agregar un experto y abrir su enlace en una ventana de incógnito: responder y enviar.
3. Con **otra** cuenta, intentar abrir `/projects/<id>` del primer usuario: debe dar «no encontrado».
4. Activar «público», abrir `/p/<token>` en incógnito: se ven resultados sin nombres. Desactivar: deja de verse.
5. Descargar el Excel y abrirlo.

## Historial de cambios

**26 sep 2026 (desglose de cálculo paso a paso, como en las diapositivas 1-4):** auditoría de las sesiones 1-4 contra la
plataforma: los números intermedios (matriz normalizada y ponderada, A⁺/A⁻, contribuciones de VIKOR, matriz π de PROMETHEE,
matrices de AHP, media geométrica…) ya se calculaban pero Resultados y el informe solo pintaban el resultado final. Ahora
`src/components/calc/` trae un desglose por método (`AhpBreakdown`, `TopsisBreakdown`, `VikorBreakdown`, `ElectreBreakdown`,
`PrometheeBreakdown`, `PrioBreakdown` = de la lluvia de ideas a los finalistas, `WeightsBreakdown` = CRITIC/Entropía, más
`HierarchyTree`, `SensitivityReport` y `MethodComparisonReport` con Spearman/Kendall), construido con las piezas comunes de
`CalcKit.tsx` (paso numerado, fórmula, «qué significa», «con tus números», «cómo leerlo»). En **Resultados** cada paso es
desplegable (ancla «Ir al desglose de cálculo»); en el **Informe ejecutivo** es un apéndice con todo abierto (un `<details>`
cerrado no se imprime), más secciones nuevas de selección de criterios, estructura de la decisión, sensibilidad (tablas fijas;
antes el informe decía que no la incluía) y comparación entre métodos. Gráficas corregidas: corte de la priorización (leyenda,
eje, «Pasa/No pasa», brecha), barra de ranking de VIKOR (la más corta es la mejor), distancias al ideal, S-R-Q y Q vs v. El
simulador ya no inventa un ranking de ELECTRE. Excel: bloque «Núcleo» en la hoja ELECTRE y «¿Pasa el corte?» con fórmula viva en
Prior 5. Contadores de la priorización unificados con el Excel (10 → 9 → 7 → 4). Pruebas nuevas: `check-ahp-breakdown`,
`check-breakdown-s3`, `check-outranking-breakdown`, `check-prio-steps`, `check-sensitivity`, `check-integration` (renderiza
Results y el informe por método) y `check-excel-prio` (en `test:excel`). **No verificado:** aspecto visual, impresión y móvil
(solo se renderizó a HTML). **Pendiente:** `exampleData` del informe nunca se pasa desde Results (un caso de ejemplo se
imprimiría sin aviso; falta guardar la marca en el proyecto), la diapositiva 12 (S1) no se reproduce con SAW ni TOPSIS con los
datos de la 11 y la diapositiva 25 (S4) cita Autonomía donde el veto de LoRaWAN sobre Sigfox está en Madurez.

**26 sep 2026 (ELECTRE: núcleo real en vez de «nadie la supera»):** un estudiante preguntó por qué MLP «ganaba» si era
incomparable con todas. Era un error de criterio (los cálculos de c/d y de superación estaban bien): el ✓, el «ganador» de
la comparación entre métodos (y su voto al consenso) y el dictamen del informe usaban «alternativa con nadie que la supere»,
lo que falla con (a) una alternativa **aislada** (no supera ni es superada: cumple «nadie la supera» sin haber ganado nada) y
(b) **ciclos** (A↔B se superan, ambas quedan «superadas» aunque sean las mejores). Ahora `electreKernel()` en `electre.ts`
calcula el núcleo de ELECTRE I (Roy): conjunto sin superaciones internas que supera a todo lo demás, con los ciclos como un
bloque; hay ganador solo si es una única alternativa. Con varios bloques no hay ganador ni voto al consenso; la pantalla
(tarjeta «Núcleo»), el grafo (aro verde = núcleo, punteado = aislada, ✓ = ganadora), la tabla de comparación (○/✓) y el informe
explican la causa con `electreKernelText()`. Pruebas en `scripts/check-electre.ts` (el caso del estudiante incluido).

**25 sep 2026 (bloquear atacantes, desactivar/eliminar cuenta, backoffice en pestañas):** el docente pidió poder
bloquear a un usuario malicioso desde el admin y que cada usuario pueda desactivarse; y revisar la UX del admin.
- **Hallazgo grave, corregido primero (migración `…14_profiles_lockdown.sql`, aplicable sola):** `profiles_self` era
  `for all` sobre la propia fila, así que **cualquier usuario con sesión podía `PATCH profiles {"role":"admin"}` y
  volverse admin** (o subirse `geo_quota_mb` a 10 GB). Reproducido en el PostgreSQL de pruebas. Ahora `authenticated`
  solo lee su fila y solo puede actualizar `full_name` (privilegio por columna). **Aplicar esta migración ya**; si
  hubo tiempo entre el despliegue y ahora, conviene revisar `select email from auth.users u join profiles p using (id)
  where p.role = 'admin'` por si alguien más se promovió.
- **Estados de cuenta (`…15_account_status.sql`):** *activa* / *desactivada* (`paused_at`, la pone y quita el propio
  usuario; volver a iniciar sesión la quita) / *suspendida* (`suspended_at`, solo un admin). Se hace cumplir en 4 capas:
  políticas RLS **restrictivas** (no hubo que tocar las existentes) en `projects/experts/judgments/geo_results` y en
  `storage.objects` del bucket `geo-layers` — cortan al instante aunque el JWT siga vigente (~1 h); las funciones
  `SECURITY DEFINER` que se saltan RLS (`geo_*`, `expert_*`, `public_get`, `public_geo_get`) comprueban el estado por
  dentro, así **los enlaces `/e/…` y `/p/…` del dueño se apagan y vuelven al reactivar**; `auth.users.banned_until`
  (`now()+100 años`, no `infinity`: GoTrue lo lee desde Go) al suspender; y el middleware (solo UX) cierra sesión y manda a
  `/login?motivo=`. Suspender exige motivo (queda en `account_events`, que el usuario no ve), no se puede suspender a un
  admin ni a uno mismo, y un usuario suspendido no puede «pausarse», reactivarse iniciando sesión ni eliminarse para escapar.
- **`/cuenta`** (el correo de la barra superior enlaza ahí): «Desactivar mi cuenta» (pausa reversible) y «Eliminar mi
  cuenta y mis datos» (confirmación escribiendo el correo). Eliminar borra primero los archivos de Storage **por la API**
  (borrar filas de `storage.objects` desde SQL deja el archivo huérfano) y luego llama `delete_my_account()`, que borra
  `auth.users` y cae todo en cascada; de la auditoría se borra el correo. Los admin no se desactivan ni eliminan desde ahí.
- **Backoffice `/admin` en pestañas** (`?tab=resumen|usuarios|proyectos|seguridad|mapas`, enlaces reales, con insignia de
  cuentas suspendidas): «Atención» con lo que pide acción; tabla de usuarios con búsqueda sin tildes, filtros (suspendidas,
  desactivadas, nunca entraron, inactivas +14 d), orden por columna (`aria-sort`), **último login**, estado con icono+texto
  y Suspender/Reactivar con diálogo de confirmación accesible (`ConfirmDialog`: foco atrapado, Escape, restaura foco);
  registro de acciones sobre cuentas; accesos al backoffice agrupados (cada pestaña con `admin_stats` registra un acceso).
  Arreglado de paso: la etiqueta de las barras al 100 % se salía de la tarjeta; la pestaña Mapas desbordaba en móvil.
- **Admin sobre cuentas ajenas:** además de Suspender/Reactivar, **Confirmar correo** (`admin_confirm_user_email`, para quien
  no recibió el mensaje de activación; solo si te consta que el correo es de la persona) y **Eliminar** (`admin_delete_user`:
  motivo obligatorio, se confirma escribiendo el correo, cascada igual que la autoeliminación). Aquí la auditoría **conserva**
  el correo y el motivo (a diferencia de la autoeliminación, que lo borra). Los archivos de mapas de una cuenta eliminada
  quedan huérfanos y se limpian en Mapas. Nuevo filtro «Correo sin confirmar» y etiqueta en la fila.
- **Último login = `auth.users.last_sign_in_at`:** cambia al *iniciar sesión*, no al renovarse el token; quien deja la
  sesión abierta días se ve «antiguo». Para actividad real haría falta un `last_seen_at` desde el middleware.
- **Trampa:** una `<span class="sr-only">` (absoluta) dentro de un contenedor con `overflow-x:auto` **no queda recortada**
  si el contenedor no es `position:relative` y ensancha todo el documento; `.tbl` ahora lo es.
- **Verificado:** `npm run test:db` (nuevo `supabase/tests/account_status.sql`, ~60 comprobaciones: escalamiento cerrado,
  enlaces apagados/vueltos, cascada al eliminar, auditoría; y migraciones 10–15 idempotentes), `npm test`
  (`check-admin-users.ts`), typecheck, build y un recorrido en navegador contra un mock de Supabase (escritorio, móvil 390 px,
  claro/oscuro, sin errores de consola). **No verificado contra el Supabase real:** que `postgres` pueda `update/delete` sobre
  `auth.users` desde las funciones (debería, como en el SQL Editor) ni la política restrictiva sobre `storage.objects` — probar
  con una cuenta de prueba tras aplicar (suspender → no entra; reactivar → entra; eliminar → desaparece en Authentication).
- **Fuera de alcance, a propósito:** suspender bloquea la *cuenta*, no a la persona (puede registrarse con otro correo):
  el freno de verdad es CAPTCHA en Supabase → Authentication → Attack Protection (ajuste del panel, no de código).

**25 sep 2026 (geovisor AHP + SIG, cuarta entrega: análisis):** cerró lo que faltaba — superficie desde isolíneas
(la batimetría de la tesis son isolíneas de 100 m; `numericFields` ahora tolera filas sin valor), regla de valor
objetivo, parcelas contiguas mínimas, comparar escenarios y licencias por capa. Probado en navegador con isolíneas
sintéticas (20/50/100/200 m). `Google Drive/My Drive/Maestria/Tesis` sigue sin poder leerse: es el permiso de macOS
(Privacidad y seguridad → Archivos y carpetas / Acceso total al disco) de la app que corre la sesión, no de Drive.

**25 sep 2026 (geovisor AHP + SIG, tercera entrega: publicar, cuota, catálogo, tutorial):** el docente pidió cerrar
lo pendiente y dio la ruta de su tesis (`Maestria/Tesis/MAPAS`, `Maestria/Tesis_Mapas`), que sirvió de prueba real.
- Migración `20240101000012_geo_publish_quota_catalog.sql` (**aplicar**, además de la 11): `is_admin()`, `app_settings`,
  `geo_quota`/`geo_check_upload`/`geo_settings`, `geo_results` + `geo_publish_result` + `public_geo_get`, `geo_packs` +
  bucket público `geo-catalog`, funciones `admin_*`, y revocación explícita de EXECUTE a `anon` (en Supabase, `revoke
  from public` no quita los grants por defecto a `anon`/`authenticated`; incluye `_rate_limit`, que estaba abierta).
- Hallazgos al probar contra Postgres real: un `DELETE ... WHERE` en Storage exige también política de `SELECT`
  (el admin no podía limpiar huérfanos); y con datos reales, un archivo de concesiones de todo el país agrandaba el
  área propuesta a Colombia entera — ahora manda el archivo marcado «Área de estudio».
- Nuevo: `supabase/tests/` (`npm run test:db`), `check-geo-publish.ts`, `GeoPublishPanel`, `GeoCatalogPanel`,
  `GeoAdmin`, `PublicGeoView`, `GeoTour`, `GeoHud`, `lib/geo/{publish,catalog,useExamples,canvas}.ts`.
- `GeoVisor` y `PublicGeoView` se cargan con `next/dynamic` (`/projects/[id]` bajó de 311 a 241 kB).
- Trampa (otra vez): `npm run build` con `npm run dev` activo pisa `.next`; reiniciar el dev server.

**25 sep 2026 (geovisor AHP + SIG, segunda entrega: mapa web real, capas propias y exportación):** el
docente probó la primera entrega y señaló tres fallos de diseño: cargaba criterios y datos «de una»
(debía nacer en blanco, con un botón de ejemplo), no había dónde subir mapas (su caso: la boya de la
tesis — ecosistemas, tráfico, pesca y batimetría, con concesiones excluidas y la isóbata de 200 m
como área), y «no es un geovisor» (una imagen con zoom CSS, sin mapa del mundo). Se rehízo:
- Leaflet (`GeoMap.tsx`), `GeoLayersPanel.tsx`, `GeoModelPanel.tsx`, y en `src/lib/geo/`: `grid`,
  `vector`, `raster`, `mapper`, `overlay`, `paint`, `export`, `data`, `examples`, `parse`, `store`;
  `geoExcel.ts`; `NewProject` nace en blanco con «Punto de partida» opcional.
- Nuevos `check-geo-raster.ts` y `check-geo-export.ts` en `npm test`; `check-geo-crs.ts` ahora prueba
  UTM/Bogotá (usaba EPSG:3116 como «CRS desconocido», ahora se define).
- Deps nuevas: `leaflet`, `geotiff`, `shpjs`, `@tmcw/togeojson`, `fflate`, (dev) `@types/leaflet`, `@types/shpjs`.
- Migración nueva `20240101000011_geo_storage.sql` (bucket `geo-layers` privado + 4 políticas por carpeta
  de usuario). **Hay que aplicarla** (SQL Editor o push a `main`) o las capas subidas no persisten.
- Bugs reales encontrados probando en navegador: una carrera entre la caché de capas y el render de
  React hacía perder la primera capa de un lote (la caché ya no se purga por comparación con
  `geo.layers`); el polígono rasterizado engordaba ~½ píxel por burnear el contorno (ahora solo si no
  rellenó ninguna celda); cortes de rango desordenados daban un mapa absurdo (se ordenan al salir del campo).
- Trampa de desarrollo: correr `npm run build` mientras `npm run dev` está activo pisa `.next` y el
  cliente da 404 en `main-app.js` — reiniciar el dev server.

**25 sep 2026 (geovisor AHP + SIG, primera entrega real — no maqueta):** tras una ronda de maquetas
estáticas (`docs/PLAN_geovisor_ahp_sig.md`, hechas con datos y CSS reales pero sin código de app) el
docente pidió aplicarlo. Se implementó el geovisor de punta a punta para el caso guiado de la Sesión
5 (aptitud cacaotera, Sierra Nevada de Santa Marta), con datos y matemática reales, no simulados:
- `projects.kind` (`'decision'|'spatial'`) + `projects.geo` (jsonb), migración `20240101000010_spatial_projects.sql`.
  Sin RLS nueva: la política `projects_owner` de 0001_init.sql ya cubre estas columnas por ser de la misma fila.
- `src/lib/geo/{membership,suitability,quant,crs}.ts` (puros, `check-geo-*.ts` los verifica contra
  el notebook 07: los 4 puntos de ejemplo a 6 decimales, ida y vuelta de coordenadas exacta) y
  `src/lib/geo/pack.ts` (fetch + `DecompressionStream` nativo, sin dependencia de compresión).
- `scripts/geo/export_pack.py`: genera `public/geo-packs/snsm-cacao-v1/` (~810 KB) desde
  `data/ahp_sig_snsm/cache/` del repo raíz — el mismo caché que ya calculó el notebook, no se
  descargó ni recalculó nada.
- `GeoVisor.tsx`: pesos reales del panel de expertos (mismo `sheetResult` que ya usan
  TOPSIS/VIKOR/…), mapa en `<canvas>` con zoom/pan, consulta de punto con coordenadas reales
  (EPSG:9377→lon/lat vía `proj4`), "Explorar pesos" sin tocar los del panel, umbrales de clase
  editables en vivo, hectáreas por clase, exportar PNG. Cableado en `ProjectWorkspace.tsx`
  (`TABS_SPATIAL`, sin Matriz de decisión/Resultados/Comparativa — las alternativas son píxeles) y
  `NewProject.tsx` (selector Decisión/SIG, caso guiado precarga los 4 criterios con sus reglas).
- **Hallazgo al construir el paquete**: `idoneidad_pendiente` no existe en `membership.py` aunque el
  notebook la usa — se reconstruyó por regresión contra el raster real (`down(x,12,45)`, error <
  0.01), documentado en `membership.ts` § `SNSM_CACAO_RULES`. No se tocó el notebook; el docente
  decide si corresponde definirla ahí.
- **Corregido en la maqueta previa, aplica también aquí**: nombres de clase CSS cortos y genéricos
  (`.val`, `.track`, `.fill`…) chocan con reglas ya existentes en `globals.css` — todo lo nuevo del
  geovisor usa el prefijo `.gv-`.
- Verificado: `npm test` (incluye los 3 `check-geo-*.ts` nuevos), `npm run typecheck`, `npm run
  build` — los tres en verde —, y `scripts/geo/smoke-fetch.mjs` (manual) contra un `next start`
  real: fetch + gzip + decuantización reproducen el dato del notebook. **No verificado / no hecho**:
  cargar capas propias, exportar GeoTIFF, vista pública para `kind:'spatial'`, cuota/admin — quedan
  para la siguiente entrega del plan.

**24 sep 2026 (criterio de tipo OBJETIVO en la matriz de decisión; grill-me con el docente):** un estudiante quería
ubicar paneles solares donde el voltaje de la red fuera 110 V, y la plataforma solo conocía beneficio (más es mejor)
y costo (menos es mejor). Se agregó el tercer tipo, "nominal-the-best" de Taguchi (Sesión 3, diapositiva 34).
Decisiones del grill-me: (1) el objetivo lleva una **tolerancia ±** opcional, distancia = `max(0, |x − objetivo| −
tol)`: 0 dentro de la banda y distancia al borde fuera de ella (tol = 0 → valor exacto; sirve para "110 V ±5 %" y
para rangos como el pH 5.5-7.0 del cacao, objetivo 6.25 ± 0.75); (2) el editor de la matriz tiene un tercer botón
«Objetivo» (oculto en Fuzzy TOPSIS, que usa etiquetas) con dos campos, objetivo y tolerancia, y muestra la
distancia bajo cada celda; (3) todos los métodos cuantitativos lo soportan, incluidos los pesos CRITIC/Entropía, con
**una sola transformación previa**: `resolveTargets()` (topsis.ts) devuelve una matriz efectiva donde cada criterio
objetivo se reemplaza por su distancia y pasa a `'min'`, así que TOPSIS/VIKOR/PROMETHEE/ELECTRE/SAW no cambiaron;
(4) si falta el objetivo, la columna es neutra (distancia 0) y `Results` avisa «Falta el valor objetivo de…»;
(5) se guarda dentro del JSON `decision_matrix` (`types[c] = 'target'` y `targets: {c: {value, tol}}`), sin
migración, como `vikorV`; `getType()` trata 'target' como costo por seguridad, pero solo tiene sentido sobre la
matriz ya resuelta; (6) el Excel agrega a la hoja «Matriz de decisión» las filas Objetivo y Tolerancia y un bloque de
**matriz efectiva** con `=MAX(0,ABS(x−objetivo)−tol)`; `matrixSheet()` devuelve `rType`/`rData0` apuntando a ese
bloque, así que las hojas de cada método no cambiaron y reciben la matriz resuelta para los valores cacheados.
`Results` calcula sobre la matriz efectiva y muestra la cruda (con la distancia) en el detalle y en el Informe
Ejecutivo. Verificado: `check-targets.ts` (nuevo, en `npm test`) reproduce el ejemplo inventado de los sitios
solares del deck (objetivo 110 V: Ci [0.929, 0.866, 0.480, 0.049]; tratado mal como beneficio o costo gana el Sitio C,
a 10 V del objetivo; con ±5 %: [0.941, 0.889, 0.614, 0.040]), la columna constante y el objetivo faltante en todos los
métodos, y la persistencia; `check-excel-vikor.ts` comprueba la ida y vuelta por `_datos`; `check-excel-recalc.ts`
recalcula en LibreOffice un caso solar con criterio objetivo (matriz efectiva y hoja VIKOR). Verificación visual:
editor + resultados en una página temporal (borrada), captura con Chrome headless; sin probar contra Supabase real.

**24 sep 2026 (VIKOR: selector de v, condiciones de compromiso y sensibilidad; grill-me con el docente):** la
plataforma calculaba VIKOR con `v = 0.5` fijo (parámetro por defecto de `vikor()`, que `vikorSynthesis()` nunca pasaba;
las fórmulas del Excel llevaban `0.5` escrito a mano, "sin UI para cambiarlo") y mostraba "gana el Q más bajo" aunque
el método no declarara un ganador único. Tras corregir esas dos cosas en el deck de la Sesión 3 (diapositivas 22-29
y 47, `sesiones/sesion-03/`), se llevó lo mismo aquí. Decisiones del grill-me: (1) las tres piezas juntas: selector
de v, verificación de las 2 condiciones de Opricovic & Tzeng (2004) y sensibilidad (tabla + gráfica); (2) v vive dentro
del JSON `decision_matrix` como `vikorV` opcional (sin migración: `public_get`/`expert_get`, los respaldos `.json` y la
hoja `_datos` ya lo transportan; falta o fuera de [0, 1] = 0.5, ver `normalizeMatrix()`); lo edita solo el dueño
(`ProjectWorkspace` pasa `onChangeV` y se guarda con el debounce de siempre), en la vista pública el selector cambia
solo la pantalla, sin tocar el proyecto; (3) el Excel tiene una celda de v editable (`B{rVin}` de la hoja VIKOR) a la
que apuntan las fórmulas de Q, más DQ, ΔQ, condición 1, condición 2, veredicto y una columna «En conjunto de
compromiso», todo con fórmulas vivas; (4) si falla la condición 1 el veredicto es un **conjunto de compromiso**
(todas las alternativas con Q − Q(1º) < 1/(m−1)), si falla solo la 2 son el 1º y el 2º, y ese conjunto reemplaza
al "Ganador" en `Results`, en el Informe Ejecutivo y en la pestaña Comparativa (donde el #1 de VIKOR sin ganador único
se marca ◆ y no cuenta como primer lugar del consenso); (5) `VikorPanel.tsx` muestra el selector (con la aclaración
explícita de que v NO se deriva de los datos y 0.5 es convención, Alidrisi 2021), el veredicto con sus 2 condiciones,
una tabla de Q por v (0, 0.25, 0.5, 0.75, 1, el v actual y los v donde cambia el 1er lugar, ver
`vikorFirstPlaceChanges()`: Q es lineal en v) y una gráfica SVG de Q según v, sin librería nueva. Verificado:
`check-vikor.ts` reproduce las tablas del deck (viaje: Sur gana con v < 0.4, empate en 0.4 con Q = 0.400, Centro con
v > 0.4, conjunto de 3 rutas con v = 0.5; caso real: Sigfox 1º con todo v y ganador único), `check-excel-vikor.ts`
comprueba la celda de v y su ida y vuelta por `_datos`, y `check-excel-recalc.ts` ahora recalcula VIKOR en
LibreOffice (celdas arruinadas a propósito) incluyendo v, DQ, ΔQ, condiciones, veredicto y la columna del conjunto.
Verificación visual: `Results` con el panel renderizado en una página temporal (borrada) y captura con Chrome
headless; no se probó todavía con un proyecto real en Supabase.

**22 sep 2026 (backoffice v2 — auditoría CTO+CPO+UX):** una vez `/admin` funcionaba, se le pidió una
revisión real de qué le falta — dos subagentes leyeron el schema/código real (no una lista genérica) y
entregaron cada uno una auditoría independiente: un CTO (¿es seguro y correcto lo que ya hay? ¿qué
señal técnica falta?) y un CPO/CEO (¿qué necesita saber el docente de cómo usan SUS estudiantes la
plataforma?), más una revisión UX de cómo debía evolucionar el layout. Se llevó todo eso a un
`/grill-me` con el docente para priorizar qué entra en esta pasada. `20240101000009_admin_v2.sql`
reescribe `admin_stats()` (ya no es un solo IF de agregados, ver Visión) y agrega `admin_ahp_raw()`:

- **Mezcla de métodos/ponderación** (`projects.method`/`weighting_method`, ya existían) — dónde
  reforzar clase, como barras horizontales con los mismos colores `--m-*` que ya usa el selector de
  método (no colores nuevos).
- **Crecimiento semanal** (usuarios/proyectos/juicios, últimas 8 semanas) como sparklines — encaja con
  el ritmo real de 3 fines de semana, no un total estático. `judgments` no tiene `created_at` (solo
  `updated_at`), así que "juicios nuevos" es un proxy de altas+ediciones, no altas puras — documentado
  en la migración, no escondido.
- **Embudo de expertos con tiempos** (invitado → empezó → envió) — para esto se agregó
  `experts.first_saved_at` (se fija una sola vez, la primera vez que `expert_save()` mueve a alguien de
  `pending` a `in_progress`), porque el proxy anterior (`min(judgments.updated_at)`) se corre hacia
  adelante cada vez que un experto EDITA una respuesta ya dada.
- **% de expertos auto-llenados por el dueño** (`experts.filled_by`) — mide si el flujo multi-experto
  que enseña el curso se usa de verdad.
- **Consistencia de los juicios AHP, agregada** — `analyze()` en `ahp.ts` ya calculaba la razón de
  consistencia (`cr`, corte en 0.10) por matriz pero nunca se guardaba en ningún lado. En vez de
  reimplementar la iteración de eigenvector en SQL (riesgo real de que diverja del cálculo que YA usa
  `ExpertFlow.tsx` en vivo), `admin_ahp_raw()` devuelve los juicios crudos y `src/lib/admin.ts`
  (`computeAhpConsistency()`) corre la MISMA función de `ahp.ts` server-side.
- **Proyectos abandonados** (≥14 días sin tocarse, ningún experto que haya enviado) e **historiales
  cronológicos de usuarios/proyectos con detalle individual** — a propósito rompen la regla original de
  "solo agregados, nunca datos de un proyecto individual" del primer `admin_stats()`; el docente lo pidió
  explícitamente sabiendo que era un cambio de esa regla, no un descuido.
- **Visibilidad del rate-limiter** (picos de llamadas/minuto por función contra los límites hardcodeados
  en `20240101000006`, con aviso si se acerca) y un **log de acceso al propio backoffice**
  (`admin_access_log`, mismo patrón sin políticas RLS que `rate_limit_log`) — relevante ahora que
  `promote_to_admin()` ya permite un segundo admin.
- `profiles.cohort` se agregó también, sin usarse todavía en ningún query — para que "crecimiento
  semanal" no pierda sentido el día que el curso se repita con una segunda cohorte.

Layout: las tarjetas de totales (ya existentes) se quedan igual; todo lo nuevo con forma de tendencia o
distribución usa el widget que le corresponde (barras, sparkline, embudo escalonado), no más tarjetas —
una dona con 7 categorías habría violado la regla de no usar pie/dona con más de 5. **Pendiente**: esta
migración todavía no se ha corrido contra el Supabase real (ver "Qué está verificado y qué no").

**22 sep 2026 (el admin deja de ser un email hardcodeado):** `20240101000007_admin_stats.sql`
comparaba `auth.email()` contra un correo literal dentro de la función — funcionaba, pero significaba
que "quién es admin" era texto fijo en un archivo de migración versionado. `20240101000008_admin_role.sql`
lo reemplaza: agrega `profiles.role text default 'user' check (role in ('user','admin'))` y reescribe
`admin_stats()` para revisar `role = 'admin'` en vez del correo. A propósito **no** siembra ningún admin
en la migración (eso sí seguiría siendo un correo en git, solo que en un UPDATE en vez de un IF) — el
primer admin se otorga a mano, una sola vez, con un UPDATE corrido directamente en el SQL Editor, que no
queda en ningún archivo del repo. Para el segundo admin en adelante (p.ej. un co-instructor) ya no hace
falta tocar SQL a mano: `promote_to_admin(p_email)`, otra función `security definer`, deja que cualquier
admin YA existente promueva a alguien más por su correo. Ya está corrida contra el Supabase real y el
UPDATE manual ya se ejecutó — `/admin` funciona en producción desde este día.

**22 sep 2026 (backoffice admin, solo lectura):** nueva ruta `/admin` — no hay link a ella en `Topbar`.
Muestra únicamente agregados numéricos (proyectos totales/públicos/privados, usuarios registrados,
expertos por estado, suma de criterios/alternativas, total de juicios), nunca datos de un proyecto
individual de otro usuario. La autorización vive en una sola función SQL `security definer`,
`admin_stats()`, que agrega `count()`/`sum()` sobre `projects`/`profiles`/`experts`/`judgments` — mismo
patrón que `expert_get`/`public_get`, sin tocar RLS ni agregar ninguna clave de servicio nueva al
proyecto. La página (`src/app/admin/page.tsx`) llama esa función vía `supabase.rpc('admin_stats')`; si
quien pide no es admin, la función lanza una excepción y la página redirige a `/dashboard` sin distinguir
"no autorizado" de "no encontrado". (El chequeo de autorización original, por email hardcodeado, se
reemplazó el mismo día — ver la entrada de arriba.)

**20 sep 2026 (auditoría de diseño/código/seguridad/UX de la plataforma):**
- **Seguridad**: nueva migración `20240101000006_rate_limit_and_constraints.sql` — límite de frecuencia
  por token (tabla `rate_limit_log` + función `_rate_limit()`) en `expert_get`/`expert_save`/
  `expert_submit`/`public_get`, y tope de longitud en `title`/`objective`/`name`/`role_desc` (antes solo
  truncado cosmético en la UI, sin cota en la base). `src/lib/errors.ts` (`friendlyError()`) traduce los
  16 puntos donde se mostraba `error.message` crudo de Postgres al estudiante a mensajes en español; el
  error real solo va a la consola. `scripts/check-rls.ts` (`npm run test:rls`) camina de punta a punta el
  checklist de RLS que este mismo README marcaba como nunca probado contra Postgres real (cuentas
  cruzadas, enlace de experto, toggle público, y ahora también el límite de frecuencia).
- **Accesibilidad**: `ScientificMethodModal` y `ExecutiveReportModal` no tenían `role="dialog"`,
  `aria-modal` ni trampa de foco (a diferencia del modal de borrar proyecto en `ProjectList.tsx`, que sí
  los tenía) — corregido en ambos, con foco inicial en el panel y Tab/Shift+Tab contenido dentro.
- **`<Topbar />` compartido**: el bloque logo + "Plataforma MCDA" + badge + subtítulo estaba copiado casi
  idéntico en 9 archivos (landing, login, dashboard, proyecto, tutorial, método, update-password,
  ExpertFlow, PublicView). Ahora es un solo componente (`src/components/Topbar.tsx`) con `badge`/
  `subtitle`/`href`/`children` (para lo que cada página necesite a la derecha).
- **`excel.ts` dividido**: las 975 líneas que mezclaban helpers compartidos (`colL`/`qs`/`W`/estilos por
  color) con las 7 hojas por método ahora son `excel-core.ts` (compartido + Criterios + Matriz de
  decisión) y un `excel-<método>-sheet.ts` por cada uno de TOPSIS/VIKOR/PROMETHEE/ELECTRE/SAW/Fuzzy
  TOPSIS; `excel.ts` solo orquesta (`buildWorkbook`/`buildPrioWorkbook`). Mismo output exacto, verificado
  con `npm test` + `npm run test:excel` + `npm run test:excel:recalc` antes y después.
- **SAW y Fuzzy TOPSIS ya tienen su `check-excel-*.ts`** (antes solo los otros 5 métodos): valores
  cacheados contra `sawSynthesis()`/`fuzzyTopsisSynthesis()`, ida y vuelta por `_datos`, y —nuevo,
  `scripts/check-excel-recalc.ts` (`npm run test:excel:recalc`)— un recálculo real en LibreOffice
  headless (arruina a propósito el valor cacheado de cada celda con fórmula y confirma que LibreOffice la
  recalcula al valor correcto), automatizando el mismo mecanismo que hasta hoy solo se había corrido a
  mano para VIKOR/PROMETHEE/ELECTRE (ver más abajo, "20 sep 2026 noche").
- **Caso IoT/Palmor como plantilla**: `NewProject.tsx` trae un checkbox "Empezar con el caso de ejemplo
  del curso" que precarga los 4 criterios y 4 alternativas reales de Sesiones 1-3 (y la matriz de datos,
  para los métodos que no sean AHP/Fuzzy TOPSIS) en vez de "Criterio 1/2/3" — antes todo proyecto nuevo
  arrancaba en blanco.

**20 sep 2026 (noche, cierre del roadmap de Excel):**
- **VIKOR, PROMETHEE y ELECTRE ya exportan a Excel con fórmulas vivas** (`vikorSheet()`, `prometheeSheet()`,
  `electreSheet()` en `excel.ts`) — los 5 métodos tienen su propia hoja ahora, ninguno arma ya la estructura de AHP
  como referencia. Cada uno verificado en su propio `scripts/check-excel-{vikor,promethee,electre}.ts` contra el
  mismo caso IoT/Palmor que sus respectivos `check-{vikor,promethee,electre}.ts`.
- **Hallazgo real, no obvio, que casi pasa sin probarse**: la primera versión de PROMETHEE usaba el truco de Excel
  `MEDIAN(0,1,rango)` dentro de `SUMPRODUCT` para "recortar" cada elemento de un arreglo a [0,1] sin fórmula
  matricial (Ctrl+Shift+Enter), y ELECTRE usaba `MAX(expresión-sobre-un-rango)` para la discordancia. Los valores
  cacheados en el `.xlsx` coincidían perfecto con `prometheeSynthesis()`/`electreSynthesis()` porque esos números
  los calcula el mismo JS que arma el archivo — pero eso no prueba que la **fórmula** funcione en un motor de hoja
  de cálculo real. Se forzó un recálculo real abriendo los archivos en LibreOffice en modo headless (con una macro
  Basic que llama `calculateAll()` y regrabra, sobre unos `.xlsx` de prueba con los valores cacheados
  deliberadamente arruinados para que solo la fórmula pudiera dar el número correcto) y ambos fallaron: `MEDIAN`
  y `MAX` no se evalúan elemento a elemento sobre una expresión-arreglo sin entrarse como matricial, dan un
  agregado sin sentido. Corregido: PROMETHEE ahora arma el recorte con comparaciones y aritmética pura —
  `(d>0)*(d<1)*d + (d>=1)*1` — que sí vectoriza sin modo matricial (es la misma base del truco SUMPRODUCT de
  siempre); ELECTRE arma una grilla de "candidato a discordancia" por criterio (una celda real por cada
  alternativa/alternativa/criterio) y la discordancia final es `MAX()` de esas celdas reales, no de una expresión —
  el uso más básico de `MAX()`, siempre confiable. Las dos correcciones se reverificaron con el mismo mecanismo de
  LibreOffice antes de darlas por buenas.
**20 sep 2026 (noche):**
- **Excel principal y Excel de priorización, separados**: antes un único `.xlsx` traía siempre las 5 hojas
  "Prior 1-5" (priorización de criterios, Sesión 1) pegadas al método — ahora hay dos botones ("Descargar Excel" /
  "Descargar Excel de priorización"), `buildWorkbook()` (Notas + Criterios + hojas del método + `_datos`) y
  `buildPrioWorkbook()` (Notas + Prior 1-5, sin `_datos`) en `excel.ts`. El respaldo completo para reimportar
  (incluida la priorización) sigue viviendo solo en el Excel principal — el de priorización es un documento aparte,
  no una segunda fuente de verdad.
- **Un color de acento por método en el Excel, no uno fijo para todos**: antes cada hoja (título, encabezados,
  subtítulos de "Experto N") usaba siempre el mismo violeta `8B6CFF`, sin importar el método — TOPSIS y VIKOR se
  veían idénticos. Ahora `METHOD_COLOR` en `excel.ts` da un color propio a cada uno (violeta AHP, verde-azulado
  TOPSIS, azul VIKOR, rosa PROMETHEE, morado ELECTRE — misma lógica de familia que la landing, pero los 5
  distinguibles entre sí); el Excel de priorización usa el neutro del curso (`7F869C`), porque la priorización es
  previa a elegir método. Verificado en `scripts/check-excel-colors.ts`.
- **Quitado el bloque "Verificación con el método EXACTO (Saaty, 1980): iteración de potencias"** de la hoja
  Criterios (y de cada hoja de alternativas por criterio en AHP): eran ~20 filas de fórmulas redundantes con la
  columna «Vector prioridad» de más arriba, pensadas como demostración matemática y no como algo que un estudiante
  necesite revisar en su informe.

**20 sep 2026 (tarde, grill-me):**
- **Borrado de proyecto**: `ProjectList.tsx` pasó de un botón "✕" con confirmación de dos clics a un modal estilo
  AWS (ícono de basurita, hay que **escribir el nombre exacto del proyecto** para habilitar "Eliminar proyecto") —
  incluye el estado `:disabled` del botón en `globals.css`, que faltaba y hacía que se viera activo aunque no lo
  fuera.
- **Vercel conectado a GitHub**: antes cada deploy a producción era `vercel --prod` manual (y de hecho un deploy de
  VIKOR/ELECTRE/PROMETHEE quedó pusheado pero sin desplegar por varias horas hasta notarlo). Ahora el proyecto
  (renombrado `mcda` en el dashboard, Root Directory = `plataforma`) despliega solo con cada push a `main`.
- **Landing (`/`) ya no habla solo de AHP**: eyebrow/H1/stats neutrales, sección nueva "5 métodos" con los colores
  de familia reales del curso (`sesiones/pptx_theme.py` del docente: violeta `#8B6CFF` comparación por pares
  AHP/ANP, verde-azulado `#5FD4C7` distancia al ideal TOPSIS/VIKOR, magenta `#FF5DA2` sobreclasificación
  ELECTRE/PROMETHEE — mismos que usan las diapositivas de sesión, ver `--fam-pares`/`--fam-dist`/`--fam-out` en
  `globals.css`).
- **TOPSIS ya exporta a Excel con fórmulas vivas**: hojas nuevas "Matriz de decisión" (valores reales +
  beneficio/costo por criterio) y "TOPSIS" (normalización vectorial, ponderación con el peso de la hoja Criterios,
  ideal mejor/peor, distancias D+/D-, cercanía Ci, ranking — mismas fórmulas SUMSQ/SUMPRODUCT/RANK que el resto del
  libro), en vez de la estructura AHP genérica que se usaba antes para cualquier método no-AHP
  (`matrixSheet()`/`topsisSheet()` en `excel.ts`, verificado en `scripts/check-excel-topsis.ts` contra el mismo caso
  IoT/Palmor que `check-topsis.ts`, valores cacheados exactos). VIKOR/PROMETHEE/ELECTRE siguen pendientes (ver
  "Falta" en Visión, abajo) — se hizo TOPSIS primero para validar el patrón antes de replicarlo.
- **Bug de fondo corregido de paso**: la hoja oculta `_datos` (el respaldo que permite reimportar un .xlsx) no
  guardaba `method` ni `decision_matrix` — exportar un proyecto TOPSIS y reimportarlo perdía la matriz de decisión
  en silencio. `legacy.ts` (`Study`/`LegacyState`/`Imported`) y `importer.ts` ahora los llevan, de forma opcional y
  retrocompatible: un .json/.xlsx viejo de la herramienta HTML (que no conoce estos campos) sigue importando bien,
  cae a `method: 'ahp'` con matriz vacía.

**19-20 sep 2026 (grill-me + revisión en vivo):**
- **Bug real corregido**: `scripts/check-excel.ts` y 4 archivos de `src/lib/` (`excel.ts`, `types.ts`, `importer.ts`,
  `legacy.ts`) importaban con rutas relativas sin extensión (`from './ahp'`). Next.js lo tolera al compilar, pero el
  runner nativo de TypeScript de Node (`--experimental-strip-types`, el que usa `npm test`) exige `.ts` explícito — el
  script que "verificaba" la ida y vuelta del Excel nunca había corrido de verdad. Corregido y confirmado (120/120
  juicios, 12 candidatos, sin errores).
- **Bug de estilos**: la regla CSS que da estilo oscuro a los inputs no incluía `input[type=password]` ni
  `input[type=email]`, así que el campo de contraseña del login caía al estilo por defecto del navegador (blanco, roto en
  modo oscuro). Corregido.
- **Landing (`/`) y tutorial (`/tutorial`) nuevos**, reemplazando la página de inicio mínima anterior: explican qué hace
  la plataforma, para quién, cómo funciona (4 pasos) y privacidad por diseño; el tutorial trae guía completa con panel
  lateral de navegación en pantallas anchas. Reusan el sistema de diseño existente (`globals.css`: tipografías Bricolage
  Grotesque/IBM Plex, paleta piedra/verde, tarjetas de borde fino), sin inventar un estilo nuevo.
- **Login rediseñado**: antes era un formulario suelto sin topbar ni marca; ahora tiene topbar con logo, y en pantallas
  anchas un panel con contexto del producto junto al formulario.
- **Marca/favicon**: `src/app/icon.tsx` y `apple-icon.tsx` generan el favicon con `next/og` (`ImageResponse`), sin
  depender de un servicio externo de imágenes — dos elementos de tamaño distinto (no un gráfico de barras genérico,
  primer intento descartado por parecer "cualquier app de analytics"). `src/components/Logo.tsx` es el mismo diseño como
  SVG inline, puesto junto a "Plataforma MCDA" en **todos** los topbars, incluyendo `PublicView` y `ExpertFlow` — ahí
  antes ni siquiera era un link (`<span>` suelto, sin `href`), ahora lleva a `/` en las dos.
- **Desplegado por primera vez**: proyecto Supabase provisionado + migración corrida, proyecto Vercel enlazado y
  desplegado a producción en `mcda-decisions.vercel.app` (detalle de la trampa de protección SSO en
  "Despliegue actual" arriba).

## Visión: plataforma multicriterio completa

**20 sep 2026: decidido con el docente y construido; ampliado después con SAW, Fuzzy TOPSIS y 2 métodos de
ponderación objetiva.** Siete métodos de ranking ya funcionando: **AHP** (el original), **TOPSIS**, **VIKOR**,
**PROMETHEE**, **ELECTRE**, **SAW** y **Fuzzy TOPSIS** (`src/lib/{topsis,vikor,promethee,electre,saw,fuzzy_topsis}.ts`;
los 5 primeros verificados contra su notebook de referencia del curso con valores exactos vía `npm test` — SAW y
Fuzzy TOPSIS todavía no tienen su `check-*.ts`, ver "Falta" abajo). Además, `weighting_method` (`src/lib/weights.ts`)
deja elegir **CRITIC** o **Entropía** como alternativa a pesos derivados de AHP. Un proyecto elige `method` en la
pestaña «Proyecto» (el peso de criterios sigue saliendo siempre de la hoja Criterios, sin importar el método); con
cualquier método que no sea AHP aparece una pestaña «Matriz de decisión» donde el dueño escribe el valor real de cada
alternativa por criterio (beneficio/costo), y los expertos solo pesan criterios (ya no comparan alternativas de a
pares). Nada de esto usa una tabla de "resultados" nueva: cada método se calcula en el navegador a partir de la
matriz guardada, igual que AHP ya se calculaba en vivo desde los juicios — por eso "comparar métodos sobre los mismos
datos" (lo que pidió el docente) no exigió rehacer el modelo de datos, cada método nuevo fue solo otra función pura
sobre la misma matriz + una migración que amplía el `check` de `method`.

**ELECTRE es distinto de los otros 4:** no da un ranking total — da una relación de superación ("A supera a B") donde
un par puede quedar **incomparable**, con c*=0.65/d*=0.30 como convención del curso. La UI de Results.tsx lo muestra
aparte (relaciones + tabla de concordancia/discordancia), no como una lista ordenada con barras.

**Asistente "¿qué método uso?"** en `/metodo`: árbol de 3 preguntas (¿datos cuantitativos? → ¿aceptas incomparabilidad?
→ ¿qué te importa más?) que termina en uno de los 7 métodos, más tabla comparativa. Enlazado desde landing, tutorial y
el selector de método del proyecto.

**Falta:**
1. **ANP** — la pieza que de verdad requiere un modelo de datos distinto (supermatriz/red de dependencias, no una
   matriz de decisión más). Ver auditoría (sección "ANP" del informe) para una propuesta de alcance mínimo viable.
2. **TOPSIS sin recálculo real en LibreOffice** — sí tiene `check-excel-topsis.ts` (cacheado vs. JS), pero no
   pasó por el mismo recálculo forzado en LibreOffice headless que ya corrieron PROMETHEE/ELECTRE/SAW/Fuzzy
   TOPSIS y VIKOR (`npm run test:excel:recalc`, hoy cubre SAW, Fuzzy TOPSIS y VIKOR).
3. **Rol de profesor** — el docente no puede ver los proyectos de sus estudiantes desde la plataforma todavía
   (decidido con el docente, 20 sep 2026: no es prioridad mientras la calificación se haga sobre el Excel/informe
   que cada estudiante entrega aparte, ver `evaluacion_v1.md` del curso).
4. **Geovisor (S5), lo que resta** — escenarios persistentes, proximidad a puntos concretos, GeoTIFF multibanda/rotado y
   probar el flujo contra Supabase real (Storage y Auth) tras aplicar las migraciones 11 y 12. Ver § "Geovisor".

Los 7 métodos ya tienen Excel propio con fórmulas vivas y color de acento propio (ver "Historial de cambios",
20 sep 2026 noche).

**Migraciones que hay que tener corridas contra Supabase real:** las 6 de `supabase/migrations/`, en orden —
`20240101000002_decision_matrix.sql` (agrega `method`/`decision_matrix`), `...000003`/`...000004_new_methods.sql`
(amplían el `check` de `method` a los 7 y agregan `weighting_method`), `...000005_public_get_weighting_method.sql`,
y `...000006_rate_limit_and_constraints.sql` (límite de frecuencia por token en `expert_get`/`expert_save`/
`expert_submit`/`public_get`, y longitud máxima en `title`/`objective`/`name`/`role_desc` — agregada en la auditoría
de seguridad del 20 sep 2026, ver más abajo). Sin correrlas, la app no truena (se degrada a comportarse como AHP sin
límite de frecuencia), pero el selector de método no puede guardar los métodos nuevos. Desde el 20 sep 2026 la
integración GitHub↔Supabase del proyecto (Settings → Integrations → GitHub, Working directory = `plataforma`,
Deploy to production activado, rama `main`) las aplica sola al hacer push — no hace falta pegarlas a mano en el SQL
Editor.

El resto de esta sección (S3-S6, familias de métodos, Fuzzy) sigue siendo el mapa completo de lo que falta:

Antes de hoy, la plataforma **solo cubría AHP** (Sesión 2) + la priorización simple de criterios (Sesión 1, Parte A). El curso real
(carpeta `Toma de decisiones/` del docente en OneDrive, **fuera de este repositorio de código** — no es una ruta
relativa navegable desde aquí) enseña 6 sesiones con una familia de métodos más amplia, y este mismo repositorio de
código ya tiene un notebook de referencia por método
(`00_priorizacion_criterios.ipynb` … `06_anp_iot_palmor.ipynb`, con `pyDecision`, mismo caso guiado IoT/Palmor):

| Sesión | Método | Entrada que necesita |
|---|---|---|
| S1 | Priorización simple de criterios | Calificación 1-5 por evaluador/pregunta (ya está: Parte A) |
| S2 | **AHP** | Juicios de a pares (Saaty) → *deriva* los pesos (ya está) |
| S3 | **TOPSIS**, **VIKOR** | Matriz de decisión (alternativas × criterios, datos reales) + pesos que ya recibe como dato |
| S4 | Taller comparativo: AHP, TOPSIS, VIKOR, **ELECTRE**, **PROMETHEE**, ANP | (los 6 anteriores + ANP, mismo caso) |
| S5 | AHP + SIG (extensión espacial) | **hecho** (25 sep 2026, primera entrega): `kind:'spatial'`, ver § "Geovisor" arriba y `docs/PLAN_geovisor_ahp_sig.md` para lo que falta (capas propias, publicar) |
| S6 | **ANP** (supermatriz) | Generaliza AHP: criterios/alternativas con dependencias/retroalimentación, no solo jerarquía |

**Fuzzy no es una sesión propia**: el propio curso lo cataloga como "mencionado como enriquecimiento... la extensión Fuzzy
de cualquiera de los anteriores" (junto a MACBETH, DEMATEL, Best-Worst Method), no como un método más con su propio
notebook. Si se construye, tiene más sentido como un *modificador* sobre AHP/TOPSIS/etc. (escala de Saaty difusa, matriz
de decisión difusa) que como un séptimo método aparte.

**La arquitectura ya insinúa cómo encajan los métodos nuevos**, porque el propio notebook de TOPSIS del curso lo dice
explícito: *"AHP deriva los pesos, TOPSIS los recibe como dato de entrada en vez de derivarlos."* Eso separa el problema
en dos familias con una frontera limpia:

1. **Métodos que PESAN criterios** (AHP, ANP): juicios de a pares → pesos + CR. Es exactamente lo que ya existe
   (`ahp.ts`, hoja `Criterios`, la Parte A como alternativa más simple de conseguir pesos).
2. **Métodos que RANQUEAN alternativas dado un peso ya fijado** (TOPSIS, VIKOR, ELECTRE, PROMETHEE): reciben una matriz
   de decisión (alternativas × criterios, con valores reales, no juicios subjetivos) + los pesos de (1) + qué criterios
   son de beneficio/costo, y producen el ranking final directamente — **reemplazan** por completo el paso actual de "una
   matriz AHP por criterio + síntesis con SUMPRODUCT", no lo complementan.

Es decir: el proyecto seguiría teniendo un paso de "pesos de criterios" (como hoy), pero el paso de "comparar
alternativas" pasaría a ser elegible: AHP por pares (como hoy) **o** una matriz de decisión cuantitativa + uno de
TOPSIS/VIKOR/ELECTRE/PROMETHEE. ANP es la pieza más distinta (generaliza el paso de pesos a una red con dependencias,
no una jerarquía simple), sería la de mayor esfuerzo.

**Roadmap** (orden decidido con el docente 20 sep 2026):
1. ~~TOPSIS (S3)~~ **hecho**.
2. ~~VIKOR (S3)~~ **hecho**.
3. ~~ELECTRE y PROMETHEE (S4)~~ **hechos** — ELECTRE con umbrales c*=0.65/d*=0.30 (convención del curso, no
   configurables en la UI todavía); PROMETHEE con función de preferencia Tipo III (la única que enseña el curso), Q=0
   y P=rango de cada criterio (se calculan solos, sin UI extra).
4. ANP (S6): generaliza el paso de pesos a supermatriz con dependencias — la pieza más grande, tocaría el modelo de
   datos de verdad (`criteria`/`alternatives` ya no alcanzan, hace falta modelar clusters y relaciones). Pendiente de
   una conversación de diseño aparte, no encaja en el patrón de matriz de decisión de los otros 4.
5. Extensión Fuzzy (opcional, "enriquecimiento" según el propio curso): modificador sobre cualquiera de los anteriores,
   no un método nuevo.
6. ~~Asistente "¿qué método uso?"~~ **hecho** (`/metodo`, ahora árbol de 3 preguntas entre los 5 métodos).

**Decidido con el docente (20 sep 2026):**
- **Un método por proyecto**, pero con un ojo puesto en poder comparar varios métodos sobre los MISMOS datos más
  adelante (pidió explícitamente esa opción, "habrá gente que use esto solo para uno, pero otros que lo usen para
  comparar entre todos") — por eso el diseño de arriba (nada de resultados persistidos, todo se calcula en vivo desde
  datos compartidos) ya deja esa puerta abierta sin tener que rehacer el modelo de datos cuando se construya.
- Modelo de datos: **no** una tabla `decision_matrix` aparte — una columna JSONB en `projects` (mismo patrón que
  `criteria`/`alternatives`/`prioritization`), más simple y consistente con el resto del esquema.
- Se empezó por TOPSIS.

## Notas
- Las claves `NEXT_PUBLIC_*` son públicas por diseño; la seguridad la dan las políticas RLS. **Nunca** pongas la clave `service_role` en el frontend.
- Los datos pueden incluir información de comunidades y de estudiantes: publica un aviso de privacidad y pide consentimiento (Ley 1581 de 2012, habeas data).
- El plan gratuito de Supabase pausa proyectos inactivos; para uso continuo en un curso conviene entrar seguido o pasar a un plan de pago.
- Otras ideas sueltas (menores, no priorizadas): rol de profesor que vea los proyectos de su curso, comentarios por par,
  recordatorios por correo a expertos, enlaces con vencimiento. El roadmap grande (métodos nuevos) está en "Visión" arriba.

---

## Cómo citar

Si utilizas **MCDA Tools** en cursos académicos, tesis de maestría o investigaciones científicas, por favor cita este software utilizando los siguientes formatos:

### APA (7.ª edición)
```text
Polo-Castañeda, M. A. (2026). mcda-tools: Open-source web platform for multi-criteria decision analysis (AHP, TOPSIS, VIKOR, ELECTRE, PROMETHEE, SAW, Fuzzy TOPSIS) and GIS-MCDA (Version 0.1.0) [Software de computación]. Zenodo. https://doi.org/10.5281/zenodo.23002791
```

### IEEE
```text
M. A. Polo-Castañeda, "mcda-tools: Open-source web platform for multi-criteria decision analysis (AHP, TOPSIS, VIKOR, ELECTRE, PROMETHEE, SAW, Fuzzy TOPSIS) and GIS-MCDA," ver. 0.1.0, Zenodo, Sep. 2026. doi: 10.5281/zenodo.23002791. [En línea]. Disponible: https://mcda.tools
```

### BibTeX
```bibtex
@software{polo_castaneda_2026_mcda_tools,
  author       = {Polo-Castañeda, Miguel Angel},
  title        = {{mcda-tools: Open-source web platform for multi-criteria decision analysis (AHP, TOPSIS, VIKOR, ELECTRE, PROMETHEE, SAW, Fuzzy TOPSIS) and GIS-MCDA}},
  year         = {2026},
  month        = sep,
  publisher    = {Zenodo},
  version      = {v0.1.0},
  doi          = {10.5281/zenodo.23002791},
  url          = {https://doi.org/10.5281/zenodo.23002791}
}
```
