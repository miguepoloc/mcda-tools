# Plan técnico: dirección del índice (G1/G2), puntos con ranking y zonal (G9/G10)

Diseño previo a la implementación (9 oct 2026). Decisiones del docente en `docs/BITACORA_mejoras.md`.

## Hechos verificados que condicionan el diseño
- `geoExcel` usa `aoa_to_sheet`: solo valores, sin fórmulas. La regla «misma matemática en tres sitios» no aplica al geovisor.
- Los vectores subidos se **rasterizan**; el FC original vive solo en memoria (`VecItem`, `GeoLayersPanel.tsx`). Nada persistido para zonal ni para «puntos desde capa».
- Capas vectoriales: `L.canvas` (GeoMap.tsx ~l.145). Marcadores de punto: `circleMarker` con renderer por defecto (SVG) en el pane `gv-marks`.
- La captura PNG (`capture`) copia solo los canvas de `gv-vector`: los marcadores SVG **no salen** en el PNG.
- `geo_publish_result` no valida el tamaño de `p_meta`; solo limita `grid_b64`.
- Los códigos `CLASS_*` (0–4) son posicionales: se conservan y cambian solo etiquetas y colores.

## A) G1/G2 — dirección y clases
Modelo: `geo.direction?: 'suitability'|'risk'` (ausente = suitability), `geo.classNames?`, `geo.cut?: {mode:'manual'|'quantile'|'jenks'}`; los umbrales resueltos se siguen guardando en `geo.classes`.
Lugares con semántica fija: `paint.ts` (CLASS_LABEL, paletas, rampas, diff), `GeoHud.tsx`, `GeoVisor.tsx` (resumen, PNG, nombres de archivo, LEEME, textos de exportación, notas), `GeoModelPanel.tsx` (umbrales; el color del delta usa `noapta`), `export.ts` (QML, cabeceras CSV), `patches.ts`, `geoExcel.ts`, `publish.ts` (`PublishedMeta` v2), `PublicGeoView.tsx`, `NewProject.tsx`, `examples.ts`, `resultSig`.
Compatibilidad: sin `direction` = suitability; `meta.v===1` se lee como suitability; sin migración.

## B) Puntos con ranking
- `geo.points?: {id,name,lat,lon}[]`, `geo.publicPoints?: boolean`, tope 300.
- Extraer `evaluateOnePoint` a `src/lib/geo/pointEval.ts` (delegando en `evaluatePixel`); devuelve `status: ok|excluded|outside|nodata`.
- Orden por índice descendente; empates por competencia (1,2,2,4); los no `ok` al final sin puesto.
- Modo explícito «Agregar punto» en la pestaña Puntos; fuera del modo, la consulta de un punto sigue igual.
- Importación: CSV, GeoJSON (Point/MultiPoint). «Desde capa subida» exige persistir el FC (ver C).
- Marcadores: separar los de puntos del de selección; dibujar los puntos en `framePng`.
- Público: `meta.points` calculado al publicar + `meta.showPoints`; entra en `resultSig`.
- Excel: hoja «Puntos» con valores + CSV en el zip.

## C) G9/G10 — zonal y exposición
Prerrequisito (G6/G7): persistir el FC de polígonos como `<key>.geojson.gz` en el bucket `geo-layers` (cuenta en cuota; `account_active_geo_layers` ya lo cubre).
Zonal: pasada O(celdas) sobre la grilla; `burn` muestrea el centro de celda, así que los polígonos menores a una celda (manzanas) se pierden → población por centroide.

## D) Orden de commits (cada uno revertible)
1. `pointEval.ts` extraído, sin cambios de comportamiento, con test.
2. G1: tipos, etiquetas y paleta por dirección.
3. G2: `classify` y cortes.
4. Publish `v:2` y vista pública.
5. Puntos: modelo y pestaña, con clic, CSV y GeoJSON.
6. Puntos: Excel, zip, PNG y público.
7. Persistencia de FC (G6/G7).
8. G9 y G10.

Pruebas nuevas: `check-geo-direction`, `check-geo-cuts`, `check-geo-points`, `check-geo-zonal` (contra el ranking de comunas de Ronaldo), ampliar `check-geo-publish` con v1/v2.
