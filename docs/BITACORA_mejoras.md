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

## Entradas

### 1. Contraste y movimiento — `b1cdc9e`
- **Qué:** `--warn-text`/`--pass-text` en toda la app; acento de texto del geovisor con `--gv-accent-strong`; `rgba` blanco/cian fijos → `color-mix` con `--ink`/`--accent`; `transition: all` → propiedades; hovers quietos con `prefers-reduced-motion`.
- **Por qué:** auditoría de front: ámbar y verde como texto daban ~2:1 en tema claro (errores, avisos, botón de borrar); hovers y pestañas activas invisibles en claro.
- **Verificación:** typecheck, `npm test`, `npm test:excel`. Sin verificación visual renderizada.

### 2. Header del Geovisor alineado con el contenido
- **Qué:** `.wrap:has(.gv-wrap)` se ensancha a 1560 px y `.gv-wrap` deja de salirse con `transform`; fondo del topbar al 94 %.
- **Por qué:** el Topbar (dentro de `.wrap`, 1100 px) quedaba más angosto que el geovisor (1560 px); al hacer scroll el panel lateral pasaba por debajo y asomaba a los lados (captura del docente).
- **Verificación:** pendiente de revisión visual del docente (la herramienta de navegador no pudo medirlo antes).
