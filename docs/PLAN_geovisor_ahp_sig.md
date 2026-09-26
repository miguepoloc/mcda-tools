# Plan: Geovisor AHP + SIG en la plataforma

Estado (25 sep 2026): **fases 1-3 y exportación hechas** — mapa web Leaflet, capas propias (GeoTIFF/GeoJSON/shapefile/KML), reglas por rangos, consulta de punto y exportación GeoTIFF/QML/PNG/KMZ/CSV/Excel/zip (ver `README.md` § Geovisor). Tercera entrega (mismo día): publicar (`/p/<token>`), cuota/admin y catálogo editables, tutorial — hechos, con la variante simple de no usar tablas `project_layers`/`geo_reserve_layer` (la cuota se mide sobre `storage.objects`). **Pendiente**: ver README § Geovisor «Falta». Diferencias respecto a lo planeado: las capas se guardan alineadas a la grilla como Float32+gzip en Storage (no COG originales), sin tablas `project_layers`/`geo_packs` todavía (todo vive en `projects.geo`). Plan original (24 sep 2026): Se construye **después del curso** (decisión del docente: no hay presión de S5 del 2 oct). Origen: el notebook `07_ahp_sig_cacao_snsm.ipynb` y la pregunta "¿puede el estudiante crear, por ejemplo, la zona viable para una finca de paneles solares y tener un geovisor que exporte GeoTIFF o PNG?".

---

## 0. Resumen

Un tipo de proyecto nuevo, **«Mapa de aptitud (SIG)»**, en el que el estudiante:

1. define un área de estudio y una resolución;
2. carga capas (un catálogo del docente, o sus propios GeoTIFF / shapefile / GeoJSON) que el **navegador** recorta, reproyecta y alinea a una grilla común;
3. define por criterio una función de idoneidad y, si quiere, vetos y exclusiones;
4. obtiene los pesos de su panel de expertos AHP (la misma pestaña Expertos de hoy);
5. ve el mapa de idoneidad **recalcularse al instante** en un geovisor, consulta cualquier punto y ve su **% de viabilidad** con el desglose por criterio;
6. exporta **PNG** y **GeoTIFF** (más estilo QGIS y una "receta" reproducible), y puede publicar el resultado en una vista pública de solo lectura donde cualquiera hace clic en un punto y ve su % de viabilidad.

Los archivos originales pesados **nunca se suben**: se leen en el navegador. Al servidor solo van las grillas ya alineadas y recortadas (unos MB) y la configuración.

### Decisiones ya tomadas (grill-me, 24 sep 2026)

| Tema | Decisión |
|---|---|
| Fecha | Después del curso. Sin recortar calidad para llegar a S5. |
| Origen de datos | **Catálogo del docente + carga propia del estudiante.** |
| Compartir | Dueño + **vista pública `/p/[token]`** de solo lectura. |
| Qué expone lo público | Solo el **resultado** (no las capas de entrada), pero con **consulta de punto → % de viabilidad + clase**. |
| Relación con QGIS (S6) | **Complementa**: el geovisor explora rápido; exporta GeoTIFF para seguir en QGIS. El taller de QGIS no cambia. |
| Tutorial | Página en `/tutorial` + **proyecto de ejemplo** + recorrido guiado in-app; segundo tutorial corto con el caso paneles solares. |
| Cuota | **Editable por el administrador**, sube o baja, desde `/admin`. |

### Decisiones que tomé por el docente (cámbialas si no convienen)

1. Un proyecto espacial es `kind='spatial'` con `method='saw'` y `weighting_method='ahp'`. **Es literalmente SAW** (suma ponderada) con las alternativas siendo píxeles y la normalización min-max reemplazada por funciones de idoneidad. Así `JudgmentEditor`, `ExpertFlow`, `expert_get` y el panel de expertos **no cambian** (ya muestran solo la hoja `crit` cuando `method != 'ahp'`).
2. El resultado público se guarda **en la base de datos** (tabla `geo_results`, en base64), no en Storage, y se sirve por una función `SECURITY DEFINER` que valida el token. Motivo: se revoca al instante al quitar «público», sin URLs firmadas ni políticas de Storage. Es una excepción documentada a "nada persiste resultados calculados" (ver §9).
3. Mapa base: MapLibre GL JS con teselas de un proveedor sin clave (a verificar, §15). Sin mapa base en las exportaciones de la v1.
4. La grilla de trabajo es **una por proyecto**; las capas del catálogo se **referencian** (no cuentan en la cuota).
5. "% de viabilidad" = índice de idoneidad ×100. **No es una probabilidad**; la interfaz lo dice.

---

## 1. Alcance

**Entra (v1):** proyecto espacial; catálogo + carga propia (GeoTIFF, shapefile en zip, GeoJSON); alineación en el navegador; funciones de idoneidad (trapezoidal, creciente, decreciente, reclasificación de categorías); vetos y exclusiones; pesos desde el panel AHP; geovisor con consulta de punto, puntos de interés y estadísticas por clase; exportar PNG, GeoTIFF, `.qml`, paquete `.zip`, Excel de puntos; publicar y vista pública; cuota y catálogo en `/admin`; tutorial, proyecto de ejemplo, asistente `/metodo`.

**No entra (v1):** descarga automática de datos desde servicios remotos; cálculo de distancias por red vial (solo euclidiana); ANP; Fuzzy; edición de polígonos en el mapa; formatos KML/KMZ/GPKG; estadísticas zonales por polígono dibujado; filtro de área mínima contigua (candidato a v1.1, muy útil para fincas solares); comparar dos escenarios con cortina (v1.1); mapa base dentro de las exportaciones.

---

## 2. Qué archivos carga el estudiante

### 2.1 Tipos aceptados

| Formato | Uso | Notas |
|---|---|---|
| `.tif` / `.tiff` (GeoTIFF, COG, BigTIFF) | Criterios continuos o categóricos, DEM | Banda 1. Debe tener georreferencia y CRS. Un `.tif` sin CRS se rechaza con instrucciones. |
| `.zip` con shapefile (`.shp` + `.dbf` + `.prj`) | Exclusiones (polígonos) y distancias (líneas/puntos) | Falta `.prj` o `.dbf` → error explicativo. |
| `.geojson` / `.json` | Igual que el shapefile | Se asume EPSG:4326 (estándar RFC 7946). |

**Rechazados con guía de conversión:** `.kml`, `.kmz`, `.gpkg`, `.img`, `.asc` → «ábrelo en QGIS y expórtalo como GeoTIFF / GeoJSON».

### 2.2 Caso ejemplo: finca de paneles solares

| Criterio | Fuente pública | Archivo | Función típica |
|---|---|---|---|
| Irradiación (GHI o PVOUT) | Global Solar Atlas | GeoTIFF | creciente |
| Pendiente | DEM Copernicus GLO-30 o SRTM | GeoTIFF (DEM; la plataforma calcula la pendiente) | decreciente + veto por pendiente máxima |
| Uso y cobertura del suelo | ESA WorldCover o cobertura oficial (IDEAM/IGAC) | GeoTIFF o shapefile | reclasificación de categorías |
| Distancia a red eléctrica / subestaciones | OSM (Overpass) o UPME/XM | GeoJSON o shapefile (líneas/puntos) | decreciente sobre la distancia |
| Distancia a vías | OSM | GeoJSON o shapefile | decreciente sobre la distancia |
| Exclusión: áreas protegidas | RUNAP | shapefile | máscara |
| Exclusión: agua, urbano, resguardos | OSM, ANT, IGAC | shapefile o GeoJSON | máscara con buffer |
| Temperatura (opcional, pérdida de eficiencia) | WorldClim | GeoTIFF | decreciente |

Los umbrales que muestre el tutorial son **ilustrativos**. Cada estudiante los justifica con literatura en su artículo. La plataforma **nunca** inventa juicios de expertos ni presenta un umbral como del panel (regla del proyecto).

### 2.3 Qué hace la plataforma con cada archivo

- **Ráster continuo:** recorta a la ventana del área, reproyecta y remuestrea a la grilla. Si el origen es más fino que la grilla, **promedia** (no toma el vecino más cercano, que produce aliasing). Si es más grueso, interpola bilineal.
- **Ráster categórico:** vecino más cercano al ampliar, **moda** al reducir.
- **DEM:** además genera la capa `pendiente` (ver §6.2 sobre la fidelidad con el notebook).
- **Polígonos:** rasterizados a máscara 0/1; con buffer opcional (transformada de distancia y umbral).
- **Líneas/puntos:** rasterizados y convertidos en un ráster de **distancia en metros** (transformada de distancia euclidiana exacta). Esa distancia es la capa del criterio.
- **Sin dato en un píxel de un criterio:** el píxel queda `sin dato` y se excluye del mapa; la interfaz informa el % del área afectada.

### 2.4 Validaciones y mensajes (causa + cómo arreglar)

| Situación | Mensaje |
|---|---|
| Sin georreferencia | «Este archivo no tiene coordenadas. Ábrelo en QGIS y expórtalo como GeoTIFF con su sistema de coordenadas.» |
| CRS no soportado | «No reconozco el sistema EPSG:xxxx. Reproyéctalo a EPSG:4326 o al de tu proyecto en QGIS (Ráster → Proyecciones → Reproyectar).» |
| No se solapa con el área | «Esta capa no cubre tu área de estudio. Descárgala de nuevo con la extensión correcta.» |
| Cobertura parcial | «Cubre el 62 % de tu área; el resto se tratará como sin dato y quedará excluido.» + botón «Ver dónde». |
| Multibanda | «Uso la banda 1. ¿Es la correcta?» + selector. |
| Archivo demasiado grande para leer | «Este archivo tiene N millones de píxeles en tu área. Recórtalo en QGIS al área de estudio o baja la resolución.» |
| Cuota excedida | «Este proyecto usa X de Y MB. Reduce el área, sube la resolución (píxeles más grandes) o pide más cuota al docente.» |
| Shapefile incompleto | «Falta el archivo `.prj` dentro del zip. Sin él no sé en qué coordenadas está.» |

Todos los errores usan `role="alert"`, van junto al campo y traen la salida (retry, cambiar, ayuda).

---

## 3. Arquitectura

```
Disco del estudiante                 Navegador                              Supabase
─────────────────────      ──────────────────────────────────      ─────────────────────────────
DEM.tif, WorldCover.tif    File API (fromBlob, lectura por rangos)
red.geojson, RUNAP.zip  ─► Web Worker: leer → recortar → reproyectar     projects (kind, geo jsonb)
                              → remuestrear → rasterizar → distancia     project_layers (fila por capa)
                              → pendiente                                Storage geo-grids (privado)
                           IndexedDB: caché de grillas decodificadas  ◄─►   {owner}/{proyecto}/{capa}.bin.gz
                           Worker: funciones s_i → Σ w_i·s_i·vetos      geo_results (resultado público, DB)
                              → clases → RGBA (LUT)                     app_settings + profiles.geo_quota_mb
                           MapLibre + canvas ─ consulta de punto        geo_packs / geo_pack_layers
                           Exportar PNG / GeoTIFF / QML / zip / Excel   Storage geo-catalog (lectura pública)
                                                                        RPC: reserva, publica, public_geo_get
```

Principios:
- **Módulos puros** (`src/lib/geo/*.ts`, sin dependencias, solo `import type`) para toda la matemática, de modo que corran bajo `node --experimental-strip-types` como los demás `check-*.ts`. La E/S (geotiff.js, proj4, shpjs, MapLibre) queda en módulos delgados aparte.
- **Todo lo pesado en un Web Worker.** El hilo principal solo pinta.
- **El navegador es la única fuente de cálculo**; el servidor guarda insumos alineados y, solo al publicar, el resultado.

---

## 4. Modelo de datos (migración `20240101000010_geo.sql` y siguientes)

Convención del repo: una migración por cambio, sin editar las ya aplicadas.

### 4.1 `projects`

```sql
alter table public.projects
  add column if not exists kind text not null default 'decision'
    check (kind in ('decision', 'spatial')),
  add column if not exists geo jsonb not null default '{}'::jsonb;
```

`method='saw'` y `weighting_method='ahp'` en los espaciales. `alternatives` queda `[]`. `criteria` sigue siendo la lista de criterios y cada criterio se enlaza a una capa por `geo.rules[criterionId].layerId`.

`geo` (tipo `GeoConfig` en `src/lib/types.ts`):

```ts
type GeoConfig = {
  grid?: { crs: string; bbox: [number, number, number, number]; res: number; w: number; h: number };
  rules: Record<string /*criterionId*/, {
    layerId?: string;
    fn: { type: 'trapezoid'; a: number; b: number; c: number; d: number }
      | { type: 'up'; a: number; b: number } | { type: 'down'; c: number; d: number }
      | { type: 'classes'; map: Record<string, number> };          // categoría -> 0..1
    veto?: { op: '<' | '>'; value: number };                       // idoneidad 0 si se cumple
    unit?: string;
  }>;
  masks: { layerId: string; label: string; bufferM?: number }[];   // exclusiones legales/ambientales
  classes: { alta: number; media: number };                        // 0.70 y 0.45 por defecto (UPRA)
  points: { id: string; name: string; lat: number; lon: number }[]; // puntos de interés, máx. 50
  published?: { at: string; hash: string };                        // huella de la configuración publicada
};
```

### 4.2 Capas

```sql
create table public.project_layers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('criterion', 'mask', 'derived')),
  name text not null,
  source jsonb not null default '{}'::jsonb,   -- {type:'upload', file, size} | {type:'pack', pack, layer}
  meta jsonb not null default '{}'::jsonb,     -- dtype, escala/offset, nodata, min/max, cobertura %
  storage_path text,                           -- null si viene del catálogo
  size_bytes bigint not null default 0,        -- 0 si viene del catálogo
  license_note text not null default '',       -- fuente/licencia/cita, va al metadato de las exportaciones
  created_at timestamptz not null default now()
);
```

RLS: solo el dueño del proyecto (`exists (select 1 from projects p where p.id = project_id and p.owner_id = auth.uid())`). Expertos y público **no** entran a esta tabla.

Formato de archivo en Storage: `Uint16` cuantizado entre `[min,max]` (continuas), `Uint8` (categóricas y máscaras), comprimido con gzip (`CompressionStream`, con `fflate` de respaldo). Los metadatos van en `meta`, no dentro del archivo.

### 4.3 Resultado público

```sql
create table public.geo_results (
  project_id uuid primary key references public.projects(id) on delete cascade,
  grid_b64 text not null,        -- 2 planos Uint8, gzip, base64
  meta jsonb not null,           -- bbox, crs, res, w, h, pesos, CR, umbrales, leyenda, hectáreas por clase
  size_bytes int not null,
  updated_at timestamptz not null default now()
);
```

Codificación (dos planos de `w*h` bytes):
- plano `pct`: 0–100 = índice ×100 redondeado; 255 = sin dato.
- plano `code`: 0 exclusión legal, 1 no apta (bajo umbral), 2 aptitud moderada, 3 alta, 4 veto, 254 sin dato.

Las clases se guardan como plano aparte para que un píxel en el borde de un umbral no cambie de clase por el redondeo.

RLS de `geo_results`: solo el dueño. La lectura pública es por `public_geo_get`.

### 4.4 Catálogo

```sql
create table public.geo_packs (
  id text primary key,                         -- 'snsm-cacao-v1'
  title text not null, description text not null default '',
  attribution text not null default '',        -- WorldClim, SoilGrids, Copernicus, RUNAP…
  grid jsonb not null,                         -- crs, bbox, res, w, h
  defaults jsonb not null default '{}',        -- funciones de referencia (FEDECACAO/UPRA) por criterio
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.geo_pack_layers (
  pack_id text references public.geo_packs(id) on delete cascade,
  layer_id text, name text not null, kind text not null, unit text,
  meta jsonb not null, storage_path text not null, size_bytes bigint not null,
  primary key (pack_id, layer_id)
);
```

Bucket `geo-catalog`: lectura pública, escritura solo admin (política con una función `is_admin()`; hoy la lógica de admin vive dentro de `admin_stats`, hay que extraerla a un helper reutilizable, ver §10).

### 4.5 Cuota y ajustes

```sql
create table public.app_settings (key text primary key, value jsonb not null);
-- 'geo': {"quota_mb": 30, "max_layers": 12, "max_pixels": 2000000}
alter table public.profiles add column if not exists geo_quota_mb int;  -- null = usa el global
```

`app_settings` sin políticas RLS (solo RPC `security definer`), mismo patrón que `rate_limit_log` y `admin_access_log`.

### 4.6 Funciones (`security definer`, con `_rate_limit` donde aplique)

| Función | Quién | Qué hace |
|---|---|---|
| `geo_quota(p_project uuid)` | dueño | `{used, quota, layers, max_layers}` calculado desde `project_layers` + `geo_results` de **todos** los proyectos del dueño. |
| `geo_reserve_layer(p_project, p_name, p_kind, p_size, p_meta)` | dueño | Verifica propiedad, cuota (`used + p_size <= quota`), número de capas y píxeles; inserta la fila y devuelve `id` y `storage_path`. |
| `geo_delete_layer(p_layer)` | dueño | Borra la fila (el cliente borra el objeto; una tarea de limpieza reconcilia huérfanos). |
| `geo_publish_result(p_project, p_grid_b64, p_meta)` | dueño | Valida propiedad y tamaño máximo (p. ej. 3 MB en base64), hace upsert en `geo_results`. |
| `public_geo_get(p_token)` | cualquiera | `_rate_limit`; exige `is_public`; devuelve `grid_b64` + `meta`. **Nunca** capas de entrada. |
| `admin_geo_settings()` / `admin_set_geo_settings(...)` | admin | Lee y edita los topes globales. |
| `admin_set_user_quota(p_email, p_mb)` | admin | Cuota individual (o `null` para volver al global). |
| `admin_geo_usage()` | admin | Por usuario: MB usados, proyectos, capas, cuota efectiva. |

Además: `public_get` y `expert_get` deben devolver `kind` (mismo patrón que la migración 0005 con `weighting_method`).

### 4.7 Storage: cómo se hace cumplir la cuota

Las políticas de Storage no ven el tamaño real de forma fiable en el `INSERT`. Defensa en capas:
1. **Reserva previa** por `geo_reserve_layer`, que valida cuota, número de capas y píxeles y devuelve la ruta autorizada.
2. **Política de Storage**: solo se puede subir a `{auth.uid()}/{proyecto}/{capa}` cuando existe una fila reservada de ese usuario (comprobación con `exists`).
3. **Límite por archivo del bucket** (`file_size_limit`, p. ej. 8 MB): tope duro aunque el cliente mienta en el tamaño declarado.
4. Peor caso acotado: `max_layers × file_size_limit` por proyecto.
5. Limpieza: reservas sin objeto y objetos sin fila, reconciliadas por una función de admin (`admin_geo_gc`), manual al principio.

Si el docente baja la cuota por debajo del uso actual: **no se borra nada**; se bloquean nuevas subidas y la interfaz muestra «sobre la cuota».

---

## 5. Pipeline en el navegador (`src/lib/geo/`)

### 5.1 Módulos

| Módulo | Contenido | Puro |
|---|---|---|
| `membership.ts` | `trapezoid`, `up`, `down`, `classes`, veto. Port de `membership.py`. | sí |
| `weights.ts` | Une los pesos de `ahp.ts` (sin reimplementar AHP). | sí |
| `suitability.ts` | `S = Σ wᵢ·sᵢ · Π vetos`, exclusiones, `sin dato`, clasificación por umbrales. | sí |
| `terrain.ts` | Pendiente (ver §6.2). | sí |
| `distance.ts` | Transformada de distancia euclidiana exacta (Felzenszwalb–Huttenlocher, 2 pasadas). | sí |
| `rasterize.ts` | Polígonos (scanline, even-odd con huecos), líneas (segmentos densificados), puntos. | sí |
| `resample.ts` | Promedio, bilineal, vecino más cercano, moda. | sí |
| `grid.ts` | Definición de grilla, píxel↔coordenada, conteo de hectáreas. | sí |
| `codec.ts` | Cuantizado u16/u8, gzip, base64, plano `pct`/`code`. | sí |
| `crs.ts` | Conjunto CRS soportado con definiciones proj4 (4326, 3857, 9377, 3116, 4686, UTM). | no (proj4) |
| `tiff-read.ts` | geotiff.js: metadatos, ventana, remuestreo, selección de overview. | no |
| `vector-read.ts` | GeoJSON y shapefile (`shpjs`). | no |
| `tiff-write.ts` | GeoTIFF georreferenciado. | no |
| `render.ts` | LUT de color y RGBA. | sí |
| `align.worker.ts`, `calc.worker.ts` | Orquestan lo anterior con progreso y cancelación. | no |

### 5.2 Reproyección

Para cada píxel de la grilla destino se necesita su coordenada en el CRS origen. Llamar a proj4 por píxel (1 M píxeles × varias capas) es lento. Se calcula la transformación en una **retícula gruesa** (cada 8–16 píxeles) y se **interpola bilinealmente** la coordenada origen. El error es despreciable para proyecciones suaves y baja el costo unas 100 veces. Se valida contra proj4 píxel a píxel en el test (§13).

### 5.3 Lectura de archivos grandes

- `GeoTIFF.fromBlob(file)` lee **por rangos del disco local**, sin cargar el archivo entero.
- Para COG/tiffs con overviews se elige la imagen cuya resolución sea ≥ la necesaria, en vez de decodificar la resolución completa.
- Tope de píxeles a decodificar por capa (configurable) con mensaje de recorte previo.
- Progreso por capa, botón **Cancelar**, y la interfaz sigue viva (worker).

### 5.4 Presupuestos de rendimiento (a verificar en el spike)

| Operación (1 M píxeles) | Objetivo |
|---|---|
| Cambiar un peso | ≤ 50 ms (solo recomputar suma ponderada + color) |
| Cambiar una función | ≤ 150 ms (recomputar esa `sᵢ`) |
| Alinear una capa continua | ≤ 10 s con barra de progreso |
| Distancia a líneas | ≤ 3 s |
| Publicar el resultado | ≤ 2 s |

Caché: `sᵢ` por capa en memoria; ante un cambio de peso no se recalculan las funciones. Las grillas se guardan en **IndexedDB** para no volver a descargar de Storage.

### 5.5 Tamaños de referencia

- Área SNSM del notebook (≈154 × 144 km) a 250 m: ≈ 0.35 M píxeles. Capa u16 comprimida: ~0.3–0.6 MB. Paquete completo de 4–6 capas: ~2–4 MB.
- Tope por defecto: 2 M píxeles por capa. La pantalla de área muestra en vivo **píxeles, MB estimados y % de cuota** antes de alinear.

---

## 6. Matemática y paridad con el notebook

### 6.1 Cuarto sitio donde vive la matemática

Hoy la matemática vive en tres sitios (`ahp.ts`, plantilla HTML, Excel). Aquí se suma un cuarto, con la **misma regla: si cambia, cambia en todos**:
`data/ahp_sig_snsm/membership.py` + notebook ↔ `src/lib/geo/membership.ts` ↔ Excel de puntos (§8.5). Los pesos AHP no se reimplementan: salen de `ahp.ts`.

### 6.2 Pendiente: hay una trampa

El notebook calcula la pendiente con `np.gradient(dem_250, 250, 250)` **sobre el DEM ya remuestreado a 250 m**, no sobre el de 30 m. Consecuencias:
- Para dar **los mismos números que el notebook**, el valor por defecto de la plataforma replica `np.gradient` (diferencias centrales en el interior y unilaterales en el borde) sobre la grilla de trabajo.
- Metodológicamente esto **suaviza** la pendiente (subestima en terreno escarpado). Se ofrece como opción avanzada «calcular la pendiente a mayor resolución y agregarla» (Horn sobre una ventana más fina, luego promedio). Es una diferencia de método, no un error; se documenta en el tutorial y en los metadatos exportados.
- Decisión abierta para el docente: si el notebook debería cambiar. No es parte de este plan.

### 6.3 Otros detalles que deben coincidir

- `trapezoid(x,a,b,c,d)`: `nan` se propaga; `b>a` y `d>c` con rampas lineales; tolerancia en bordes idéntica a `np.where`.
- Vetos multiplicativos (0/1), no compensatorios.
- Clasificación: `≥0.70` alta, `[0.45,0.70)` moderada, `<0.45` no apta; exclusión legal gana sobre todo lo demás; veto → clase 4.
- La `exclusión legal` del notebook incluye `dem ≥ 3000 m` (páramo): en la plataforma es una **regla** editable, no una constante.

---

## 7. UX / UI

Se reutiliza el sistema visual existente (`globals.css`: `.card`, `.btn`, `.seg`, `.tabs`, `.banner`, `.eyebrow`, tokens `--pa/--pb/--pass/--warn`, tipografías Bricolage Grotesque / Plus Jakarta Sans / IBM Plex Mono). No se crea un sistema nuevo. Estilo coherente con la plataforma: sobrio, oscuro/claro, acento por método.

### 7.1 Dónde vive

| Lugar | Cambio |
|---|---|
| `/dashboard` → «Nuevo proyecto» (`NewProject.tsx`) | Selector de tipo: **Decisión con alternativas** / **Mapa de aptitud (SIG)**. Casilla «usar el caso guiado» (patrón `useIotCase`) → **Aptitud cacaotera en la Sierra Nevada**. |
| `/metodo` (`MetodoClient.tsx`) | Nueva pregunta previa: «¿Tus alternativas son lugares o píxeles de un territorio?» → sí lleva a AHP + SIG. Nueva familia visual con token `--m-sig`. |
| `/projects/[id]` (`ProjectWorkspace.tsx`) | Si `kind='spatial'`, otro conjunto de pestañas (§7.2). |
| `/p/[token]` (`PublicView.tsx`) | Si `kind='spatial'`, vista pública del geovisor (§9). |
| `/tutorial` | Nueva fase «Mapas de aptitud (AHP + SIG)» + caso solar. |
| `/admin` | Sección «Almacenamiento geoespacial» (§10). |
| `Topbar` | Sin cambios. |

### 7.2 Pestañas de un proyecto espacial

`Proyecto · Área y capas · Reglas · Priorización (A) · Expertos · Geovisor · Compartir`

- **Proyecto**: título, objetivo, criterios (nombre, unidad, qué es mejor). Sin editor de alternativas.
- **Priorización (A)** y **Expertos**: idénticas a hoy. El experto sigue en `/e/[token]` comparando solo criterios.
- **Área y capas**, **Reglas** y **Geovisor**: nuevas. El orden de trabajo natural es el orden de las pestañas, con un indicador de estado por pestaña («4/5 capas listas», «CR 0.07») usando el patrón de estado de `.ni .s`.

Un **stepper** discreto al tope (`Área → Capas → Reglas → Pesos → Mapa`) muestra el avance y a qué pestaña ir; cada paso pendiente explica qué falta.

### 7.3 Pantalla «Área y capas»

**Paso 1: área de estudio y resolución.**

```
┌ Área de estudio ─────────────────────────────────────────────┐
│ ( ) Usar un paquete del catálogo   ( ) Definir mi propia área│
│                                                              │
│  [ mapa pequeño con rectángulo editable ]   Extensión:       │
│                                             O -74.24  N 11.49│
│                                             E -72.85  S 10.19│
│ Sistema:  [ EPSG:9377 · MAGNA Origen Nacional ▾ ]  (auto)    │
│ Resolución: 250 m  ────●────  (30 m … 1 km)                  │
│                                                              │
│ 616 × 576 = 354 816 píxeles · 6.25 ha/píxel                  │
│ ≈ 0.4 MB por capa · 6 capas ≈ 2.4 MB de 30 MB   ████░░░░░░░  │
│                                     [ Fijar área y continuar ]│
└──────────────────────────────────────────────────────────────┘
```

- Por defecto CRS automático: EPSG:9377 si el área cae en Colombia, si no la zona UTM del centroide.
- Si el área excede el tope de píxeles, el botón se deshabilita y explica qué mover (área o resolución).
- Cambiar el área después **invalida las capas cargadas** y lo avisa antes de confirmar: «Tendrás que volver a elegir estos N archivos» (se muestran nombre y tamaño para ubicarlos).

**Paso 2: capas.** Una fila por criterio + una sección «Exclusiones».

```
Criterio            Fuente                       Estado         
─────────────────── ──────────────────────────── ───────────────
Precipitación       [Catálogo · WorldClim BIO12]  ✔ lista · 0.4 MB   [Cambiar]
Temperatura         [Catálogo · WorldClim BIO1]   ✔ lista            [Cambiar]
Irradiación         [ Arrastra un .tif aquí o  Elegir archivo ]      
Distancia a red     [ Subir línea (.geojson / .zip) ]  ⟳ Alineando… 63 %  [Cancelar]
Exclusiones ▸       + Añadir máscara (polígonos, con buffer opcional)
```

- Cada fila: zona de arrastre (también botón «Elegir archivo», accesible por teclado), qué formatos acepta, y **mini vista previa** con histograma y rango una vez lista.
- Estados: vacío, leyendo, alineando (progreso + cancelar), lista, advertencia (cobertura parcial), error (mensaje + salida).
- La fila del DEM ofrece «Generar pendiente» como capa derivada.
- Cada capa guarda **fuente y licencia** (campo obligatorio para archivos propios, precargado desde el catálogo): sale en las exportaciones.
- Dos archivos en paralelo como máximo; el resto en cola.

### 7.4 Pantalla «Reglas»

Lista de criterios; al abrir uno (divulgación progresiva) aparece:

```
Temperatura media anual · °C                        Peso 0.32 (AHP)
┌─────────────────────────────────────────────┐   Tipo de función
│ idoneidad 1 ┤      ┌────────┐               │   ( ) Creciente ( ) Decreciente
│            │    ╱          ╲                │   (●) Trapezoidal ( ) Categorías
│          0 ┼──╱────────────╲───── °C        │
│           15   22        30   38             │   a [15] b [22] c [30] d [38]
└─────────────────────────────────────────────┘   Veto  [ ] idoneidad 0 si  [< ▾] [15]
histograma de la capa de fondo (opcional)         Fuente: FEDECACAO (2015)  [editar]
```

- El gráfico permite **arrastrar los puntos** a/b/c/d, **y** hay campos numéricos equivalentes (alternativa por teclado y táctil; regla de "no depender solo de gestos"). Validación en línea: `a ≤ b ≤ c ≤ d`, con el error junto al campo.
- Para categorías: tabla «valor → idoneidad» con las clases presentes en la capa y su nombre si vienen en la leyenda.
- Un texto obligatorio «¿por qué estos umbrales?» (cita o justificación) se muestra en el informe y el `.zip`.
- En el catálogo, las funciones traen valores de referencia marcados como «referencia FEDECACAO/UPRA, editable».
- Sección «Exclusiones y vetos globales»: máscaras (con buffer), y la regla de páramo (`dem ≥ 3000`) como regla editable.
- Sección «Clases del mapa»: umbrales de alta y moderada (0.70 / 0.45 por defecto).

### 7.5 Pantalla «Geovisor» (escritorio)

```
┌ Geovisor ─────────────────────────────────────────────────────────────────────┐
│┌ Modelo ───────┐ ┌───────────────────────────────────────────┐┌ Punto ────────┐│
││ Pesos (AHP)   │ │                                            ││ Viabilidad    ││
││ Precip. ██ .32│ │                                            ││  78 %         ││
││ Temp.   ██ .24│ │         MAPA (MapLibre + canvas)           ││ Alta aptitud  ││
││ pH      █  .12│ │                                            ││ 10.77, -74.02 ││
││ Pend.   █  .19│ │                       ┌────────┐ [+][−]    ││ ────────────  ││
││ CR 0.07 ✔     │ │  Leyenda              │Capa ▾  │ [◎]       ││ Precip 1820 mm││
││ Explorar pesos│ │  ■ Alta ≥70           │Opac ── │           ││  s=1.00 ×.32  ││
││ [ deslizar ]  │ │  ■ Moderada 45–70     │Base ▾  │           ││ Temp 24.1 °C  ││
││ Clases        │ │  ■ No apta <45        └────────┘           ││  s=1.00 ×.24  ││
││ Alta ≥ [70]   │ │  ■ Excl. legal / veto        escala ─────  ││ pH 6.1 …      ││
││ Mod. ≥ [45]   │ └───────────────────────────────────────────┘│ ▸ Puntos (4)  ││
│└───────────────┘ ┌ Hectáreas por clase (barras + tabla) ───────┘└───────────────┘│
│                  Exportar ▾   Publicar ▾                                        │
└───────────────────────────────────────────────────────────────────────────────┘
```

- **Panel Modelo (izquierda):** pesos vigentes con barras, chip de CR (verde < 0.10, ámbar ≥ 0.10 con advertencia), y **«Explorar pesos»**: deslizadores temporales para ver cómo cambia el mapa **sin tocar los juicios de los expertos**. Al usarlos, un banner ámbar fijo dice «Estás explorando: estos pesos no son los del panel» con «Volver a los del panel». Nada se publica ni exporta con pesos exploratorios sin advertir. Un deslizador tiene campo numérico gemelo.
- **Mapa:** selector de **capa mostrada** (Resultado / cada criterio `sᵢ` / exclusiones), **opacidad**, **mapa base** (calles / satélite / oscuro, sigue el tema), zoom, «Ir a mi área», **«Consultar el centro del mapa»** (alternativa accesible al clic).
- **Panel Punto (derecha):** aparece al hacer clic; ver §8.1.
- **Estadísticas:** hectáreas y % por clase; barras horizontales con **etiqueta directa** y una tabla equivalente colapsable.
- **Barra de acciones:** Exportar, Publicar.

### 7.6 Móvil (375 px)

- El mapa ocupa la parte superior (`min-height: 60dvh`); debajo, una **hoja inferior** con pestañas: **Modelo · Capas · Punto · Exportar**. Al tocar el mapa se abre la pestaña Punto.
- Todos los objetivos táctiles ≥ 44 px y separación ≥ 8 px. Las manijas del gráfico de funciones tienen zona de toque ampliada; los campos numéricos son la vía principal en móvil.
- Sin desplazamiento horizontal. La hoja no oculta la escala ni la atribución (padding de seguridad inferior).
- Orientación horizontal usable (panel lateral colapsable).

### 7.7 Estados vacíos, carga y error

| Estado | Diseño |
|---|---|
| Sin capas aún | Ilustración simple + «Empieza eligiendo un paquete o fijando tu área» con un solo CTA primario. |
| Cargando el mapa | *Skeleton* del contenedor con altura reservada (sin salto de layout) + «Preparando el mapa…». MapLibre se carga con `next/dynamic` solo en esta pestaña. |
| Recalculando | Indicador discreto en la esquina del mapa si tarda > 300 ms; el mapa anterior sigue visible (no parpadea). |
| Sin pesos (panel sin respuestas) | Banner: «Aún no hay pesos. Agrega expertos en la pestaña Expertos, o usa Explorar pesos para probar.» |
| CR ≥ 0.10 | Banner ámbar con ir a Expertos. No bloquea. |
| Error de red / Storage | Mensaje con «Reintentar»; los datos locales siguen. |
| Cuota excedida | Mensaje con las tres salidas del §2.4. |

### 7.8 Color, tipografía, iconos, movimiento

- **Color:** tokens en `globals.css` (claro y oscuro). Nuevos: `--m-sig` (familia de método, un verde-lima distinto de `--m-vikor`, contraste verificado como en `check-excel-colors`), y las clases del mapa `--geo-excl` (gris `#7F8C8D`), `--geo-noapta` (rojo), `--geo-media` (naranja), `--geo-alta` (verde), con variantes para oscuro. Se mantienen los colores del notebook para continuidad con S5.
- **Rampa continua:** RdYlGn (como el notebook) y una **paleta apta para daltonismo** (viridis) con un interruptor. Nunca solo color: la leyenda lleva texto y rangos numéricos, el panel de punto muestra el **nombre de la clase**, y hay tabla equivalente.
- **Tipografía:** cifras, coordenadas y % en `--f-mono` con `tabular-nums`; títulos `--f-display`; cuerpo 15 px mínimo, 16 px en móvil (evita el zoom de iOS).
- **Iconos:** SVG en línea (`GeoIcons.tsx`, ~12 iconos con un mismo trazo), nunca emojis. Todo botón solo-icono lleva `aria-label`.
- **Movimiento:** 150–300 ms, solo `transform`/`opacity`; `prefers-reduced-motion` → sin `flyTo` animado ni transiciones de opacidad del ráster (cambio instantáneo). Las animaciones no bloquean la entrada.
- **Z-index:** escala definida (mapa 0, controles 10, paneles 20, hoja móvil 30, modal 100, toast 1000).
- **Modo oscuro:** mapa base oscuro y ráster con la misma rampa; se revisa contraste de borde y texto en ambos temas por separado.

### 7.9 Accesibilidad (checklist obligatorio)

- Mapa enfocable (`tabindex=0`, `role="application"` con `aria-label`); flechas para mover, `+`/`−` para zoom (los handlers de teclado de MapLibre); botón **«Consultar el centro del mapa»** y campo **«Ir a coordenadas»** como alternativas al clic.
- Región `aria-live="polite"`: «Viabilidad en 10.77, -74.02: 78 %, alta aptitud». Sin robar el foco.
- Orden de tabulación = orden visual; foco visible (`:focus-visible` existente); al cambiar de pestaña, el foco va al encabezado del panel.
- Formularios: etiqueta visible por campo, error debajo del campo, `aria-describedby`, resumen de errores con enlaces cuando hay varios.
- Confirmaciones destructivas (borrar capa, cambiar área) con diálogo y foco atrapado, con «Cancelar» y Escape.
- Contraste ≥ 4.5:1 en texto (3:1 en gráficos) en claro y oscuro.
- Tabla equivalente para estadísticas y para los puntos de interés.
- Se prueba con lector de pantalla, teclado solo, zoom 200 % y texto grande.

---

## 8. Geovisor: funciones

### 8.1 Consulta de punto → % de viabilidad

Al hacer clic (o «Consultar el centro»): se convierte lat/lon a píxel (proj4 → grilla), se leen `pct` y `code` y se muestra:

- **Dueño:** viabilidad grande (`78 %`), clase con nombre y color, coordenadas (WGS84 y CRS del proyecto, con copiar), elevación si hay DEM, y una tabla por criterio: **valor crudo con unidad · idoneidad `sᵢ` · peso · aporte**, con los vetos activados resaltados y la razón si está excluido («Dentro de PNN Sierra Nevada»). Etiqueta fija: «Índice de idoneidad 0–100. No es una probabilidad».
- **Público:** solo `%`, clase y, si aplica, «Excluido: área protegida / veto» (el código de razón). Sin desglose por criterio ni valores crudos, porque revelarían las capas de entrada.
- **Fuera del área o sin dato:** «Este punto está fuera del área de estudio» / «Sin dato en este punto».

### 8.2 Puntos de interés (equivalen a las "zonas" de S5)

Lista de hasta 50 puntos con nombre (ej. Palmor, San Pedro, Bonda, Guachaca del notebook). Se agregan desde la consulta de punto («Guardar como punto») o por coordenadas. Tabla ordenable por viabilidad con la clase; exportable a CSV y al Excel (§8.5). Es el puente natural con «las 4 zonas» del caso de clase.

### 8.3 Estadísticas

Hectáreas y % por clase sobre el área válida; total de píxeles sin dato; hectáreas con viabilidad ≥ X (control deslizante). **v1.1:** filtro de **área mínima contigua** (etiquetado de componentes conexas) y estadísticas dentro de un polígono cargado.

### 8.4 Exportaciones (menú «Exportar»)

| Salida | Contenido | Nota |
|---|---|---|
| **PNG mapa** | Ráster a resolución de la grilla ampliado ×k (vecino más cercano), fondo transparente | Con `.pgw` (world file) y el EPSG en el `LEEME`. |
| **PNG figura** | Mapa + leyenda + barra de escala + norte + título + fuentes/atribuciones + fecha | Sin mapa base en v1. |
| **GeoTIFF idoneidad** | `Float32` 0–1, `nodata`, CRS y transformación de la grilla | Abre directo en QGIS. |
| **GeoTIFF clases** | `Uint8` con los códigos de clase | Con el estilo. |
| **Estilo QGIS `.qml`** | Paleta de clases | Para que QGIS pinte igual que el geovisor. Verificar la plantilla con QGIS 3.x. |
| **Paquete `.zip`** | GeoTIFFs + `.qml` + PNGs + `receta.json` (pesos, CR, funciones, umbrales, capas y sus fuentes/licencias, versión, huella) + `LEEME.txt` | `receta.json` da reproducibilidad para el artículo. |
| **CSV de puntos** | Nombre, lat, lon, viabilidad, clase | |
| **Excel** | Ver §8.5 | |

Todas las exportaciones con pesos exploratorios llevan una marca «pesos exploratorios» en nombre y metadato, y piden confirmación.

### 8.5 Excel

Hoja(s) con: matriz de criterios y pesos AHP con fórmulas vivas (se reutiliza `ahpSheet()`), tabla de funciones, hectáreas por clase, y **una hoja de puntos de interés con fórmulas vivas** (`SUMPRODUCT` de pesos × idoneidades × vetos) para que el estudiante pueda **reproducir a mano** el valor de un punto. El ráster completo no va a Excel. Se verifica con el mismo recálculo real en LibreOffice que usan los otros métodos (`check-excel-recalc.ts`), incluidos los `MEDIAN`/`MAX` que ya dieron problemas: usar aritmética pura, sin expresiones-arreglo.

---

## 9. Publicar y vista pública

### 9.1 Publicar (dueño)

Pestaña **Compartir**: hoy tiene «público» y el enlace `/p/<token>`. Para espaciales se agrega **«Publicar mapa»**:
- Calcula el resultado con los pesos del panel (no con los exploratorios) y lo sube por `geo_publish_result`.
- Guarda `published.at` y una huella (`hash`) de pesos + funciones + capas + umbrales.
- Si luego cambia cualquier regla o peso, el panel muestra **«Publicación desactualizada»** con «Republicar». El enlace público mantiene el último resultado hasta que se republique.
- Al desactivar «público», `public_geo_get` deja de responder al instante.

Esto rompe a propósito la regla "nada persiste resultados calculados": es inevitable porque el público no recibe las capas de entrada y por tanto no puede recalcular. Se documenta en README y `CLAUDE.md`.

### 9.2 Vista pública

- Mismo componente de mapa en modo lectura: capa Resultado, opacidad, mapa base, leyenda, escala, atribuciones.
- **Clic en un punto → % de viabilidad + clase** (y motivo de exclusión). También «Consultar el centro del mapa» y «Ir a coordenadas».
- Hectáreas por clase. Pesos y CR **sí**, criterios y sus unidades **sí**; capas de entrada, valores crudos, nombres de expertos y Parte A **no** (coherente con `public_get` hoy).
- Exportar: solo **PNG figura** (decisión a confirmar; el GeoTIFF queda solo para el dueño).
- Sin cuenta, sin editar. Cargado con `next/dynamic`; `_rate_limit` en `public_geo_get`.
- Metadatos `<meta>` con título y descripción del proyecto.

---

## 10. Administración

### 10.1 Cuota editable

Sección **«Almacenamiento geoespacial»** en `/admin` (el docente ya tiene `role='admin'`; no hay enlace en el nav, igual que hoy).

```
Topes globales                                            [ Guardar ]
  Cuota por usuario:   [ 30 ] MB     Capas por proyecto: [ 12 ]
  Píxeles máx. por capa: [ 2 000 000 ]   Tamaño máx. por archivo: fijo en el bucket (8 MB)

Uso por usuario                         (ordenable; búsqueda)
  Correo              Proyectos  Capas  Usado / Cuota          
  ana@…                  2         9    18.2 / 30 MB   ██████░░   [ Cambiar cuota ]
  luis@…                 1         5    31.4 / 20 MB   ██████████ ⚠ sobre cuota
```

- «Cambiar cuota» por usuario (número ≥ 0, o «usar el global»).
- Bajar por debajo del uso actual: aviso «No se borra nada; se bloquean subidas nuevas». Confirmación antes de guardar.
- Cada cambio se registra en `admin_access_log` (mismo patrón que el resto del backoffice).
- Aviso de que el tope duro por archivo vive en la configuración del bucket (no editable desde aquí) y cómo cambiarlo en Supabase.
- Verificar el plan de Supabase antes de subir cuotas (§15).

### 10.2 Catálogo

Tabla de paquetes con **activar/desactivar** y ver tamaño y atribución. **La creación de paquetes es por script** (§11), no por interfaz, en la v1.

### 10.3 Refactor previo necesario

Extraer un helper `public.is_admin()` desde la lógica actual de `admin_stats()` (comprueba `profiles.role`), para reutilizarlo en las políticas de Storage y en las nuevas funciones `admin_*`. Añadir `kind` a las estadísticas de admin para que los espaciales (que son `method='saw'`) no distorsionen la «mezcla de métodos».

---

## 11. Catálogo del docente

### 11.1 Script de exportación (`scripts/geo/export_pack.py`)

Lee las mismas matrices que ya calcula el notebook 07 (`dem_250`, `pendiente_grados`, `temp_250`, `precip_250`, `ph_250`, máscara PNN, y las opcionales NDVI/humedad/accesibilidad de `data/ahp_sig_snsm/`) y produce:
- un `.bin.gz` por capa con el mismo códec que `codec.ts`;
- `manifest.json` (grilla, CRS, bbox, capas, unidades, metadatos, funciones de referencia, atribuciones y licencias).

Se sube con la CLI de Supabase o desde el panel al bucket `geo-catalog` y se registra en `geo_packs`/`geo_pack_layers` (SQL de ejemplo incluido en el script).

### 11.2 Paquete inicial: `snsm-cacao-v1`

Criterios del notebook: precipitación (WorldClim BIO12), temperatura (BIO1), pH (SoilGrids 0–5 cm), pendiente (Copernicus GLO-30 sobre 250 m); máscara PNN (RUNAP) y regla de páramo `≥3000 m`. Puntos de interés de ejemplo: Palmor, San Pedro, Bonda, Guachaca. Confirmar contra `build_notebook.py` qué otras capas del notebook final (NDVI, humedad, accesibilidad) entran al paquete.

### 11.3 Licencias

Verificar antes de publicar que se puede **redistribuir** cada fuente procesada (WorldClim, SoilGrids, Copernicus DEM, RUNAP) y con qué atribución. La atribución va en `geo_packs.attribution`, en la pantalla de capas, en la leyenda pública y en el `LEEME` de cada exportación.

---

## 12. Tutorial

### 12.1 Página `/tutorial`: nueva fase «Mapas de aptitud (AHP + SIG)»

Mismo formato `tphase` / `titem` que hoy, con capturas y «Tip». Pasos:

1. **Cuándo usar esto** (lugares, no alternativas discretas) y qué NO es (probabilidad).
2. **Antes de empezar**: qué archivos necesitas (la tabla del §2), qué es un CRS en una frase, por qué recortar antes.
3. **Crear el proyecto** y elegir tipo «Mapa de aptitud».
4. **Área de estudio y resolución**: cómo leer «píxeles / MB / cuota».
5. **Cargar capas**: catálogo o propias; cómo interpretar cobertura parcial; qué hacer con un error.
6. **Reglas**: qué es una función de idoneidad, cómo elegir a/b/c/d con literatura, vetos, exclusiones.
7. **Pesos**: se usa el panel de expertos (remite a los pasos de expertos existentes). Recordar la regla: **los juicios los aporta el panel, nunca se inventan**.
8. **Geovisor**: consulta de punto, puntos de interés, clases, explorar pesos.
9. **Exportar y seguir en QGIS**: qué trae el `.zip`, cómo abrir GeoTIFF + `.qml`.
10. **Publicar**: qué ve el público y qué no; cómo republicar.
11. **Errores frecuentes** (tabla del §2.4 ampliada) y **límites honestos** (resolución, proxies, pendiente suavizada, índice ≠ probabilidad).

### 12.2 Proyecto de ejemplo

Casilla en «Nuevo proyecto»: **«Ejemplo del curso: aptitud del cacao en la Sierra Nevada»**. Crea un proyecto espacial con el paquete `snsm-cacao-v1` referenciado, funciones FEDECACAO precargadas, exclusiones y los 4 puntos de interés. Los 4 expertos del notebook se cargan con el mecanismo actual «Cargar juicios de ejemplo», **marcados como simulados** en todas partes (regla del repo). No consume cuota.

### 12.3 Recorrido guiado in-app (*coachmarks*)

6–7 pasos anclados a elementos reales (área → capas → reglas → pesos → mapa → punto → exportar), con «Siguiente / Anterior / Omitir», teclado (Escape cierra, Tab recorre el globo), sin bloquear el resto. Se retoma donde se dejó y se puede relanzar desde un «?» en la pestaña. El progreso se guarda en `localStorage` con `try/catch` (conveniencia por visitante; la página funciona sin él).

### 12.4 Tutorial corto: finca de paneles solares

Guía con el caso del §2.2: de dónde bajar cada capa (nombre del sitio y qué opciones marcar), cómo recortar a su municipio, criterios y funciones **ilustrativas** con la advertencia de justificarlas, vetos (áreas protegidas, agua, pendiente máxima), y cómo interpretar el mapa. Al escribirlo, verificar los enlaces vigentes (no se copian URLs de memoria).

### 12.5 Ayuda contextual

Cada pantalla nueva con un «¿Cómo se hace?» que abre la sección correspondiente del tutorial; en `/metodo`, la nueva rama.

---

## 13. Verificación

Convención del repo: un `check-*.ts` por tema, sin dependencias, con valores exactos de una referencia.

| Script | Qué prueba |
|---|---|
| `check-geo-membership.ts` | `trapezoid`, `up`, `down`, `classes`, vetos contra valores de `membership.py` (JSON dorado generado por `scripts/geo/golden.py`). |
| `check-geo-suitability.ts` | Ejemplo de juguete a mano (2 capas, 4 píxeles, como en S5) y comparación con `s_biofisica` del notebook en ~20 píxeles del paquete SNSM (tolerancia 1e-6). |
| `check-geo-terrain.ts` | Pendiente idéntica a `np.gradient` (interior y bordes) sobre una malla pequeña. |
| `check-geo-distance.ts` | Transformada de distancia contra fuerza bruta en mallas aleatorias. |
| `check-geo-rasterize.ts` | Polígonos con huecos y líneas contra casos dibujados a mano. |
| `check-geo-codec.ts` | Ida y vuelta cuantizado, gzip, base64, planos `pct`/`code`. |
| `check-geo-reproject.ts` | La reproyección por retícula frente a proj4 píxel a píxel (error máximo acotado). |
| `check-geo-tiff.ts` + `scripts/geo/verify_tiff.py` | Escribe un GeoTIFF y lo relee (geotransform, CRS, valores); el script de Python lo abre con `rasterio` y compara. |
| `check-excel-geo.ts` | Fórmulas de la hoja de puntos y cachés coinciden con el JS; recálculo real en LibreOffice. |
| `check-rls.ts` (ampliar) | Otro usuario no ve capas ni resultado ajeno; sin token válido no hay `public_geo_get`; quitar «público» revoca; la cuota se hace cumplir; un usuario no sube a la ruta de otro. |
| Manual | Lista de control de §7.9 y de §14 (fase 8). |

`npm test` suma los `check-geo-*`; `npm run test:excel` suma el de Excel.

---

## 14. Fases y orden de trabajo

Orden estricto por dependencias. Tamaños relativos (S ≈ medio día, M ≈ 1–2 días, L ≈ 3–5 días, XL más).

### Fase 0 · Spikes (M)
Resolver antes de comprometer diseño:
- [ ] geotiff.js: leer por rangos un `.tif` local grande, elegir overview, leer geokeys (EPSG) y `GeoKeys→proj4` para CRS raros.
- [ ] Reproyección por retícula: precisión y tiempo con 1 M píxeles.
- [ ] MapLibre: ráster en canvas/imagen sobre mapa base, actualización a 60 fps al mover un deslizador; **distorsión del cuadrilátero** entre CRS del proyecto (9377) y Web Mercator. Si se ve, reproyectar el ráster de visualización.
- [ ] `writeArrayBuffer` de geotiff.js: georreferencia correcta y apertura en QGIS.
- [ ] Storage: política que exija fila reservada + `file_size_limit`; ver si el tamaño real llega al `INSERT`.
- [ ] Proveedor de mapa base: condiciones de uso, límites y atribución.
- [ ] Paridad `np.gradient`.

### Fase 1 · Núcleo puro y pruebas (L)
- [ ] `membership`, `suitability`, `terrain`, `distance`, `rasterize`, `resample`, `grid`, `codec`, `render`.
- [ ] JSON dorado desde Python (`golden.py`) y todos los `check-geo-*` en verde.

### Fase 2 · Datos y seguridad (L)
- [ ] Migraciones: `kind`, `geo`, `project_layers`, `geo_results`, `geo_packs*`, `app_settings`, `profiles.geo_quota_mb`, buckets y políticas, `is_admin()`.
- [ ] Funciones: reserva, cuota, borrado, publicar, `public_geo_get`, admin.
- [ ] `public_get`/`expert_get` devuelven `kind`.
- [ ] `check-rls.ts` ampliado y **corrido de verdad** contra Supabase (nota: el checklist de RLS actual sigue sin caminarse).
- [ ] Aplicar migraciones por la integración GitHub↔Supabase (ya activa) y verificar.

### Fase 3 · Ingesta (XL)
- [ ] Workers `align` con progreso y cancelación.
- [ ] `crs.ts`, `tiff-read.ts`, `vector-read.ts`.
- [ ] Pantalla Área y capas (paso 1 y 2), validaciones y todos los mensajes del §2.4.
- [ ] Catálogo: elegir paquete, referenciar capas.
- [ ] Subida a Storage con reserva y caché en IndexedDB.
- [ ] Cambio de área con invalidación y aviso.

### Fase 4 · Reglas y Geovisor del dueño (XL)
- [ ] Editor de funciones (gráfico arrastrable + campos numéricos + validación).
- [ ] Vetos, exclusiones, clases, pesos desde `ahp.ts`.
- [ ] Mapa, capas mostrables, opacidad, mapa base, leyenda, escala.
- [ ] Consulta de punto, puntos de interés, estadísticas, «Explorar pesos» con su banner.
- [ ] Teclado y lector de pantalla (§7.9), móvil (hoja inferior).

### Fase 5 · Exportar (L)
- [ ] PNG mapa y figura, `.pgw`, GeoTIFF (idoneidad y clases), `.qml`, `.zip` con `receta.json`, CSV.
- [ ] `check-geo-tiff.ts` + `verify_tiff.py`; abrir en QGIS a mano.
- [ ] Excel (§8.5) y `check-excel-geo.ts`.

### Fase 6 · Publicar y público (L)
- [ ] Publicar, huella, «desactualizada», republicar.
- [ ] Vista pública con consulta de punto y exportación de PNG.
- [ ] Prueba de revocación y de límite de frecuencia.

### Fase 7 · Administración y catálogo (M)
- [ ] Sección `/admin` de cuotas, uso, paquetes; registro de cambios.
- [ ] `export_pack.py`, paquete `snsm-cacao-v1` publicado, licencias verificadas.

### Fase 8 · Tutorial, ejemplo y pulido (L)
- [ ] `/tutorial` (fase nueva) + tutorial solar + `/metodo` + `NewProject` con el caso guiado + coachmarks + landing.
- [ ] Revisión: 375 px, tablet, horizontal, oscuro, `prefers-reduced-motion`, texto grande, teclado y lector de pantalla, contraste, Lighthouse/CLS, tamaño de *bundle* (MapLibre y geotiff.js solo en rutas del geovisor).
- [ ] README de `plataforma/` (modelo de datos, historial, verificado/no verificado) y `CLAUDE.md` (nueva sección + excepción a "nada persiste resultados").

**Definición de hecho de cada fase:** `npm run typecheck`, `npm test`, `npm run build` en verde; lo que toque Excel pasa `test:excel` y el recálculo real; lo que toque seguridad pasa `test:rls`; y se **prueba en el navegador** el flujo dorado (ejemplo cacao de punta a punta y un caso propio pequeño), no solo los tipos.

---

## 15. Riesgos, límites y decisiones abiertas

| # | Tema | Riesgo / duda | Mitigación |
|---|---|---|---|
| 1 | Memoria y tiempo | Un ráster de 10 m sobre un área grande revienta el navegador. | Tope de píxeles, lectura por overview, mensaje de recorte, cancelar. |
| 2 | CRS raros | proj4 no trae la base EPSG completa. | Conjunto soportado explícito (Colombia + UTM) + `geotiff-geokeys-to-proj4` si el spike lo confirma + mensaje claro. |
| 3 | Precisión de reproyección por retícula | Error en bordes o zonas extremas. | Test frente a proj4; retícula más fina si hace falta. |
| 4 | Distorsión de la superposición | Cuadrilátero en Mercator vs. rejilla en 9377. | Spike; reproyectar el ráster de visualización si se nota. |
| 5 | Storage y cuota | La política puede no ver el tamaño real. | Reserva previa + `file_size_limit` + tope de capas (§4.7). |
| 6 | Plan de Supabase | Límites de almacenamiento y tamaño por archivo cambian por plan. | Verificar el plan vigente antes de fijar defaults y de subir cuotas. |
| 7 | Licencias de datos | Redistribuir capas procesadas del catálogo. | Verificar por fuente antes de publicar (§11.3). |
| 8 | Mapa base | Condiciones de uso de las teselas, límites, atribución, y que no se pueda exportar el fondo. | Elegir proveedor en el spike; atribución siempre visible; sin fondo en exportaciones. |
| 9 | Público y datos del estudiante | El resultado público podría inferirse. | Solo `pct`/`code` a la resolución de la grilla; el estudiante decide publicar; aviso explícito al activar. |
| 10 | Resultado obsoleto | Público desactualizado tras cambiar pesos. | Huella + banner «Publicación desactualizada». |
| 11 | Pendiente suavizada | `np.gradient` a 250 m subestima. | Replicar por defecto; opción avanzada; documentar; decisión del docente sobre el notebook. |
| 12 | Interpretación | Índice leído como probabilidad. | Texto fijo en la interfaz, la leyenda, las exportaciones y el tutorial. |
| 13 | Ejemplos con juicios | Confundir juicios simulados con los de un panel. | Marcas «simulado» en todas partes (regla del repo). |
| 14 | Datos de Harold en el repo | `prototipos/` contiene datos de tesis. | Fuera del alcance de este plan; ya está anotado en `CLAUDE.md` como tarea pendiente si la plataforma se abre a todo el curso. |
| 15 | Alcance | Es un desarrollo grande (fases 3 y 4 dominan). | Fases con hitos utilizables: tras la fase 4 ya hay un geovisor completo para el dueño. |

### A confirmar antes de empezar
1. Plan actual de Supabase (almacenamiento total y tamaño máx. por archivo).
2. Proveedor de mapa base y sus condiciones.
3. Si la exportación pública incluye solo PNG o también GeoTIFF (aquí: solo PNG).
4. Qué capas exactas del notebook final entran en `snsm-cacao-v1`.
5. Si se quiere corregir la pendiente del notebook (§6.2).
6. Valores iniciales de la cuota (30 MB), capas (12) y píxeles (2 M): son editables, pero conviene partir de un valor justificado.

---

## 16. Archivos a crear o modificar

**Crear**
- `supabase/migrations/20240101000010_geo.sql` (y sucesivas si se parte).
- `src/lib/geo/{membership,weights,suitability,terrain,distance,rasterize,resample,grid,codec,render,crs,tiff-read,tiff-write,vector-read}.ts`, `align.worker.ts`, `calc.worker.ts`.
- `src/components/geo/{GeoProjectTabs,AreaStep,LayersStep,RulesEditor,FunctionPlot,Geovisor,GeoMap,PointPanel,PointsTable,ClassStats,ExportMenu,PublishPanel,PublicGeoView,Coachmarks,GeoIcons}.tsx`.
- `src/components/admin/GeoStoragePanel.tsx`.
- `scripts/check-geo-*.ts`, `scripts/check-excel-geo.ts`, `scripts/geo/{golden.py,export_pack.py,verify_tiff.py}`.

**Modificar**
- `src/lib/types.ts` (`kind`, `GeoConfig`, `PublicGet`/`ExpertGet` con `kind`).
- `src/components/ProjectWorkspace.tsx` (pestañas por `kind`), `NewProject.tsx`, `MetodoClient.tsx`, `PublicView.tsx`, `ProjectList.tsx` (insignia de tipo), `src/app/tutorial/page.tsx`, `src/app/admin/*`, `src/lib/admin.ts`, `src/lib/excel.ts` (hoja de puntos), `src/app/globals.css` (tokens `--m-sig`, `--geo-*` y clases `.geo-*`).
- `package.json` (`maplibre-gl`, `geotiff`, `proj4`, `shpjs`, y opcional `fflate`), scripts `test`/`test:excel`.
- `README.md` de `plataforma/` y `CLAUDE.md` del repo.
