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
| Decisiones delegadas (el docente pidió que se decidan por él) | Guía de consistencia: solo aplica con botón y no se registra si la aplicó · Orden agregado: Borda por defecto, Copeland alternativo · Cortes por cuantiles/Jenks: se congelan al elegirlos · 3 clases con nombres editables · Ranking por índice (%) · Puntos: por archivo (CSV/GeoJSON) primero; «desde capa subida» después · Exclusión se muestra siempre como «Excluido», nunca como 0 % | 10 oct |

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
