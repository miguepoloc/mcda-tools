# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es este repositorio

Material y herramientas del curso de posgrado **Toma de Decisiones Multicriterio** (Maestría en Ingeniería, Universidad
del Magdalena, docente **Miguel Ángel Polo-Castañeda**, quien también trabaja directamente en este repositorio, no solo
sus estudiantes). Idioma de trabajo: **español** (UI, textos y respuestas).

El repositorio completo del curso (guiones de sesión, bibliografía, evaluación, cronograma) vive **fuera** de este repo
de código, en la carpeta de OneDrive del docente `Toma de decisiones/` (README.md ahí = fuente de verdad de la
pedagogía: 6 sesiones, 3 fines de semana — S1 priorización de criterios, S2 AHP, S3 TOPSIS/VIKOR, S4 taller comparativo
Python de 6 métodos, S5 AHP+SIG, S6 ANP). Este repo de código es la implementación de las herramientas que usan esas
sesiones, no el material de clase en sí.

Capas que conviene no confundir:

1. **Notebooks de referencia y validación** (`notebooks/00_…07_*.ipynb`, `notebooks/requirements.txt`): métodos MCDA con `pyDecision` sobre el caso guiado IoT/WSN Palmor (LoRaWAN, GSM/GPRS, Sigfox, Zigbee) y AHP-SIG Cacao SNSM — sirven como ground-truth para verificar cada método de la plataforma. `pip install -r notebooks/requirements.txt`.
2. **Plataforma Web (`mcda-tools`)**: aplicación Next.js 15 + Supabase + Vercel en la raíz del repositorio (`https://mcda.tools`), cubriendo AHP (eigenvector de Saaty y media normalizada), TOPSIS, VIKOR, ELECTRE, PROMETHEE, SAW, Fuzzy TOPSIS y Geovisor AHP+SIG espacial.

## Comandos

Se ejecutan desde la raíz del repositorio:

```bash
npm install
npm run dev          # http://localhost:3000 (requiere .env.local con las claves de Supabase)
npm run build        # next build (con NEXT_PUBLIC_SUPABASE_URL/ANON_KEY dummy compila igual)
npm run typecheck    # tsc --noEmit
npm test             # suite completa de verificación matemática y componentes
npm run test:excel   # verifica la exportación y fórmulas vivas de Excel (AHP, TOPSIS, VIKOR, etc.)
```

`scripts/check-*.ts` forman la suite de pruebas unitarias y de integración matemática (corren con `node --experimental-strip-types`, sin bundlers adicionales).

## Arquitectura

### La misma matemática vive en tres sitios y debe coincidir
`src/lib/ahp.ts`, el motor analítico y las fórmulas del Excel exportado implementan lo mismo: media geométrica (GEOMEAN) entre expertos → pesos → λmax, CI, RI (tabla Saaty n≤10, luego 1.49), CR<0.10 → síntesis (peso × prioridad local) y ranking. **Desde el 25 sep 2026 los pesos son el eigenvector principal de Saaty** (`DEFAULT_WEIGHT_METHOD = 'eigenvector'`; el Excel lo calcula con iteración de potencias en fórmulas vivas, 40 pasos, y muestra al lado el promedio de columnas); el **promedio de columnas normalizadas** (procedimiento a mano del curso, notebook 01, `pyDecision wd='m'`) sigue disponible con `analyze(A, 'mean')` y como selector en Resultados. Cualquier cambio de matemática se hace en `ahp.ts` y el Excel; `npm run test:excel:recalc` (LibreOffice) comprueba que las fórmulas recalculadas coinciden con lo cacheado. Valores de referencia con los juicios de ejemplo (eigenvector, `numpy.linalg.eig`): CR criterios 0.0086, pesos [0.3207, 0.2381, 0.1166, 0.1872, 0.1374], ganador «Aprendizaje autosupervisado» 0.3497; con `'mean'` (curso): [0.3204, 0.2378, 0.1170, 0.1875, 0.1373] y 0.3490 (los verifica `npm test`).

### Codificación de juicios
Un juicio es un entero `value ∈ [-8, 8]` por par: 0 = igual; negativo = gana el primer elemento; positivo = gana el segundo; intensidad Saaty = |value|+1. Se guarda por `(experto, hoja, clave de par)`; hoja = `crit` o `alt:<id criterio>`; clave = `<idA>-<idB>` con A antes que B en el orden actual. **Los ids no pueden contener guiones.** Los elementos nuevos se agregan siempre al final (el orden relativo no cambia); `getV` también acepta la clave inversa. Un par sin juicio cuenta como 1; un experto sin juicios se excluye del agregado.

### Arquitectura de la Plataforma Web
- **Cuentas:** estados activa/desactivada/suspendida en `profiles` (`paused_at`, `suspended_at`),
  migraciones `…14_profiles_lockdown` y `…15_account_status`. Se hace cumplir con RLS **restrictiva** + chequeo dentro de las funciones `SECURITY DEFINER` +
  `auth.users.banned_until` (el middleware es solo UX). `/cuenta` = desactivar/eliminar la propia cuenta; `/admin` está en
  pestañas (`?tab=`) con tabla de usuarios y auditoría (`account_events`). Al añadir una tabla con datos del usuario, **añádele también la
  política restrictiva `account_active`**, o un suspendido seguirá escribiendo en ella.
- Next.js App Router. Rutas: `/dashboard` y `/projects/[id]` (dueño, protegidas en `src/middleware.ts` + `lib/supabase/middleware.ts`), `/e/[token]` (experto sin cuenta), `/p/[token]` (público de solo lectura). `ProjectWorkspace` es el cliente central (pestañas Proyecto, Priorización A, Expertos, Resultados, Compartir; guardado con debounce).
- Seguridad en `supabase/migrations/20240101000001_init.sql`: RLS deja al dueño ver solo lo suyo; expertos y público entran **únicamente** por funciones `SECURITY DEFINER` (`expert_get`, `expert_save`, `expert_submit`, `public_get`) que validan un token aleatorio. `public_get` no expone nombres de expertos, enlaces ni la Parte A. Nunca usar la clave `service_role` en el frontend.
- `lib/legacy.ts` + `lib/importer.ts` convierten entre el formato de respaldo v2 y las tablas (importar `.json`/`.xlsx`); `lib/excel.ts` es el port a TS del generador de Excel.

### Visión multicriterio (MCDA Suite completa)
`mcda-tools` cubre AHP + priorización simple (Parte A), **TOPSIS, VIKOR, PROMETHEE, ELECTRE, SAW y Fuzzy TOPSIS**
(`src/lib/{ahp,topsis,vikor,promethee,electre,saw,fuzzy-topsis}.ts`, cada uno verificado con valores exactos contra los notebooks
de referencia del curso en `notebooks/`, `npm test` corre todos). Un proyecto elige `method`; el peso de criterios siempre sale de la
hoja Criterios (juicios por pares), lo que cambia es cómo se ranquean las alternativas: por pares (AHP) o con una
matriz de decisión cuantitativa + esos mismos pesos (los otros métodos — reemplaza el paso de "una matriz AHP por criterio
+ síntesis", no lo complementa). **ELECTRE es distinto de los otros**: no da un ranking, da una relación de
superación con posible incomparabilidad (c*=0.65/d*=0.30, convención del curso) — Results.tsx lo muestra con su
propia UI, no como lista ordenada. Nada persiste resultados calculados: cada método, como AHP, se recalcula en el
navegador desde los datos guardados (`decision_matrix` en `projects`). Asistente
"¿qué método uso?" en `/metodo` (árbol de 3 preguntas, con los colores de familia reales del curso — violeta
comparación por pares, verde-azulado distancia al ideal, magenta sobreclasificación). **Excel**: los 5 métodos tienen hoja propia con fórmulas vivas
(`{ahp,matrix,topsis,vikor,promethee,electre}Sheet()` en `excel.ts`) y su propio color de acento (`METHOD_COLOR`).
Para PROMETHEE y ELECTRE, la primera versión usaba `MEDIAN(0,1,…)`/`MAX(…)` envolviendo una expresión-arreglo dentro
de `SUMPRODUCT` — se ve bien en la app porque el valor cacheado lo calcula el mismo JS que arma el archivo, pero un
recálculo real en LibreOffice headless (macro `calculateAll()`, valores cacheados arruinados a propósito) demostró
que la fórmula en sí NO se evalúa elemento a elemento sin modo matricial; corregido con aritmética pura
(`(d>0)*(d<1)*d+(d>=1)*1`) en PROMETHEE y una grilla de discordancia por criterio (celdas reales, no expresión) para
que el `MAX()` de ELECTRE sea de números sueltos. La priorización de criterios (Sesión 1, Prior 1-5) es un Excel
aparte (`buildPrioWorkbook()`) en vez de venir siempre pegada al del método — el respaldo `_datos` para reimportar
sigue viviendo solo en el Excel del método. **VIKOR** además tiene el parámetro **v editable** (guardado en `decision_matrix.vikorV`, 0.5 por defecto, no se deriva de los datos), la verificación de las 2 condiciones de Opricovic & Tzeng (2004) — si fallan, el resultado es un *conjunto de compromiso*, no un ganador — y sensibilidad del ranking a v (`VikorPanel.tsx`, Excel con v como celda). La matriz de decisión admite un tercer tipo de criterio, **objetivo** (`types[c]='target'` + `targets[c]={value,tol}`; distancia `max(0,|x−objetivo|−tol)`), que `resolveTargets()` convierte en costo antes de cualquier método.

**Geovisor AHP + SIG:** `kind:'spatial'` — un proyecto donde las alternativas son celdas
de un territorio en vez de filas de una tabla. Nace en blanco (con «Punto de partida» opcional: caso cacao SNSM con
datos del notebook `07_ahp_sig_cacao_snsm.ipynb`, o el caso real de la boya de la tesis del docente (paquete `boya-wsn-v1` con sus 4 expertos; ver `docs/PLAN_publicacion.md` §5) —
Polo-Castañeda et al. 2021). Mapa web real (Leaflet, mapa base mundial),
carga de capas propias (GeoTIFF, GeoJSON, shapefile .zip, KML; vector → distancia/dentro-fuera/atributo; papel
criterio, exclusión o área de estudio), reglas de idoneidad editables (por rangos, trapecio…), pesos reales del
panel de expertos, consulta de punto y exportación (GeoTIFF + QML, PNG, KMZ, CSV, Excel, zip). Vista pública `/p/<token>`, cuota editable y catálogo del docente desde `/admin`, tutorial con recorrido guiado. Requiere
las migraciones `20240101000011_geo_storage.sql` y `…12_geo_publish_quota_catalog.sql`; `npm run test:db` las prueba en un
PostgreSQL temporal (RLS incluida). Ver `README.md` § "Spatial MCDA" y `docs/PLAN_geovisor_ahp_sig.md`.

### Artefactos publicados en claude.ai (privados, del propietario de la sesión)
Priorizador de criterios (`Tu8BSq5BvgYRwjdxcd9k3o`), MCDA para ASR con datos de Harold (`9dKxsYtKh7P1m27RUnEYSr`) y plantilla en blanco (`KULzPjwGLgGk562R2fQtgy`). El estado de cada uno vive en el `localStorage` de su propio origen; no se comparte entre ellos.
