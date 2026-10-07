# MCDA Tools (`mcda.tools`)

> **Plataforma web de código abierto para el Análisis de Decisiones Multicriterio (MCDA / MCDM) y modelado de idoneidad espacial.**

[![Licencia: MIT](https://img.shields.io/badge/Licencia-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Estado CI](https://github.com/miguepoloc/mcda-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/miguepoloc/mcda-tools/actions/workflows/ci.yml)
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23002790.svg)](https://doi.org/10.5281/zenodo.23002790)
[![Release en GitHub](https://img.shields.io/github/v/release/miguepoloc/mcda-tools)](https://github.com/miguepoloc/mcda-tools/releases)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/Base_de_datos-PostgreSQL_17_(Supabase)-336791?logo=postgresql)](https://supabase.com/)

**Despliegue en producción:** [https://mcda.tools](https://mcda.tools)
**Repositorio de código:** [https://github.com/miguepoloc/mcda-tools](https://github.com/miguepoloc/mcda-tools)
**Idioma:** [English](README.md) | [Español](README.es.md)

---

## Tabla de contenido

- [Resumen](#resumen)
- [Capturas de pantalla](#capturas-de-pantalla)
- [Diferenciadores clave](#diferenciadores-clave)
- [Métodos MCDA soportados](#métodos-mcda-soportados)
  - [1. Proceso Analítico Jerárquico de grupo (AHP)](#1-proceso-analítico-jerárquico-de-grupo-ahp)
  - [2. Motor de matriz multi-método](#2-motor-de-matriz-multi-método)
  - [3. Criterios objetivo (nominal-the-best)](#3-criterios-objetivo-nominal-the-best)
  - [4. MCDA espacial / Geovisor (SIG + AHP)](#4-mcda-espacial--geovisor-sig--ahp)
  - [5. Motor de hoja de cálculo con fórmulas vivas (Excel)](#5-motor-de-hoja-de-cálculo-con-fórmulas-vivas-excel)
- [Verificación matemática y validación (ground truth)](#verificación-matemática-y-validación-ground-truth)
- [Arquitectura y stack tecnológico](#arquitectura-y-stack-tecnológico)
- [Inicio rápido (desarrollo local)](#inicio-rápido-desarrollo-local)
- [Configuración de base de datos y migraciones](#configuración-de-base-de-datos-y-migraciones)
- [Despliegue en producción](#despliegue-en-producción)
- [Cómo citar](#cómo-citar)
- [Contribuciones y licencia](#contribuciones-y-licencia)

---

## Resumen

**MCDA Tools** es una plataforma de software académica y de código abierto diseñada para cerrar la brecha entre los algoritmos matemáticos rigurosos de Análisis de Decisiones Multicriterio (MCDA / MCDM) y flujos de trabajo web accesibles y colaborativos.

Desarrollada para el análisis de decisiones de ingeniería a nivel de posgrado y la investigación aplicada, la plataforma elimina la dependencia de software propietario costoso (como Expert Choice o Super Decisions) y de instalaciones de SIG de escritorio (QGIS, ArcGIS), ejecutando flujos de decisión completos directamente en el navegador, con sincronización en la nube.

---

## Capturas de pantalla

| Landing | Asistente «¿Qué método uso?» (`/metodo`) | Generador de citas académicas (`/citar`) |
|---|---|---|
| [![Landing](docs/screenshots/landing.png)](https://mcda.tools) | [![Asistente de método](docs/screenshots/metodo.png)](https://mcda.tools/metodo) | [![Generador de citas](docs/screenshots/citar.png)](https://mcda.tools/citar) |

Capturas reales del despliegue en producción ([https://mcda.tools](https://mcda.tools)).

---

## Diferenciadores clave

1. **Paneles de expertos colaborativos sin instalación**:
   Invita a evaluadores externos mediante enlaces de encuesta privados y con token (`/e/<token>`). Los expertos envían sus comparaciones por pares sin crear cuentas ni instalar software.
2. **Síntesis comparativas multi-método**:
   Resuelve el mismo problema de decisión con **7 métodos de ordenamiento** (AHP, TOPSIS, VIKOR, ELECTRE I, PROMETHEE II, SAW, Fuzzy TOPSIS), con correlación de rangos Spearman/Kendall automática.
3. **MCDA espacial en el navegador (Geovisor)**:
   Carga archivos ráster y vectoriales en bruto (GeoTIFF, Shapefile .zip, GeoJSON, KML), reproyecta coordenadas, calcula transformadas de distancia euclidiana exactas, evalúa funciones de pertenencia continuas y genera mapas de idoneidad territorial en segundos.
4. **Exportación a Excel transparente, con fórmulas vivas**:
   Los libros exportados contienen **fórmulas nativas de hoja de cálculo activas** (`SUMPRODUCT`, `INDEX`, pasos de iteración de potencias) en lugar de valores estáticos. Evaluadores y auditores pueden verificar o recalcular la decisión sin conexión.
5. **Privacidad por diseño**:
   *Row Level Security* (RLS) de PostgreSQL garantiza que cada dueño de proyecto solo accede a sus propios datos, y los enlaces públicos (`/p/<token>`) sirven resultados de consenso estrictamente anonimizados.

---

## Métodos MCDA soportados

### 1. Proceso Analítico Jerárquico de grupo (AHP)
- **Juicios por pares**: escala de intensidad de Saaty 1–9 estándar, con descriptores verbales bidireccionales.
- **Cálculo de pesos de prioridad**:
  - **Eigenvector principal** (Saaty, 1980): cálculo predeterminado mediante iteración de potencias ($\mathbf{A} \mathbf{w} = \lambda_{\max} \mathbf{w}$).
  - **Promedio normalizado de columnas**: método de referencia pedagógica.
- **Verificación de consistencia**: cálculo del Índice de Consistencia ($CI$) y la Razón de Consistencia ($CR \le 0.10$) contra la tabla del Índice Aleatorio ($RI$) de Saaty.
- **Agregación de grupo**: síntesis multi-experto mediante media geométrica (AIJ / AIP).
- **Diagnóstico de consenso e incertidumbre de grupo**:
  - Indicador de consenso $S^*$ basado en entropía de Shannon (Goepel, 2018).
  - Simulación de Monte Carlo para evaluar la incertidumbre de los pesos de criterios y la estabilidad del ranking.

### 2. Motor de matriz multi-método
Cuando la evaluación de las alternativas es cuantitativa o empírica, los pesos de criterios derivados del AHP o de una ponderación objetiva se pueden combinar con una matriz de decisión compartida:

- **TOPSIS** (Hwang & Yoon, 1981): normalización vectorial, distancia euclidiana a las soluciones ideales positiva ($A^+$) y negativa ($A^-$), y coeficiente de cercanía relativa ($C_i$).
- **VIKOR** (Opricovic & Tzeng, 2004): métricas de distancia Manhattan ($S_i$) y Chebyshev ($R_i$); índice de compromiso $Q_i$; peso de estrategia interactivo $v \in [0, 1]$; verificación automática de la Condición 1 (*ventaja aceptable*) y la Condición 2 (*estabilidad aceptable*); determinación del conjunto de solución de compromiso; curvas de sensibilidad $Q(v)$.
- **ELECTRE I** (Roy, 1968): matrices de concordancia y discordancia con umbrales ajustables por el usuario ($c^*, d^*$); relaciones de superación; extracción del núcleo del grafo, identificando subconjuntos de alternativas no dominadas e independientes.
- **PROMETHEE II** (Brans & Vincke, 1985): funciones de preferencia lineales con umbrales de indiferencia ($q$) y preferencia ($p$); cálculo del flujo positivo ($\Phi^+$), negativo ($\Phi^-$) y del flujo neto de ordenamiento completo ($\Phi$).
- **SAW (Suma Ponderada Simple)**: normalización lineal max-min y síntesis de utilidad aditiva.
- **Fuzzy TOPSIS**: números difusos triangulares (TFN), evaluación con variables lingüísticas y distancia difusa a los vértices de las soluciones ideales difusas.
- **Ponderación objetiva**: métodos **CRITIC** (correlación y desviación estándar) y **entropía de Shannon** integrados.

### 3. Criterios objetivo (nominal-the-best)
Los problemas de ingeniería del mundo real suelen requerir alternativas que se ajusten a un valor objetivo nominal específico (por ejemplo, mantener el voltaje de red en $110\text{ V} \pm 5\%$ o el pH del suelo en $6.5 \pm 0.5$).

MCDA Tools soporta de forma nativa criterios de **tipo objetivo**, con una banda de tolerancia definida por el usuario:
$$\text{Distancia}(x) = \max(0, |x - \text{Objetivo}| - \text{Tolerancia})$$
Esta métrica de desviación se transforma en un criterio de costo estandarizado antes de la evaluación en todos los métodos de matriz.

### 4. MCDA espacial / Geovisor (SIG + AHP)
Para problemas de zonificación territorial y selección de sitios donde las alternativas son parcelas geográficas o píxeles de ráster:

- **Carga de capas**: analiza GeoTIFF (punto flotante y entero), Shapefile (.zip), GeoJSON, KML y GPX directamente en el navegador.
- **Transformación de coordenadas**: reproyección rápida al vuelo entre zonas UTM, MAGNA-SIRGAS, WGS84 y Web Mercator vía `Proj4`.
- **Análisis de proximidad**: transformada de distancia euclidiana exacta mediante el algoritmo de Felzenszwalb.
- **Modelado de idoneidad por funciones de pertenencia**:
  - Funciones continuas lineales / trapezoidales (más es mejor, menos es mejor).
  - Rangos escalonados (por ejemplo, clases agroclimáticas FAO / UPRA).
  - Coincidencia con valor objetivo y bandas de tolerancia.
  - Máscaras booleanas de exclusión y límites de área de estudio.
- **Visualización geoespacial interactiva**:
  - Superposición ráster de alto rendimiento con Leaflet.
  - Inspección por clic que revela el desglose por criterio y el puntaje de idoneidad.
  - Cálculo de área (hectáreas y porcentajes) por nivel de idoneidad.
  - Identificación de parches candidatos contiguos que superan un área umbral.
- **Suite completa de exportación SIG**:
  - GeoTIFF georreferenciado (idoneidad 0–100 y clasificación discreta) acompañado de un archivo de estilo QGIS (`.qml`).
  - Mapa cartográfico en PNG con título, escala y leyenda.
  - KMZ de Google Earth, rejilla CSV a nivel de píxel y reporte estructurado en Excel.

### 5. Motor de hoja de cálculo con fórmulas vivas (Excel)
En lugar de exportar tablas estáticas, MCDA Tools genera libros `.xlsx` con **fórmulas de hoja de cálculo vivas**:
- Media geométrica dinámica, sumas normalizadas e iteración de potencias del eigenvector a lo largo de 40 filas.
- Normalizaciones de matriz dinámicas, sumas de utilidad con `SUMPRODUCT` y lógica condicional anidada para los conjuntos de compromiso.
- Ida y vuelta completa: los libros se pueden exportar, editar sin conexión y volver a importar en la plataforma mediante la hoja de estado oculta `_datos`.

---

## Verificación matemática y validación (ground truth)

Para garantizar rigor científico absoluto, todas las implementaciones de algoritmos en TypeScript se validan continuamente contra implementaciones independientes de referencia:

1. **Suite de validación en Python con `pyDecision`** (`notebooks/`):
   Contiene cuadernos de Jupyter que ejecutan modelos completos de extremo a extremo con `pyDecision`, `NumPy`, `rasterio` y `Pandas`.
2. **Pruebas unitarias automatizadas** (`npm test`):
   Prueban los 7 métodos MCDA, las métricas de consenso de grupo y las conversiones geoespaciales ráster/vector contra valores de referencia publicados y verificados.
3. **Pruebas de recálculo en LibreOffice headless** (`npm run test:excel:recalc`):
   Destruye los valores de celda en caché y ejecuta una macro automatizada dentro de LibreOffice headless para demostrar que las fórmulas de la hoja de cálculo se evalúan exactamente a los valores de referencia, de forma independiente a la aplicación web.

---

## Arquitectura y stack tecnológico

```text
mcda-tools/
├─ src/
│  ├─ app/             # Páginas y rutas de servidor de Next.js 15 App Router
│  ├─ components/      # Componentes de UI en React 19 (workspaces, editores, geovisor)
│  └─ lib/             # Motores de cálculo puros (ahp, topsis, vikor, geo, excel)
├─ public/             # Activos estáticos y paquetes geoespaciales precalculados
├─ supabase/
│  ├─ migrations/      # Migraciones versionadas del esquema PostgreSQL con RLS
│  └─ tests/           # Suite de pruebas en PostgreSQL 17 para seguridad y cuotas
├─ scripts/            # Comprobaciones numéricas, validación de Excel y fixtures
├─ notebooks/          # Cuadernos Python de referencia (benchmarks ground truth)
├─ docs/               # Arquitectura del sistema y planes de publicación académica
├─ CITATION.cff        # Metadatos de citación en formato Citation File Format 1.2.0
└─ package.json        # Metadatos del proyecto y dependencias
```

- **Frontend y fullstack**: Next.js 15, React 19, TypeScript 5.6.
- **Base de datos y autenticación**: Supabase (PostgreSQL 17, Row Level Security, Auth, Storage).
- **Procesamiento geoespacial**: Leaflet, GeoTIFF.js, Shpjs, Proj4, Canvas API.
- **Generación de hojas de cálculo**: `xlsx-js-style`.
- **Pruebas**: Node test runner con *type stripping* experimental nativo, LibreOffice headless.

---

## Inicio rápido (desarrollo local)

### 1. Requisitos previos
- **Node.js** ≥ 22.0.0
- **npm** ≥ 10.0.0
- Una cuenta gratuita de [Supabase](https://supabase.com) (o una instancia local de PostgreSQL 17)

### 2. Instalación
```bash
# Clona el repositorio
git clone https://github.com/miguepoloc/mcda-tools.git
cd mcda-tools

# Instala las dependencias
npm ci

# Configura las variables de entorno
cp .env.example .env.local
```

Edita `.env.local` con las credenciales de tu proyecto de Supabase:
```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-clave-anon-publishable
```

### 3. Levanta el servidor de desarrollo
```bash
npm run dev
```
Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

### 4. Corre las suites de pruebas
```bash
# Verificación de tipos
npm run typecheck

# Comprobaciones matemáticas unitarias de los 7 métodos y las rutinas SIG
npm test

# Verificación de fórmulas de Excel y pruebas de ida y vuelta
npm run test:excel

# Prueba de build de producción
npm run build
```

---

## Configuración de base de datos y migraciones

Si vas a desplegar tu propia instancia de Supabase:
1. Abre el **SQL Editor** en el panel de tu proyecto de Supabase.
2. Ejecuta los scripts de migración de [`supabase/migrations/`](supabase/migrations/) en orden numérico (`000001` a `000015`).
3. En **Authentication → URL Configuration**:
   - Configura **Site URL** con `http://localhost:3000` (o tu dominio de producción).
   - Agrega `http://localhost:3000/auth/callback` a **Redirect URLs**.

Para probar las migraciones y las políticas de seguridad localmente, contra un contenedor de PostgreSQL 17 desechable:
```bash
npm run test:db
```

---

## Despliegue en producción

### Despliegue en Vercel
1. Importa el repositorio `miguepoloc/mcda-tools` en [Vercel](https://vercel.com/new).
2. Define **Root Directory** como `.` (la raíz del repositorio).
3. Agrega las variables de entorno:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Despliega. Luego configura tu dominio propio en Vercel y agrégalo a las Redirect URLs de Supabase Auth.

---

## Cómo citar

Si utilizas **MCDA Tools** en cursos académicos, tesis de maestría o investigaciones científicas, por favor cita este software utilizando los siguientes formatos:

### APA (7.ª edición)
```text
Polo-Castañeda, M. A., Hernandez-Solorzano, H. D., Espinosa-Valdez, A. E., & Gómez-Rojas, J. (2026). mcda-tools: Open-source web platform for multi-criteria decision analysis (AHP, TOPSIS, VIKOR, ELECTRE, PROMETHEE, SAW, Fuzzy TOPSIS) and GIS-MCDA (Version 1.0.0) [Software de computación]. Zenodo. https://doi.org/10.5281/zenodo.23223008
```

### IEEE
```text
M. A. Polo-Castañeda, H. D. Hernandez-Solorzano, A. E. Espinosa-Valdez, and J. Gómez-Rojas, "mcda-tools: Open-source web platform for multi-criteria decision analysis (AHP, TOPSIS, VIKOR, ELECTRE, PROMETHEE, SAW, Fuzzy TOPSIS) and GIS-MCDA," ver. 1.0.0, Zenodo, Oct. 2026. doi: 10.5281/zenodo.23223008. [En línea]. Disponible: https://mcda.tools
```

### BibTeX
```bibtex
@software{polo_castaneda_2026_mcda_tools,
  author       = {Polo-Castañeda, Miguel Angel and Hernandez-Solorzano, Harold David and Espinosa-Valdez, Alexander Esteban and Gómez-Rojas, Jorge},
  title        = {{mcda-tools: Open-source web platform for multi-criteria decision analysis (AHP, TOPSIS, VIKOR, ELECTRE, PROMETHEE, SAW, Fuzzy TOPSIS) and GIS-MCDA}},
  year         = {2026},
  month        = oct,
  publisher    = {Zenodo},
  version      = {v1.0.0},
  doi          = {10.5281/zenodo.23223008},
  url          = {https://doi.org/10.5281/zenodo.23223008}
}
```

Estos formatos citan esta versión exacta (v1.0.0). Para citar siempre la última versión, usa el DOI de concepto: [10.5281/zenodo.23002790](https://doi.org/10.5281/zenodo.23002790).

También puedes generar estas referencias (y RIS / Chicago) desde la propia plataforma en [`/citar`](https://mcda.tools/citar).

---

## Contribuciones y licencia

Damos la bienvenida a *pull requests* y contribuciones. Revisa [CONTRIBUTING.md](CONTRIBUTING.md) y [CHANGELOG.md](CHANGELOG.md) para conocer el estilo de código, la verificación contra ground truth y las guías de pruebas.

Este proyecto está licenciado bajo la [Licencia MIT](LICENSE).
