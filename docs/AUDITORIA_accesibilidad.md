# Auditoría de accesibilidad WCAG 2.2 AA (ítem U3)

Alcance: `src/app`, `src/components`, `src/app/globals.css` y los `geo-*.css`/`share.css`. Método: lectura del código y
verificación estática (`scripts/check-a11y-static.ts`, parte de `npm test`) más cálculo de contraste de los tokens.
**No hay verificación renderizada**: no se corrió la app ni un lector de pantalla; lo marcado «a revisar en pantalla»
exige una pasada visual/con teclado y con NVDA o VoiceOver.

Severidad: **A** = bloquea a un usuario (teclado/lector) · **M** = degrada la tarea · **B** = pulido o riesgo bajo.

## Corregido

| # | Criterio | Hallazgo | Sev. | Corrección |
| --- | --- | --- | --- | --- |
| 1 | 2.4.1, 1.3.1 | No había `<main>` ni enlace de salto: el teclado recorría el encabezado en cada página | A | `layout.tsx`: «Saltar al contenido» + `<main id="contenido">`; `.skip-link` en CSS. Los `<header>` quedan dentro de `main` (ver «Pendiente» 1) |
| 2 | 2.4.2 | `/projects/[id]`, `/admin`, `/cuenta`, `/e/*`, `/p/*`, `/o/*` sin título propio | M | `metadata.title` en cada una; el script exige título en toda página de servidor |
| 3 | 2.5.8, 4.1.2 | Botón «✕» de `ScientificMethodModal` sin nombre accesible y de 32 px | A | `aria-label="Cerrar"`, 44 × 44 px |
| 4 | 2.4.3 | `ExecutiveReportModal` y `ScientificMethodModal` no devolvían el foco al abrir/cerrar y Mayús+Tab desde el panel no daba la vuelta | A | foco guardado al abrir y restaurado al cerrar; Mayús+Tab desde el panel va al último control |
| 5 | 4.1.2 | `GeoTour` es `role="dialog"` no modal sin declararlo | B | `aria-modal="false"` explícito (no atrapa foco por diseño: el recorrido señala el mapa vivo) |
| 6 | 1.3.1 | 25 `<table>` sin título accesible | M | `aria-label` en todas; la tabla común de matrices (`Table` en Results) recibe `label` |
| 7 | 1.3.1 | 82 `<th>` sin `scope` | M | `scope="col"` en todos (ninguna fila-encabezado en `tbody` sin scope); esquinas vacías con texto `sr-only` |
| 8 | 4.1.2 | `role="tab"` sin teclado de pestañas (solo Tab recorría todas) en Proyecto, Priorización, Geovisor y Citación | M | `src/lib/tabKeys.ts` (←→↑↓, Inicio, Fin; activación automática) + `tabIndex` itinerante; `aria-label` en las listas |
| 9 | 1.3.1, 4.1.2 | Deslizador de peso simulado, campo «Nuevo criterio candidato» y selector de operador del veto sin etiqueta | A | `aria-label` (y `aria-valuetext` en el deslizador) |
| 10 | 4.1.2 | Deslizador de juicios AHP anunciaba un número −8…8 sin sentido | M | `aria-valuetext` con la frase del juicio («3 · A es moderadamente preferida que B») |
| 11 | 2.1.1, 4.1.2 | Tabla de zonas: selección solo por clic en la fila y `aria-selected` inválido en `<tr>` | A | el nombre de la zona es un `<button aria-pressed>` (con `stopPropagation`); `aria-current` en la fila |
| 12 | 1.1.1 | Mapa Leaflet sin pista de la alternativa textual | M | el `aria-label` del mapa indica que puntos y zonas están en las pestañas Puntos y Zonas (lista y tabla) |
| 13 | 1.3.1 | Saltos de encabezado h1→h3 (ExpertFlow) y h2→h4 (CitationSection) | B | niveles corregidos; el CSS de las tarjetas de citación sigue aplicando |
| 14 | 1.4.3 | Índigo de la Parte A: 4.47:1 sobre blanco, 3.99:1 sobre su fondo suave; botón primario oscuro (blanco sobre `#818CF8`) 2.98:1 | A | `--pa:#4F46E5` (6.3:1) en claro; texto del botón primario `#0B0F17` en oscuro (6.4:1) |
| 15 | 1.4.11 | Borde de campos de texto `--line` ≈ 1.2:1: el campo no se distinguía del fondo | M | `--field-line` (3.2:1 claro, 3.4:1 oscuro) en `input/select/textarea`; `--line` queda para bordes decorativos |
| 16 | 2.4.7, 1.4.11 | `outline:none` en `:focus` de campos: en contraste forzado (Windows) el foco desaparecía | M | `outline:2px solid transparent` (se ve en forced-colors) + reglas `forced-colors` con `Highlight` |
| 17 | 2.3.3 | Solo algunos componentes respetaban `prefers-reduced-motion` | M | regla global (transiciones/animaciones a 0, sin `scroll-behavior` suave, hovers sin desplazamiento) |
| 18 | 2.4.11 | Encabezado fijo podía tapar el elemento enfocado | M | `html{scroll-padding-top:84px}` |
| 19 | 2.5.8 | Objetivos táctiles de pestañas, menú y ítems de navegación < 44 px en táctil | B | `@media (pointer:coarse)` a 44 px (el resto ya estaba cubierto en el diseño anterior) |

Ya estaba bien (verificado, sin cambios): diálogos de confirmación/QR/composición/informe con focus trap, Escape y retorno
del foco; menú de usuario y popover de compartir con Escape y `aria-expanded`; reordenar con teclado (2.5.7);
etiquetas `label/htmlFor` y `autocomplete` en login y registro; `role="alert"`/`aria-live` en errores y estados de
guardado; listas de puntos con botones y detalle `aria-expanded`; `<th scope>` y `<caption>` en las tablas del Geovisor;
estados ok/warn con texto («Consistente», «Inconsistente», «Enviado»…) además del color; tokens de texto de
advertencia/éxito del primer pase de contraste.

## Pendiente

| # | Criterio | Hallazgo | Sev. | Nota |
| --- | --- | --- | --- | --- |
| 1 | 1.3.1 | El `<header class="topbar">` queda dentro de `<main>` (se montó en el layout para cubrir todas las páginas con un cambio mínimo): pierde el landmark `banner` | B | Para corregir: mover `<main>` a cada página después del `Topbar`. Toca ~17 archivos |
| 2 | 1.3.1, 4.1.2 | `role="tab"` sin `tabpanel`/`aria-controls` en Proyecto, Priorización y Geovisor (los paneles son render condicional) | M | Requiere envolver cada panel con `role="tabpanel"` + `aria-labelledby`; en GeoVisor es un refactor grande |
| 3 | 1.3.1 | Primera celda de fila como `<td>` (nombre de alternativa) en varias tablas de resultados, no `<th scope="row">` | B | Cambia el estilo `.tbl th`; revisar a la vez |
| 4 | 1.3.1 | Jerarquía de encabezados: muchos componentes arrancan en h3/h4 y asumen un h2 que la página no siempre tiene (Geovisor h1→h3, Results h2→h4) | B | Es una decisión de estructura por pantalla |
| 5 | 1.4.1 | Mapa: la capa de resultado distingue clases solo con color en el lienzo; la alternativa es la leyenda con texto y la tabla de zonas, pero el color no tiene patrón | M | Valorar rampa con patrón o ya se cubre con zonas/puntos. Revisión con simulador de daltonismo |
| 6 | 1.4.3 | Contraste del texto sobre el mapa base (etiquetas de punto, tooltips sobre teselas) no verificable estáticamente | M | Revisar en pantalla con teselas claras y satélite |
| 7 | 1.4.4, 1.4.10 | Zoom 200 % y reflujo a 320 px no verificados | M | Probar: tablas anchas (matriz de decisión, ELECTRE) tienen región con `tabIndex` desplazable en algunas, no en todas |
| 8 | 2.4.7 | Foco visible sobre colores `--m-*` de método y sobre el mapa no medido | B | Revisar en pantalla |
| 9 | 3.3.x | Los errores de campo del servidor usan `role="alert"` general; no hay `aria-describedby` campo-error ni `aria-invalid` | B | Aplicable en login/registro y NewProject |
| 10 | 2.2.1 | `GeoTour` y avisos temporales (`#toast`, toast del modal) desaparecen solos: duración fija | B | Revisar si ≥ 5 s y si se pueden pausar |
| 11 | — | Lector de pantalla real (NVDA/VoiceOver) y Lighthouse/axe sin correr | M | La verificación estática no sustituye esto |

## A revisar visualmente

1. Botón primario de la Parte A en claro y oscuro (índigo nuevo / texto oscuro en oscuro) y las insignias `--pa`.
2. Campos de texto: el borde más fuerte en formularios, la matriz de decisión (`.mx input`) y filtros de admin.
3. Enlace «Saltar al contenido» (Tab al cargar cualquier página) y que el foco entre al contenido.
4. Pestañas con flechas (Proyecto, Priorización, Geovisor, Citación): foco y selección coinciden.
5. Tabla de zonas: aspecto del nombre como botón (usa la clase `.gv-zsort`) y el resaltado de la zona en el mapa.
6. Cierre de «Método científico» y «Informe ejecutivo»: el foco vuelve al botón que los abrió.
7. Con «reducir movimiento» del sistema activado: sin transiciones ni saltos de hover.

## Prueba automática

`scripts/check-a11y-static.ts` (en `npm test`, antes de `check-integration.ts`) falla si encuentra: botón solo-icono
sin nombre, `<img>` sin `alt`, campo sin etiqueta, `<table>` sin título, `<th>` sin `scope`, `onClick` en
`div/span` sin rol ni teclado, `tabIndex` positivo, `role="tab"` sin `aria-selected`, diálogo sin nombre o sin
`aria-modal`, `role="tablist"` sin teclado, `:focus` que quita el contorno sin otro indicador, falta de la regla
global de movimiento reducido, del enlace de salto, de `<main>`, de título por página y 29 pares de contraste de
tokens (4.5:1 texto, 3:1 componentes). Excepción documentada: contenedores con foco solo programático
(`.modal`, `main`, `.wz-q`, `.rec-name`).
