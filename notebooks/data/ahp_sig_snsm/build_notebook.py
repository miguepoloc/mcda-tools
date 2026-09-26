# -*- coding: utf-8 -*-
"""Genera 07_ahp_sig_cacao_snsm.ipynb a partir de celdas markdown/codigo.
Sigue el mismo espiritu que 04_Referencia_talleres/s4_metodos_python/build_notebooks.py
del repo del curso: notebook real, ejecutado end-to-end con nbclient antes
de darse por terminado, no solo inspeccionado visualmente."""

import nbformat as nbf
from pathlib import Path

nb = nbf.v4.new_notebook()
cells = []


def md(text):
    cells.append(nbf.v4.new_markdown_cell(text))


def code(text):
    cells.append(nbf.v4.new_code_cell(text))


md(r"""# Mapa de idoneidad cacaotera — estribaciones de la Sierra Nevada de Santa Marta

**AHP + SIG, 100% Python.** Notebook 07 de este repositorio, para la Sesión 5
("AHP + SIG: extensión espacial") del curso de Toma de Decisiones Multicriterio,
Universidad del Magdalena. Resuelve de punta a punta el mismo caso que S1 (diapositiva
14, mención breve) prometió resolver: un mapa de aptitud de tierras para cacao en la
Sierra Nevada de Santa Marta, combinando AHP (pesos de criterios) + SIG (capas
espaciales reales) + álgebra de mapas.

**Por qué existe este notebook (23 sep 2026, grill-me):** la sesión original preveía
QGIS para todo el flujo geoespacial. Revisando qué usa realmente QGIS en el curso de
Teledetección del mismo docente (georreferenciar composites sin coordenadas, y el
layout cartográfico final) se confirmó que ninguna de esas dos razones aplica aquí
—todas las fuentes de datos ya vienen georreferenciadas—, así que **todo el análisis
(descargar, recortar, ponderar, combinar) se hace en Python**; QGIS queda reservado
solo para quien quiera un layout cartográfico final más elaborado sobre el GeoTIFF que
este notebook produce.

**Datos 100% reales**, verificados por fuente (ver cada sección). **Área de estudio**:
no son las "4 zonas" tratadas como alternativas discretas (eso solo tenía sentido en el
caso IoT/Palmor de S1-S4, un problema distinto); aquí se evalúa **todo el territorio**
de forma continua — Bonda, Guachaca, San Pedro y Palmor son puntos de referencia
conocidos dentro de esa superficie, no una lista cerrada de alternativas.

**Doble propósito, con el mismo rigor en ambos** (decisión del docente, 23 sep 2026):
este notebook es material de curso **y**, a la vez, un primer insumo real para el
análisis geoespacial doctoral del docente (`PLAN_INVESTIGACION.md`, Fase D/E) — "un
primer insumo, no un sustituto" de los sensores de campo reales de la Fase 1 de esa
propuesta.""")

md(r"""## 0. Dependencias

```
pip install -r requirements.txt
```

Necesita, además de lo que ya usan los notebooks 00-06 (`numpy`, `pandas`,
`matplotlib`): `rasterio`, `geopandas`, `shapely`, `pyproj`, `pystac-client`,
`planetary-computer`. Todas las descargas son de fuentes públicas, ninguna necesita
API key ni autenticación.""")

code(r"""import warnings
warnings.filterwarnings('ignore')

import os
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.lines import Line2D
import rasterio
from rasterio.warp import calculate_default_transform, reproject, Resampling
from rasterio.mask import mask
from rasterio.merge import merge
from rasterio.transform import rowcol
from pyproj import Transformer
import geopandas as gpd
from shapely.geometry import Point

DATA_DIR = Path('data/ahp_sig_snsm')  # el notebook vive en la raiz del repo, junto a 00_..06_*.ipynb
CACHE_DIR = DATA_DIR / 'cache'
CACHE_DIR.mkdir(parents=True, exist_ok=True)
import sys
sys.path.insert(0, str(DATA_DIR))
from visualizacion import mapa_continuo, mapa_clasificado

DST_CRS = 'EPSG:9377'   # MAGNA-SIRGAS / Origen-Nacional, metros -- CRS oficial de Colombia
WORK_RES_M = 250        # resolucion de trabajo comun (coincide con la resolucion nativa de SoilGrids)
AOI_BOUNDS_WGS84 = (-74.24, 10.19, -72.85, 11.49)  # se calcula en la seccion 1, mostrado aqui para referencia

print('Directorio de datos:', DATA_DIR.resolve())""")

md(r"""## 1. Área de estudio: el límite real de la Sierra Nevada + banda de elevación cacaotera

**No hay un límite oficial de "estribaciones"** (no es una división administrativa), así
que se construye en 2 pasos, cada uno con una fuente real:

1. **Límite del macizo**: polígono oficial "Parque Nacional Natural Sierra Nevada de
   Santa Marta" del RUNAP (Registro Único Nacional de Áreas Protegidas, Parques
   Nacionales Naturales de Colombia), descargado directo del bucket público
   (`storage.googleapis.com/pnn_geodatabase/runap/latest.zip`, MAGNA-SIRGAS/EPSG:4686).
   Verificación real hecha al construir este notebook: **ninguna de las 4 zonas
   conocidas del caso (Bonda, Guachaca, San Pedro, Palmor) cae dentro de este polígono**
   — todas están 4-22 km afuera, confirmando que el PNN solo cubre el núcleo protegido
   de alta montaña, no las estribaciones agrícolas.
2. **Buffer de 25 km** alrededor del PNN (elegido para que las 4 zonas conocidas queden
   cubiertas, con margen), reproyectado a un CRS métrico real (EPSG:9377) antes de
   bufferear en metros, no en grados.

La banda de elevación cacaotera (paso 2 de la sección 2) es la que realmente define
"estribaciones" dentro de esta área más amplia.""")

code(r"""runap_zip = CACHE_DIR.parent / 'runap_extracted' / 'runap.shp'
if not runap_zip.exists():
    import urllib.request, zipfile
    zpath = CACHE_DIR / 'runap.zip'
    if not zpath.exists():
        print('Descargando RUNAP (Parques Nacionales Naturales de Colombia)...')
        urllib.request.urlretrieve('https://storage.googleapis.com/pnn_geodatabase/runap/latest.zip', zpath)
    with zipfile.ZipFile(zpath) as z:
        z.extractall(CACHE_DIR.parent / 'runap_extracted')

gdf = gpd.read_file(runap_zip)
pnn = gdf[gdf['ap_nombre'].astype(str).str.contains('Sierra Nevada de Santa Marta', case=False, na=False)]
print('Área protegida encontrada:', pnn.iloc[0]['ap_nombre'], '|', pnn.iloc[0]['ap_categor'],
      '|', f"{pnn.iloc[0]['area_ha_to']:,.0f} ha")

pnn_m = pnn.to_crs(DST_CRS)
BUFFER_KM = 25
aoi_geom_m = pnn_m.buffer(BUFFER_KM * 1000)
aoi_gdf = gpd.GeoDataFrame(geometry=aoi_geom_m, crs=DST_CRS).to_crs(4326)
aoi_path = CACHE_DIR / 'aoi_pnn_buffer25km.geojson'
aoi_gdf.to_file(aoi_path, driver='GeoJSON')

AOI_BOUNDS_WGS84 = tuple(aoi_gdf.total_bounds)
print(f'AOI (PNN + {BUFFER_KM} km de buffer): área = {aoi_geom_m.area.iloc[0]/1e6:,.0f} km²')
print('Bounds WGS84:', AOI_BOUNDS_WGS84)

# Verificación: las 4 zonas conocidas quedan dentro del AOI
ZONAS_CONOCIDAS = {
    'Bonda': (11.2343429, -74.1247860), 'Guachaca': (11.2502349, -73.8284338),
    'San Pedro': (10.9069506, -74.0459379), 'Palmor': (10.7702774, -74.0241478),
}
aoi_geom_wgs84 = aoi_gdf.geometry.iloc[0]
for nombre, (lat, lon) in ZONAS_CONOCIDAS.items():
    print(f'  {nombre}: dentro del AOI = {aoi_geom_wgs84.contains(Point(lon, lat))}')""")

md(r"""## 2. Elevación: Copernicus DEM (30 m) y la banda cacaotera real (FEDECACAO 2015)

**Fuente**: Copernicus DEM GLO-30 (ESA/Sinergise), 30 m, acceso público sin
autenticación vía AWS Open Data (`copernicus-dem-30m.s3.amazonaws.com`). Farr, T.G. et
al. (2007) documenta la generación original de este tipo de producto satelital de
elevación (*Reviews of Geophysics*, 45, RG2004, DOI `10.1029/2005RG000183`).

**El umbral de elevación real**: FEDECACAO (2015), *Guía técnica para el cultivo del
cacao* — fuente institucional oficial colombiana, no un dato genérico de internet —
dice textualmente que el clima propicio para cacao en Colombia "comprende la franja de
tierras ubicadas **hasta 1.200 metros sobre el nivel del mar**". Ese es el corte real
usado aquí para definir la banda cacaotera dentro del AOI del macizo.""")

code(r"""dem_clipped_path = CACHE_DIR / 'dem_clipped.tif'
if not dem_clipped_path.exists():
    print('Descargando tiles del DEM Copernicus (6 tiles, ~200 MB)...')
    import urllib.request
    dem_tiles_dir = DATA_DIR / 'dem_tiles'
    dem_tiles_dir.mkdir(exist_ok=True)
    lon_min, lat_min, lon_max, lat_max = AOI_BOUNDS_WGS84
    lats = range(int(np.floor(lat_min)), int(np.ceil(lat_max)))
    lons = range(int(np.floor(-lon_max)), int(np.ceil(-lon_min)) + 1)
    tile_paths = []
    for lat in lats:
        for lon in lons:
            fname = f'Copernicus_DSM_COG_10_N{lat:02d}_00_W{lon:03d}_00_DEM'
            fpath = dem_tiles_dir / f'{fname}.tif'
            if not fpath.exists():
                url = f'https://copernicus-dem-30m.s3.amazonaws.com/{fname}/{fname}.tif'
                try:
                    urllib.request.urlretrieve(url, fpath)
                except Exception as e:
                    print(f'  tile {fname} no disponible ({e}), se omite')
                    continue
            tile_paths.append(fpath)

    srcs = [rasterio.open(t) for t in tile_paths]
    mosaic, mosaic_transform = merge(srcs)
    meta = srcs[0].meta.copy()
    meta.update({'height': mosaic.shape[1], 'width': mosaic.shape[2], 'transform': mosaic_transform})
    with rasterio.open(CACHE_DIR / 'dem_mosaic.tif', 'w', **meta) as dst:
        dst.write(mosaic)
    for s in srcs: s.close()

    aoi_gdf_native = gpd.read_file(CACHE_DIR / 'aoi_pnn_buffer25km.geojson')
    with rasterio.open(CACHE_DIR / 'dem_mosaic.tif') as src:
        aoi_r = aoi_gdf_native.to_crs(src.crs)
        out_img, out_transform = mask(src, aoi_r.geometry, crop=True, nodata=-9999)
        out_meta = src.meta.copy()
        out_meta.update({'height': out_img.shape[1], 'width': out_img.shape[2],
                          'transform': out_transform, 'nodata': -9999})
    with rasterio.open(dem_clipped_path, 'w', **out_meta) as dst:
        dst.write(out_img)
    (CACHE_DIR / 'dem_mosaic.tif').unlink(missing_ok=True)

with rasterio.open(dem_clipped_path) as src:
    dem_native = src.read(1)
    dem_native = np.where(dem_native == src.nodata, np.nan, dem_native)
    print('DEM nativo:', dem_native.shape, 'resolución', src.res)
    print(f'Elevación: {np.nanmin(dem_native):.0f} - {np.nanmax(dem_native):.0f} msnm '
          f'(el Pico Cristóbal Colón real está en ~5,700 msnm, buena señal de que el DEM es correcto)')""")

code(r"""# Reproyectar el DEM a la grilla de trabajo comun (250 m, EPSG:9377) -- esta es la
# grilla de referencia a la que se remuestrean TODAS las demas capas mas adelante
dem_250_path = CACHE_DIR / 'dem_250m.tif'
with rasterio.open(dem_clipped_path) as src:
    ref_transform, ref_w, ref_h = calculate_default_transform(
        src.crs, DST_CRS, src.width, src.height, *src.bounds, resolution=WORK_RES_M)
    dem_250 = np.empty((ref_h, ref_w), dtype=np.float32)
    reproject(source=rasterio.band(src, 1), destination=dem_250,
              src_transform=src.transform, src_crs=src.crs,
              dst_transform=ref_transform, dst_crs=DST_CRS,
              src_nodata=src.nodata, dst_nodata=np.nan, resampling=Resampling.average)
    ref_meta = src.meta.copy()
ref_meta.update({'height': ref_h, 'width': ref_w, 'transform': ref_transform, 'crs': DST_CRS, 'nodata': np.nan})
with rasterio.open(dem_250_path, 'w', **ref_meta) as dst:
    dst.write(dem_250, 1)

REF_TRANSFORM, REF_CRS, REF_SHAPE = ref_transform, DST_CRS, (ref_h, ref_w)

def reproject_to_ref(src_array, src_transform, src_crs, resampling=Resampling.bilinear):
    dst = np.full(REF_SHAPE, np.nan, dtype=np.float32)
    reproject(source=src_array, destination=dst,
              src_transform=src_transform, src_crs=src_crs, src_nodata=np.nan,
              dst_transform=REF_TRANSFORM, dst_crs=REF_CRS, dst_nodata=np.nan,
              resampling=resampling)
    return dst

banda_cacaotera = np.where(np.isnan(dem_250), np.nan, (dem_250 <= 1200).astype(float))
pct = np.nanmean(banda_cacaotera) * 100
print(f'Grilla de trabajo: {REF_SHAPE}, resolución {WORK_RES_M} m')
print(f'% del área (PNN + buffer) dentro de la banda cacaotera (≤1200 msnm, FEDECACAO 2015): {pct:.1f}%')""")

md(r"""**El mapa de elevación**, con basemap satelital, flecha de norte y barra de escala
—mismo estilo visual que las figuras del artículo de referencia (Polo-Castañeda et al.
2021, *IJASEIT*)—, y la banda cacaotera clasificada que se deriva de él.""")

code(r"""mapa_continuo(dem_250, REF_TRANSFORM, REF_CRS, 'Elevación — Copernicus DEM GLO-30 (msnm)',
              'terrain', 'msnm', out_path=str(CACHE_DIR.parent / 'mapa_elevacion.png'))""")

code(r"""mapa_clasificado(banda_cacaotera, REF_TRANSFORM, REF_CRS,
                  'Banda cacaotera por elevación (≤1200 msnm, FEDECACAO 2015)',
                  umbrales=(0.5, 0.5), etiquetas=('Fuera de rango', '', 'Dentro del rango (≤1200 msnm)'),
                  out_path=str(CACHE_DIR.parent / 'mapa_banda_cacaotera.png'))""")

md(r"""**Pendiente del terreno** (`np.gradient` sobre el DEM, en grados) y su
reclasificación en accesibilidad — la misma operación que la mini-demo en vivo de S5,
pero aquí sobre el DEM real completo, no una ilustración sintética.""")

code(r"""# Pendiente real en grados: gradiente numpy con el paso real de la grilla (WORK_RES_M metros)
gy, gx = np.gradient(dem_250, WORK_RES_M, WORK_RES_M)
pendiente_grados = np.degrees(np.arctan(np.sqrt(gx**2 + gy**2)))
pendiente_grados = np.where(np.isnan(dem_250), np.nan, pendiente_grados)
np.save(CACHE_DIR / 'pendiente_grados_250m.npy', pendiente_grados)

print(f'Pendiente: {np.nanmin(pendiente_grados):.1f}° - {np.nanmax(pendiente_grados):.1f}°, '
      f'media {np.nanmean(pendiente_grados):.1f}°')

mapa_continuo(pendiente_grados, REF_TRANSFORM, REF_CRS, 'Pendiente del terreno (grados)',
              'YlOrRd', 'grados', out_path=str(CACHE_DIR.parent / 'mapa_pendiente.png'))""")

code(r"""# Accesibilidad reclasificada: alta (<10°), media (10-25°), baja (>25°) -- 5º criterio
# logístico (instalación/mantenimiento de sensores), no entra en la idoneidad cacaotera
# de la sección 8, es un criterio aparte para el sub-problema de despliegue de sensores.
accesibilidad_idx = np.select([pendiente_grados < 10, pendiente_grados < 25], [1.0, 0.5], default=0.0)
accesibilidad_idx = np.where(np.isnan(pendiente_grados), np.nan, accesibilidad_idx)

mapa_clasificado(accesibilidad_idx, REF_TRANSFORM, REF_CRS,
                  'Accesibilidad para despliegue de sensores (por pendiente)',
                  umbrales=(0.25, 0.75), etiquetas=('Baja (>25°)', 'Media (10-25°)', 'Alta (<10°)'),
                  out_path=str(CACHE_DIR.parent / 'mapa_accesibilidad.png'))""")

md(r"""## 3. Clima: temperatura y precipitación (WorldClim 2, Fick & Hijmans 2017)

**Fuente**: WorldClim 2.1, variables bioclimáticas BIO1 (temperatura media anual) y
BIO12 (precipitación anual), resolución 2.5 arc-min (~4.6 km). Fick, S.E. & Hijmans,
R.J. (2017), *International Journal of Climatology*, 37(15), 4302–4315, DOI
`10.1002/joc.5086`.

**Nota de resolución (decisión metodológica explícita):** WorldClim también existe a
30 arc-seg (~1 km), pero acceder a una ventana recortada de ese archivo (10+ GB por
variable) por streaming remoto tardó **>5 minutos** en las pruebas para este notebook —
inviable para una demo en vivo. La versión 2.5 arc-min (~4.6 km) es adecuada para un
análisis a escala regional como este (el macizo de la Sierra Nevada mide ~150 km), y
sigue siendo válida cuando se remuestrea a la grilla de trabajo de 250 m junto con las
demás capas (ninguna gana precisión real que la fuente no tenía).

**Lectura vía streaming (`/vsizip//vsicurl/`)**: GDAL puede leer solo la ventana
recortada de un archivo remoto sin descargar el ZIP completo (443 MB), siempre que el
servidor soporte HTTP Range requests (verificado: sí lo soporta).""")

code(r"""def leer_worldclim_bioclim(var_num, bounds_wgs84):
    path = f'/vsizip//vsicurl/https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_2.5m_bio.zip/wc2.1_2.5m_bio_{var_num}.tif'
    with rasterio.open(path) as src:
        window = src.window(*bounds_wgs84)
        data = src.read(1, window=window)
        transform = src.window_transform(window)
        nodata = src.nodata
        crs = src.crs
    data = np.where(data == nodata, np.nan, data)
    return data, transform, crs

temp_npy = CACHE_DIR / 'bio1_temp_anual.npy'
if temp_npy.exists():
    temp_raw = np.load(temp_npy)
    import pickle
    with open(CACHE_DIR / 'bio1_temp_anual_meta.pkl', 'rb') as f:
        temp_meta = pickle.load(f)
else:
    print('Descargando WorldClim BIO1 (temperatura anual) por streaming...')
    temp_raw, temp_transform, temp_crs = leer_worldclim_bioclim(1, AOI_BOUNDS_WGS84)
    np.save(temp_npy, temp_raw)
    temp_meta = {'transform': temp_transform, 'crs': temp_crs}

precip_npy = CACHE_DIR / 'bio12_precip_anual.npy'
if precip_npy.exists():
    precip_raw = np.load(precip_npy)
    import pickle
    with open(CACHE_DIR / 'bio12_precip_anual_meta.pkl', 'rb') as f:
        precip_meta = pickle.load(f)
else:
    print('Descargando WorldClim BIO12 (precipitación anual) por streaming...')
    precip_raw, precip_transform, precip_crs = leer_worldclim_bioclim(12, AOI_BOUNDS_WGS84)
    np.save(precip_npy, precip_raw)
    precip_meta = {'transform': precip_transform, 'crs': precip_crs}

temp_250 = reproject_to_ref(temp_raw, temp_meta['transform'], temp_meta['crs'])
precip_250 = reproject_to_ref(precip_raw, precip_meta['transform'], precip_meta['crs'])
np.save(CACHE_DIR / 'bio1_temp_anual_250m.npy', temp_250)
np.save(CACHE_DIR / 'bio12_precip_anual_250m.npy', precip_250)

print(f'Temperatura media anual: {np.nanmin(temp_250):.1f} - {np.nanmax(temp_250):.1f} °C')
print(f'Precipitación anual: {np.nanmin(precip_250):.0f} - {np.nanmax(precip_250):.0f} mm')""")

code(r"""mapa_continuo(temp_250, REF_TRANSFORM, REF_CRS, 'Temperatura media anual — WorldClim 2.1 (°C)',
              'coolwarm', '°C', out_path=str(CACHE_DIR.parent / 'mapa_temperatura.png'))
mapa_continuo(precip_250, REF_TRANSFORM, REF_CRS, 'Precipitación anual — WorldClim 2.1 (mm)',
              'Blues', 'mm/año', out_path=str(CACHE_DIR.parent / 'mapa_precipitacion.png'))""")

md(r"""## 4. Suelo: pH (SoilGrids 2.0, Poggio et al. 2021)

**Fuente**: SoilGrids 2.0 (ISRIC), pH en agua, 0-5 cm, 250 m, modelado por machine
learning a partir de ~240,000 perfiles de suelo reales. Poggio, L. et al. (2021), *SOIL*,
7, 217–240, DOI `10.5194/soil-7-217-2021`. Servido como COG (Cloud-Optimized GeoTIFF)
en proyección Interrupted Goode Homolosine — se lee la ventana del AOI por streaming,
igual que WorldClim.

**Validación independiente conocida** (no del propio SoilGrids, un chequeo externo):
Chen, S. et al. (2019), *Science of the Total Environment*, 655, 273–283, DOI
`10.1016/j.scitotenv.2018.11.230` — evaluó SoilGrids250m de pH contra 4,700 perfiles
reales en China: RMSE = 1.02 unidades, CCC = 0.67. Se usa como referencia del orden de
magnitud del error esperado, no como cifra exacta para la Sierra Nevada.""")

code(r"""ph_npy = CACHE_DIR / 'phh2o_0_5cm.npy'
if ph_npy.exists():
    ph_raw = np.load(ph_npy)
    import pickle
    with open(CACHE_DIR / 'phh2o_meta.pkl', 'rb') as f:
        ph_meta = pickle.load(f)
else:
    print('Descargando SoilGrids pH (0-5cm) por streaming...')
    igh_proj4 = '+proj=igh +lat_0=0 +lon_0=0 +datum=WGS84 +units=m +no_defs'
    tr = Transformer.from_crs('EPSG:4326', igh_proj4, always_xy=True)
    lon_min, lat_min, lon_max, lat_max = AOI_BOUNDS_WGS84
    x_min, y_min = tr.transform(lon_min, lat_min)
    x_max, y_max = tr.transform(lon_max, lat_max)
    path = '/vsicurl/https://files.isric.org/soilgrids/latest/data/phh2o/phh2o_0-5cm_mean.vrt'
    with rasterio.open(path) as src:
        window = src.window(x_min, y_min, x_max, y_max)
        data = src.read(1, window=window)
        ph_transform = src.window_transform(window)
        ph_crs = src.crs
        nodata = src.nodata
    ph_raw = np.where(data == nodata, np.nan, data).astype(np.float32) / 10.0  # SoilGrids: pH*10
    np.save(ph_npy, ph_raw)
    ph_meta = {'transform': ph_transform, 'crs': ph_crs}

ph_250 = reproject_to_ref(ph_raw, ph_meta['transform'], ph_meta['crs'])
np.save(CACHE_DIR / 'ph_250m.npy', ph_250)
print(f'pH del suelo (0-5cm): {np.nanmin(ph_250):.2f} - {np.nanmax(ph_250):.2f}')""")

code(r"""mapa_continuo(ph_250, REF_TRANSFORM, REF_CRS, 'pH del suelo, 0-5cm — SoilGrids 2.0',
              'PiYG', 'pH', out_path=str(CACHE_DIR.parent / 'mapa_ph.png'))""")

md(r"""## 5. Humedad bajo el dosel (proxy): NDVI real (Sentinel-2) + precipitación

**Sin fuente satelital directa** (documentado así desde el planteamiento original de S5,
no una limitación nueva). Proxy: NDVI de Sentinel-2 (densidad de dosel — más dosel,
más humedad retenida bajo él) combinado con la precipitación ya cargada.

**Fuente NDVI**: Sentinel-2 L2A, vía Microsoft Planetary Computer (catálogo STAC
público, `planetarycomputer.microsoft.com`, sin necesidad de cuenta ni API key para
lectura). Se buscan las escenas más recientes con menos de 15% de nubes (dic 2024-mar
2025, temporada seca, mejor visibilidad) que cubren el área — salieron 6 tiles, todas
con <7% de nubosidad real. Se descarta cada píxel de nube/sombra con la banda SCL
(Scene Classification Layer) antes de calcular NDVI = (NIR-Red)/(NIR+Red). Lectura
decimada a ~100 m (GDAL sirve esto desde los overviews internos del COG, no arrastra
cada píxel nativo de 10 m) — de sobra para la grilla de trabajo de 250 m.
NDVI original: Rouse, J.W. et al. (1974), *NASA SP-351*, 309-317.""")

code(r"""ndvi_250_npy = CACHE_DIR / 'ndvi_250m.npy'
if ndvi_250_npy.exists():
    ndvi_250 = np.load(ndvi_250_npy)
else:
    import pystac_client, planetary_computer
    from rasterio.enums import Resampling as ResEnum

    print('Buscando escenas Sentinel-2 sin nubes (Microsoft Planetary Computer)...')
    catalog = pystac_client.Client.open('https://planetarycomputer.microsoft.com/api/stac/v1',
                                         modifier=planetary_computer.sign_inplace)
    search = catalog.search(collections=['sentinel-2-l2a'], bbox=list(AOI_BOUNDS_WGS84),
                             datetime='2024-12-01/2025-03-31', query={'eo:cloud_cover': {'lt': 15}}, limit=100)
    items = list(search.items())
    best = {}
    for it in items:
        tid = it.properties.get('s2:mgrs_tile')
        cc = it.properties.get('eo:cloud_cover')
        if tid not in best or cc < best[tid].properties.get('eo:cloud_cover'):
            best[tid] = it
    print(f'  {len(best)} tiles MGRS cubren el área, todas <15% nubes')

    ndvi_tile_paths = []
    for tid, item in best.items():
        with rasterio.open(item.assets['B04'].href) as red_src, \
             rasterio.open(item.assets['B08'].href) as nir_src, \
             rasterio.open(item.assets['SCL'].href) as scl_src:
            tr = Transformer.from_crs('EPSG:4326', red_src.crs, always_xy=True)
            x0, y0 = tr.transform(AOI_BOUNDS_WGS84[0], AOI_BOUNDS_WGS84[1])
            x1, y1 = tr.transform(AOI_BOUNDS_WGS84[2], AOI_BOUNDS_WGS84[3])
            xmin, xmax = sorted([x0, x1]); ymin, ymax = sorted([y0, y1])
            win = red_src.window(xmin, ymin, xmax, ymax)
            win = win.intersection(rasterio.windows.Window(0, 0, red_src.width, red_src.height))
            if win.width <= 0 or win.height <= 0:
                continue
            native_res = red_src.res[0]
            target_res = 100
            out_h = max(1, int(win.height * native_res / target_res))
            out_w = max(1, int(win.width * native_res / target_res))
            red = red_src.read(1, window=win, out_shape=(out_h, out_w), resampling=ResEnum.average).astype(np.float32)
            nir = nir_src.read(1, window=win, out_shape=(out_h, out_w), resampling=ResEnum.average).astype(np.float32)
            scl = scl_src.read(1, window=scl_src.window(xmin, ymin, xmax, ymax), out_shape=(out_h, out_w),
                                resampling=ResEnum.nearest).astype(np.float32)
            base_t = red_src.window_transform(win)
            tile_transform = base_t * base_t.scale(win.width / out_w, win.height / out_h)
            tile_crs = red_src.crs
        valid = np.isin(scl, [4, 5, 6, 7])
        denom = nir + red
        with np.errstate(invalid='ignore', divide='ignore'):
            ndvi = np.where(denom != 0, (nir - red) / denom, np.nan)
        ndvi = np.where(valid, ndvi, np.nan).astype(np.float32)
        tpath = CACHE_DIR / f'ndvi_{tid}.tif'
        meta = {'driver': 'GTiff', 'height': ndvi.shape[0], 'width': ndvi.shape[1], 'count': 1,
                'dtype': 'float32', 'crs': tile_crs, 'transform': tile_transform, 'nodata': np.nan}
        with rasterio.open(tpath, 'w', **meta) as dst:
            dst.write(ndvi, 1)
        ndvi_tile_paths.append(tpath)

    srcs = [rasterio.open(t) for t in ndvi_tile_paths]
    ndvi_mosaic, ndvi_mosaic_t = merge(srcs, nodata=np.nan)
    ndvi_mosaic_crs = srcs[0].crs
    for s in srcs: s.close()
    ndvi_250 = reproject_to_ref(ndvi_mosaic[0], ndvi_mosaic_t, ndvi_mosaic_crs)
    np.save(ndvi_250_npy, ndvi_250)

print(f'NDVI: {np.nanmin(ndvi_250):.2f} - {np.nanmax(ndvi_250):.2f} '
      f'(negativo/bajo = roca o nieve en los picos, alto = dosel denso en las estribaciones)')""")

code(r"""mapa_continuo(ndvi_250, REF_TRANSFORM, REF_CRS, 'NDVI — Sentinel-2, dic 2024-mar 2025',
              'RdYlGn', 'NDVI', out_path=str(CACHE_DIR.parent / 'mapa_ndvi.png'), vmin=-0.3, vmax=0.8)""")

md(r"""## 6. Conductividad eléctrica del suelo: por qué NO está en este mapa

Documentado desde el planteamiento original de S5: **no existe una fuente satelital o
modelada abierta confiable** para conductividad eléctrica del suelo a esta escala (a
diferencia de temperatura, precipitación o pH, que sí tienen productos globales
validados). SoilGrids no la modela. Queda **pendiente de medición de campo real**
— coherente con la Fase 1 de la propuesta doctoral (sensores IoT midiendo esto
directamente en el terreno).

**Peso redistribuido**: el peso AHP de Conductividad Eléctrica (11.1%, ver
`sesion-05/README.md`, matriz de comparación) se redistribuye proporcionalmente entre
los 3 criterios con datos reales — igual que se haría con cualquier criterio sin dato
disponible en un análisis real, documentado explícitamente en vez de inventar un proxy
sin respaldo:

| Criterio | Peso AHP original | Peso reponderado (sin Conductividad) |
|---|---|---|
| Humedad bajo el dosel | 44.4% | **50.0%** |
| Temperatura | 22.2% | **25.0%** |
| pH del suelo | 22.2% | **25.0%** |
| Conductividad eléctrica | 11.1% | excluida (sin dato real) |""")

md(r"""## 7. Funciones de idoneidad agronómica (FEDECACAO 2015)

No se usa normalización lineal min-max arbitraria. Cada criterio se mapea a una función
de membresía trapezoidal (0 = no apto, 1 = óptimo) construida con los umbrales
agronómicos **reales** de la guía técnica oficial de FEDECACAO (2015):

- **Temperatura**: óptimo 22-30 °C, límites duros 15-38 °C (fuera de eso "afecta el
  comportamiento fisiológico", según el propio manual).
- **Precipitación**: óptimo 1.500-2.500 mm/año ("períodos secos mayores de 2 meses son
  altamente nocivos"); por debajo de 1.500 mm se necesita riego (penaliza, no
  descarta). El techo superior (4.000 mm) es una extensión razonada: exceso de
  humedad favorece hongos, coherente con que el objetivo real de la propuesta doctoral
  es predecir riesgo de Moniliasis.
- **pH**: óptimo 5,5-6,5 ("moderadamente ácidos"), tolera "acidez fuerte a moderada de
  5 a 6".
- **Humedad bajo el dosel (proxy)**: 50% NDVI normalizado + 50% idoneidad de
  precipitación.""")

code(r"""from membership import idoneidad_temperatura, idoneidad_precipitacion, idoneidad_ph, idoneidad_humedad_proxy

s_temp = idoneidad_temperatura(temp_250)
s_precip = idoneidad_precipitacion(precip_250)
s_ph = idoneidad_ph(ph_250)
s_humedad = idoneidad_humedad_proxy(ndvi_250, s_precip)

for nombre, arr in [('Temperatura', s_temp), ('Precipitación', s_precip), ('pH', s_ph), ('Humedad (proxy)', s_humedad)]:
    print(f'{nombre}: idoneidad media = {np.nanmean(arr):.2f} (rango {np.nanmin(arr):.2f}-{np.nanmax(arr):.2f})')""")

md(r"""**Las 4 capas de idoneidad, clasificadas** — mismo estilo que las Fig. 6-9 del
artículo de referencia (una figura por criterio, clasificado en apto/moderadamente
apto/no apto), antes de combinarlas en la sección 8.""")

code(r"""mapa_clasificado(s_temp, REF_TRANSFORM, REF_CRS, 'Idoneidad por Temperatura (22-30°C óptimo)',
                  out_path=str(CACHE_DIR.parent / 'mapa_idoneidad_temperatura.png'))""")

code(r"""mapa_clasificado(s_precip, REF_TRANSFORM, REF_CRS, 'Idoneidad por Precipitación (1500-2500 mm/año óptimo)',
                  out_path=str(CACHE_DIR.parent / 'mapa_idoneidad_precipitacion.png'))""")

code(r"""mapa_clasificado(s_ph, REF_TRANSFORM, REF_CRS, 'Idoneidad por pH del suelo (5.5-6.5 óptimo)',
                  out_path=str(CACHE_DIR.parent / 'mapa_idoneidad_ph.png'))""")

code(r"""mapa_clasificado(s_humedad, REF_TRANSFORM, REF_CRS, 'Idoneidad por Humedad bajo el dosel (proxy NDVI+precipitación)',
                  out_path=str(CACHE_DIR.parent / 'mapa_idoneidad_humedad.png'))""")

md(r"""## 8. Álgebra de mapas: la combinación ponderada final

`Idoneidad(x,y) = Σ w_j · Capa_j(x,y)` — Malczewski, J. (2006), *International Journal
of Geographical Information Science*, 20(7), 703–726, DOI `10.1080/13658810600661508`.
Exactamente la misma fórmula de la diapositiva 5 de S5, aplicada aquí a capas reales en
vez de al ejemplo de juguete.""")

code(r"""W_HUMEDAD, W_TEMP, W_PH = 0.50, 0.25, 0.25  # reponderados, ver sección 6

idoneidad_final = W_HUMEDAD * s_humedad + W_TEMP * s_temp + W_PH * s_ph
np.save(CACHE_DIR / 'idoneidad_final_250m.npy', idoneidad_final)

with open(CACHE_DIR / 'ref_grid.pkl', 'wb') as f:
    import pickle
    pickle.dump({'transform': REF_TRANSFORM, 'crs': REF_CRS, 'shape': REF_SHAPE}, f)

# guardar como GeoTIFF real, para abrir en QGIS/cualquier SIG (el "armar bonito" que
# queda fuera de este notebook)
out_meta = ref_meta.copy()
with rasterio.open(CACHE_DIR / 'idoneidad_cacaotera_final.tif', 'w', **out_meta) as dst:
    dst.write(idoneidad_final.astype(np.float32), 1)

print(f'IDONEIDAD FINAL: media = {np.nanmean(idoneidad_final):.3f}, '
      f'rango = {np.nanmin(idoneidad_final):.3f} - {np.nanmax(idoneidad_final):.3f}')
print(f'Cobertura de datos válidos: {np.mean(~np.isnan(idoneidad_final))*100:.1f}% del área')
print('GeoTIFF exportado: cache/idoneidad_cacaotera_final.tif (listo para abrir en QGIS)')""")

md(r"""## 9. El mapa final, y las 4 zonas conocidas como puntos de referencia

Las 4 zonas de S1/S5 (Bonda, Guachaca, San Pedro, Palmor) **no son las alternativas de
este análisis** (eso ya no aplica: es una superficie continua, no un conjunto cerrado),
se muestran aquí solo como puntos de referencia reales sobre el resultado.""")

code(r"""from visualizacion import _extent, _norte, _escala, _basemap, VERDE, NARANJA, ROJO
from matplotlib.colors import BoundaryNorm
from matplotlib.lines import Line2D

UMBRAL_BAJO, UMBRAL_ALTO = 0.5, 0.7
clases_final = np.select([idoneidad_final < UMBRAL_BAJO, idoneidad_final < UMBRAL_ALTO],
                          [0, 1], default=2).astype(float)
clases_final = np.where(np.isnan(idoneidad_final), np.nan, clases_final)
cmap_clases = LinearSegmentedColormap.from_list('clasificado', [ROJO, NARANJA, VERDE], N=3)
norm_clases = BoundaryNorm([-0.5, 0.5, 1.5, 2.5], cmap_clases.N)

fig, ax = plt.subplots(figsize=(11, 10))
extent = _extent(REF_TRANSFORM, idoneidad_final.shape)
ax.imshow(clases_final, cmap=cmap_clases, norm=norm_clases, extent=extent, alpha=0.78, zorder=2)
_basemap(ax, REF_CRS)
_norte(ax)
_escala(ax, REF_CRS)

tr = Transformer.from_crs('EPSG:4326', REF_CRS, always_xy=True)
resultados_zonas = {}
for nombre, (lat, lon) in ZONAS_CONOCIDAS.items():
    x, y = tr.transform(lon, lat)
    row, col = rowcol(REF_TRANSFORM, x, y)
    val = idoneidad_final[row, col]
    resultados_zonas[nombre] = val
    ax.scatter([x], [y], s=160, c='white', edgecolor='black', linewidth=1.8, zorder=6)
    ax.annotate(f'{nombre}\n{val:.2f}', (x, y), textcoords='offset points', xytext=(10, 8),
                fontsize=10, fontweight='bold', zorder=7,
                bbox=dict(boxstyle='round,pad=0.3', facecolor='white', edgecolor='#7A7F91', alpha=0.9))

handles = [Line2D([0], [0], marker='s', color='w', markerfacecolor=c, markersize=14, label=l)
           for c, l in zip([ROJO, NARANJA, VERDE], ['No apta', 'Moderadamente apta', 'Apta'])]
ax.legend(handles=handles, loc='lower right', title='Idoneidad cacaotera', framealpha=0.9)
ax.set_title('Idoneidad cacaotera — estribaciones de la Sierra Nevada de Santa Marta\n'
              '(WorldClim + SoilGrids + Sentinel-2 + Copernicus DEM, 100% datos reales)', fontsize=12)
ax.set_xticks([]); ax.set_yticks([])
plt.tight_layout()
plt.savefig(CACHE_DIR.parent / 'mapa_idoneidad_cacaotera_snsm.png', dpi=150, facecolor='white')
plt.show()
plt.close(fig)

print('\nRanking real de las 4 zonas conocidas (idoneidad calculada, no ilustrativa):')
for nombre, val in sorted(resultados_zonas.items(), key=lambda kv: -kv[1]):
    print(f'  {nombre}: {val:.3f}')""")

md(r"""## 10. Límites honestos de este análisis

Mismo estándar del resto del curso: decir los límites, no ocultarlos.

- **Resolución de trabajo (250 m)**: limitada por la resolución nativa más gruesa
  disponible sin costos de cómputo prohibitivos (WorldClim a 2.5 arc-min, ~4.6 km,
  remuestreado). Un análisis publicable necesitaría WorldClim a 30 arc-seg (~1 km) o
  mejor, descargado localmente (no por streaming) con más tiempo de cómputo.
- **2 de 4 criterios agronómicos originales de la propuesta doctoral no tienen dato
  real**: humedad bajo el dosel es un proxy (NDVI + precipitación, no medición
  directa); conductividad eléctrica del suelo está completamente ausente (peso
  redistribuido a los otros 3, sección 6).
- **El área de estudio (PNN + buffer de 25 km) es una construcción metodológica**, no
  un límite oficial de "estribaciones" — elegida para cubrir las 4 zonas conocidas,
  documentada como tal, no presentada como un límite administrativo real.
- **No reemplaza la Fase 1 real de la propuesta doctoral** (sensores IoT midiendo en
  campo). Es, en palabras de `PLAN_INVESTIGACION.md`, "un primer insumo, no un
  sustituto" — útil para priorizar dónde mirar primero, no para tomar la decisión
  final de dónde desplegar.
- **Fecha de los datos**: SoilGrids y WorldClim son productos ya consolidados
  (WorldClim: normales climáticas 1970-2000; SoilGrids: perfiles históricos
  acumulados). Sentinel-2/NDVI es de diciembre 2024-marzo 2025 (temporada seca más
  reciente disponible al construir este notebook), una sola época del año, no una
  serie temporal.""")

nb['cells'] = cells
nb.metadata['kernelspec'] = {
    'display_name': 'mcda-ahp-sig',
    'language': 'python',
    'name': 'mcda-ahp-sig',
}
nb.metadata['language_info'] = {
    'name': 'python',
    'version': '3.13.1',
}

# Vive en la raiz del repo, mismo nivel que 00_..06_*.ipynb, no dentro de data/
out_path = Path(__file__).resolve().parent.parent.parent / '07_ahp_sig_cacao_snsm.ipynb'
with open(out_path, 'w', encoding='utf-8') as f:
    nbf.write(nb, f)
print(f'Notebook guardado: {out_path}')

# Ejecutar de punta a punta con nbclient (mismo estandar de verificacion del curso)
print('Ejecutando notebook end-to-end con nbclient (kernel mcda-ahp-sig)...')
from nbclient import NotebookClient
client = NotebookClient(nb, timeout=600, kernel_name='mcda-ahp-sig')
client.execute()
with open(out_path, 'w', encoding='utf-8') as f:
    nbf.write(nb, f)
print(f'Notebook ejecutado y guardado con outputs reales: {out_path}')
