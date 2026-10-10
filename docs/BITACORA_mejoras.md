# Bitácora de mejoras (propuesta de Ronaldo Salas, 9 oct 2026)

Registro de **qué se hizo y por qué**. Cada entrada: cambio, motivo, cómo se verificó y decisiones del docente.
Origen: `Propuesta global de mejoras para mcda.tools.md` (40 mejoras, hallazgos H1–H16).

## Decisiones del docente (acumuladas)

| Tema | Decisión | Fecha |
| --- | --- | --- |
| Puntos con ranking | Se colocan por clic (modo explícito) o importando CSV/GeoJSON/capa ya subida; ranking por el índice (%) de la celda | 9 oct |
| Dirección del índice (G1) | Se pregunta al crear el proyecto («un valor alto significa peor / mejor») y es editable después; va **antes** que los puntos | 9 oct |
| Puntos fuera del área o en exclusión | Al final de la tabla, sin puesto, nunca como 0 % | 9 oct |
| Vista pública | Interruptor **global** para mostrar puntos y ranking; apagado por defecto | 9 oct |
| Dónde viven los puntos | Pestaña nueva «Puntos»; se guardan en `projects.geo` (jsonb), sin migración | 9 oct |
| Diseño | Dirección «Afinado» (identidad actual con contraste arreglado); tipografía actual; modo compacto solo en tablas del Geovisor | 9 oct |
| Animación | CSS + FLIP; sin anime.js por ahora | 9 oct |
| Número de clases | Mínimo 2, **máximo 8** (confirmado por el docente), con nombre, color y rango editables | 10 oct |
| Decisiones delegadas (el docente pidió que se decidan por él) | Guía de consistencia: solo aplica con botón y no se registra si la aplicó · Orden agregado: Borda por defecto, Copeland alternativo · Cortes por cuantiles/Jenks: se congelan al elegirlos · Clases: el docente pidió (10 oct) que sean **N, no solo 3**: el usuario agrega las que quiera y define el rango de cada una (sustituye la decisión anterior de 3 fijas) · Ranking por índice (%) · Puntos: por archivo (CSV/GeoJSON) primero; «desde capa subida» después · Exclusión se muestra siempre como «Excluido», nunca como 0 % | 10 oct |

## Entradas

### 1. Contraste y movimiento — `b1cdc9e`
- **Qué:** `--warn-text`/`--pass-text` en toda la app; acento de texto del geovisor con `--gv-accent-strong`; `rgba` blanco/cian fijos → `color-mix` con `--ink`/`--accent`; `transition: all` → propiedades; hovers quietos con `prefers-reduced-motion`.
- **Por qué:** auditoría de front: ámbar y verde como texto daban ~2:1 en tema claro (errores, avisos, botón de borrar); hovers y pestañas activas invisibles en claro.
- **Verificación:** typecheck, `npm test`, `npm test:excel`. Sin verificación visual renderizada.

### 2. Header del Geovisor alineado con el contenido
- **Qué:** `.wrap:has(.gv-wrap)` se ensancha a 1560 px y `.gv-wrap` deja de salirse con `transform`; fondo del topbar al 94 %.
- **Por qué:** el Topbar (dentro de `.wrap`, 1100 px) quedaba más angosto que el geovisor (1560 px); al hacer scroll el panel lateral pasaba por debajo y asomaba a los lados (captura del docente).
- **Verificación:** pendiente de revisión visual del docente (la herramienta de navegador no pudo medirlo antes).

### 3. Guía de consistencia AHP (E1) — merge `30898e5`
- **Qué:** con CR ≥ 0.10 y la hoja completa, el editor señala la comparación que más se aparta de las demás y el valor Saaty que la haría coherente, con el CR resultante y hasta 3 candidatas. Botón «Aplicar sugerencia» opcional; nunca cambia nada sola. `src/lib/ahpGuide.ts` + `JudgmentEditor`.
- **Por qué:** el formulario solo decía «revisa tus juicios» sin decir qué par; el estudiante corregía a ciegas.
- **Método:** residuo |ln a_ij − ln(w_i/w_j)| con pesos del eigenvector; CR recalculado cambiando solo ese par con `analyze`. No altera pesos, λmax, CI, CR ni el Excel.
- **Verificación:** `scripts/check-ahp-guide.ts` contra numpy (`ahp-guide-ref.py`); typecheck, `npm test` y `test:excel` en verde. Pendiente revisión visual.

### 4. Plan técnico de puntos, G1 y zonal — `a71011c`
- Ver `docs/PLAN_puntos_ranking.md`. Hallazgos que cambian el plan: los vectores subidos no se persisten (solo se rasterizan), el Excel del geovisor es solo valores, y los marcadores de punto son SVG (no salen en el PNG).

### 5. Versión/DOI, «Reportar un problema» y pegar matriz (P1, P2, U1) — merge `2148f93`
- **P1/H16:** la sección de citación decía «versión 0.1.0» fija; ahora sigue a `APP_RELEASE_TAG`. No hay otros literales desactualizados. Nota: el CHANGELOG fecha 1.0.0 el 2026-10-02 (tag); el GitHub Release se publicó el 2026-10-07. No se cambió.
- **P2:** «Reportar un problema» en el pie y en el menú de usuario, con versión, ruta saneada (`/e/:token`, `/p/:token`) y método; nunca ids, tokens ni correo. Plantillas de issue en `.github/ISSUE_TEMPLATE`. Prueba: `check-report-issue.ts`.
- **U1:** pegar bloques de Excel/Sheets en la matriz de decisión, con vista previa, avisos por celda, límite a la matriz y «Deshacer el pegado». Parser puro `src/lib/paste-matrix.ts`; prueba `check-paste-matrix.ts`.
- **Pendiente:** revisión visual y paste real desde Excel; confirmar que la etiqueta `bug` existe en GitHub.

### 6. Geovisor: leyendas, área, capas, publicación y rueda (G4, G5, G14, R5) — merge `ad0d948`
- **G4/H10:** la leyenda del resultado siempre visible; las de otras capas en un `<details>` debajo. Se borró la regla muerta `.gv-legend{display:none}`.
- **G5/H5:** una cifra «Área evaluada» y la «Extensión de la grilla» rotulada aparte.
- **G14/H9:** aviso de archivo duplicado (reemplazar conservando reglas, o subir como nueva; por defecto nueva) y `ConfirmDialog` nombrando la capa en lugar del «¿Seguro?» de 3 s.
- **R5/H6:** firma por partes (`src/lib/geo/publishSig.ts`, `meta.sigParts`): solo pesos, reglas, umbrales, capas que alimentan el cálculo, exclusión y área; el aviso dice qué cambió. Publicaciones antiguas usan el aviso genérico. Prueba: `check-geo-publish-sig.ts` (17 casos).
- **Rueda:** zoom solo con Ctrl/⌘ y aviso «Ctrl + rueda para acercar»; táctil y teclado intactos.
- **Pendiente:** revisión visual (móvil ≤ 700 px, lector de pantalla) y el reemplazo de capa con Supabase real. CSS muerto `.gv-layer .del.ask` sin limpiar.

### 7. Orden agregado, umbral crítico y párrafo de metodología (M1, M4, R3) — merge `92739b3`
- **M1:** la comparativa propone un orden agregado cuando los métodos discrepan: Borda por defecto, Copeland como alternativa visible, con la regla explicada junto al resultado. ELECTRE queda fuera (no da ranking); los empates se declaran, no se desempatan; informa ganador de Condorcet y ciclos. `src/lib/aggregateRanking.ts`, prueba `check-aggregate-ranking.ts`. VIKOR en conjunto de compromiso entra con su orden por Q, con una nota (decisión del agente: revisable).
- **M4:** tabla de umbral crítico por peso (Triantaphyllou y Sánchez, 1997) bajo el simulador what-if: cambio mínimo que altera el primer puesto, o «robusto» en [0, 1]. Reutiliza `analyzeSensitivity`; no reimplementa fórmulas. En AHP sin prioridades locales no se muestra.
- **R3:** párrafo de metodología es/en generado del estado del proyecto; versión y DOI desde `version.ts`; solo citas ya verificadas en el repo; CR ≥ 0.10 se escribe «NO cumple».
- **Excel:** sin cambios. Borda podría ir como fórmula viva (SUMPRODUCT); el umbral crítico exigiría una rejilla de celdas. Pendiente decidir.
- **Pendiente:** revisión visual de las tres tarjetas y del fallback de copiado.

## Estado al 10 oct (fin de la primera ola)
Integrado en `main` local (sin push): contraste, header, E1, G4/G5/G14/R5/rueda, P1/P2/U1, M1/M4/R3. Typecheck, `npm test` y `test:excel` en verde. Sigue: dirección del índice + clases variables (G1/G2), luego puntos con ranking.

### 8. Dirección del índice y clases variables 2–8 (G1, G2) — merge `0ffb6d6`
- **Qué:** `geo.direction?` (ausente = aptitud) y `geo.classModel` (2–8 clases, cortes contiguos 0–1, nombre y color por clase, `cut: manual|quantile|jenks` congelado hasta «Recalcular»). Proyecto nuevo: 3 clases 45/70 y la pregunta «un valor alto significa más apto / más riesgo» en NewProject (el tipo pasa a «Mapa SIG»). Evaluación de un punto extraída a `src/lib/geo/pointEval.ts`.
- **Códigos:** 0 excluido, 1..N clases, 253 vetada (en GeoTIFF/QML sale como N+1), 254 sin dato. `CLASS_VETO` pasó de 4 a 253 porque con ≥ 4 clases el 4 chocaba con una clase real; las publicaciones v1 se leen con `legacyVeto`.
- **Veto en riesgo:** índice 100, etiquetado «Condición crítica»; en aptitud sigue 0 y «Vetada». La exclusión nunca es 0 %.
- **Compatibilidad:** proyecto antiguo = 3 clases sin migrar; `geo.classes {alta, media}` queda como espejo con 3 clases (lo lee el catálogo); un proyecto sin tocar conserva su firma de publicación; publicación v2 y vista pública lee v1 como aptitud de 3 clases.
- **Verificación:** `check-geo-points`, `check-geo-cuts`, `check-geo-classes`, `check-geo-direction` y `check-geo-publish` (v1/v2); typecheck, 884 verificaciones y `test:excel` en verde.
- **Pendiente (visual):** editor de clases, leyendas con N filas, rampa invertida, `<input type="color">`, pregunta en NewProject, vista pública v1/v2, PNG con N clases, persistencia real en Supabase; textos de «idoneidad» que quedan en el tutorial/tour en modo riesgo; pruebas de parcelas con N≠3.

### 9. Puntos con ranking — merge `1f1f584`
- **Qué:** `geo.points?` (tope 300) y `geo.publicPoints?` en `projects.geo` (sin migración). Pestaña «Puntos» con «Agregar punto» en modo explícito (Esc o el mismo botón salen; fuera del modo el clic consulta como siempre), importación de CSV (`nombre,lat,lon` o `x,y`, coma o `;`, coma decimal) y GeoJSON/KML/GPX/shapefile (Point/MultiPoint) con vista previa y deshacer. Ranking por el índice de la celda: descendente, empates 1,2,2,4; en riesgo «Mayor riesgo primero», en aptitud «Más apto primero». Excluido, fuera del área y sin dato van al final, sin puesto ni índice (nunca 0 %). Veto: «Vetada» / «Condición crítica».
- **Mapa:** capa propia de `circleMarker`, tooltip con nombre, puesto e índice, resaltado tabla↔mapa y puntos dibujados en el PNG (con puesto, hasta 100).
- **Público:** interruptor global «Mostrar puntos y ranking en la vista pública», apagado por defecto y con advertencia. Con él apagado **no viaja** ni la lista (`public_get` entrega todo el meta a cualquiera con el enlace). Meta aditivo (`points`, `showPoints`) sin subir `v`; parte `puntos` en la firma; publicaciones anteriores se leen sin puntos.
- **Salidas:** hoja «Puntos» en el Excel (solo valores, con nota) y `puntos_ranking.csv` en el zip.
- **Decisiones del agente:** filas de 36 px (no 32) para cumplir objetivos táctiles; tooltips como nodo de texto (los nombres importados no se interpretan como HTML); empates por el índice entero que ve el usuario.
- **Verificación:** `check-geo-points`, `check-geo-points-import` (20 casos, nuevo), `check-geo-publish`, `check-geo-publish-sig`; typecheck, 939 verificaciones y `test:excel` en verde.
- **Riesgos:** el meta publicado crece ~30–40 KB con 300 puntos y el RPC no limita su tamaño; un clic sobre un marcador de referencia en modo agregar crea un punto ahí.
- **Pendiente (visual):** modo agregar, tabla y vista previa, 4 pestañas en móvil, foco y contraste, PNG con puntos, 300 puntos fluidos, publicación y vista pública contra Supabase real, importar KML/shapefile reales. El tour no menciona Puntos. «Desde capa subida» queda para después (exige persistir el FC).

## Estado al 10 oct (fin de la segunda ola)
Integrado en `main` local (sin push): primera ola + G1/G2 + puntos con ranking. Siguen (tercera ola): persistir polígonos (G6/G7), estadística zonal y exposición (G9/G10), composición de mapa PDF (R1) e informe del mapa (R2).

### 10. Lista de puntos, ficha en línea y nombres en el mapa — merge `5dfa91c`
- **Por qué:** capturas del docente: la tabla de 5 columnas no cabía en el panel lateral (~330 px útiles): había que desplazarla de lado para ver índice y clase, el título salía cortado y había un scroll anidado.
- **Qué:** lista de filas de dos líneas (puesto, nombre + clase con color e insignia de veto, índice con barrita), sin scroll horizontal ni anidado. Los sin evaluar al final, bajo «Sin evaluar · sin puesto», con «Sin índice», nunca 0 %. Cada fila se expande en línea con la ficha del punto (valor, idoneidad × peso = aporte, veto), compartida con la consulta del mapa (`GeoPointFicha`), y con renombrar, centrar y eliminar (confirmado). Teclado: flechas, Inicio/Fin, Intro/Espacio, Esc.
- **Mapa:** interruptor «Mostrar nombres en el mapa» (apagado por defecto) con «Nombre / Nombre + %»; descarte voraz por puesto (máx. 40, sin solapes, debounce 120 ms) y aviso «Acerca el mapa…»; las etiquetas entran en el PNG si están activas; el mapa se centra al elegir un punto. «Buscar punto» con más de 12. Los marcadores no se recrean al cambiar la selección.
- **Decisión:** el detalle va dentro de la fila y no en una tarjeta flotante (la tarjeta cubre justo los controles del mapa).
- **Datos:** sin cambios en el modelo de puntos; `PointRow` gana `suit/weight/part` opcionales. Lógica pura en `src/lib/geo/pointLabels.ts`, `check-geo-point-labels` (26 verificaciones).
- **Verificación:** typecheck, 965 verificaciones y `test:excel` en verde.
- **Pendiente (visual):** a 330/280 px en claro y oscuro, etiquetas y PNG, 300 puntos reales, vista pública.
