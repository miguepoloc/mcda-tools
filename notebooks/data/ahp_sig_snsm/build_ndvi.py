import pystac_client, planetary_computer
import rasterio
from rasterio.enums import Resampling as ResamplingEnum
from pyproj import Transformer
import numpy as np
import warnings
warnings.filterwarnings('ignore')

AOI_BOUNDS_WGS84 = (-74.24, 10.19, -72.85, 11.49)  # lon_min, lat_min, lon_max, lat_max
OUT_DIR = "/Users/miguepoloc/Code/02-learning/maestria/toma-decisiones-mcda/data/ahp_sig_snsm/cache"
TARGET_RES_M = 100  # leer decimado a ~100m (GDAL usa los overviews del COG, no la banda 10m completa) -- de sobra para remuestrear despues a 250m

catalog = pystac_client.Client.open('https://planetarycomputer.microsoft.com/api/stac/v1', modifier=planetary_computer.sign_inplace)
search = catalog.search(
    collections=['sentinel-2-l2a'],
    bbox=list(AOI_BOUNDS_WGS84),
    datetime='2024-12-01/2025-03-31',
    query={'eo:cloud_cover': {'lt': 15}},
    limit=100,
)
items = list(search.items())
best = {}
for it in items:
    tid = it.properties.get('s2:mgrs_tile')
    cc = it.properties.get('eo:cloud_cover')
    if tid not in best or cc < best[tid].properties.get('eo:cloud_cover'):
        best[tid] = it

print(f'Usando {len(best)} escenas Sentinel-2, una por tile MGRS, todas <15% nubes:', flush=True)
ndvi_paths = []
for tid, item in best.items():
    print(' ', tid, item.id, item.properties.get('eo:cloud_cover'), flush=True)
    with rasterio.open(item.assets['B04'].href) as red_src, \
         rasterio.open(item.assets['B08'].href) as nir_src, \
         rasterio.open(item.assets['SCL'].href) as scl_src:
        tr = Transformer.from_crs('EPSG:4326', red_src.crs, always_xy=True)
        x0, y0 = tr.transform(AOI_BOUNDS_WGS84[0], AOI_BOUNDS_WGS84[1])
        x1, y1 = tr.transform(AOI_BOUNDS_WGS84[2], AOI_BOUNDS_WGS84[3])
        xmin, xmax = sorted([x0, x1])
        ymin, ymax = sorted([y0, y1])
        win = red_src.window(xmin, ymin, xmax, ymax)
        win = win.intersection(rasterio.windows.Window(0, 0, red_src.width, red_src.height))
        if win.width <= 0 or win.height <= 0:
            print('    (sin superposicion real, se omite)', flush=True)
            continue
        # lectura decimada: pide un out_shape mucho mas chico que la ventana nativa (10m),
        # GDAL sirve esto desde los overviews del COG en vez de traer cada pixel de 10m -- mucho mas rapido
        native_res = red_src.res[0]
        out_h = max(1, int(win.height * native_res / TARGET_RES_M))
        out_w = max(1, int(win.width * native_res / TARGET_RES_M))
        red = red_src.read(1, window=win, out_shape=(out_h, out_w), resampling=ResamplingEnum.average).astype(np.float32)
        nir = nir_src.read(1, window=win, out_shape=(out_h, out_w), resampling=ResamplingEnum.average).astype(np.float32)
        scl_win = scl_src.window(xmin, ymin, xmax, ymax)
        scl = scl_src.read(1, window=scl_win, out_shape=(out_h, out_w), resampling=ResamplingEnum.nearest).astype(np.float32)
        transform = red_src.window_transform(win) * red_src.window_transform(win).scale(win.width / out_w, win.height / out_h)
        crs = red_src.crs

    valid = np.isin(scl, [4, 5, 6, 7])
    denom = (nir + red)
    with np.errstate(invalid='ignore', divide='ignore'):
        ndvi = np.where(denom != 0, (nir - red) / denom, np.nan)
    ndvi = np.where(valid, ndvi, np.nan).astype(np.float32)

    out_path = f'{OUT_DIR}/ndvi_{tid}.tif'
    meta = {
        'driver': 'GTiff', 'height': ndvi.shape[0], 'width': ndvi.shape[1],
        'count': 1, 'dtype': 'float32', 'crs': crs, 'transform': transform, 'nodata': np.nan,
    }
    with rasterio.open(out_path, 'w', **meta) as dst:
        dst.write(ndvi, 1)
    ndvi_paths.append(out_path)
    pct_valid = np.mean(valid) * 100
    print(f'    NDVI shape {ndvi.shape} (decimado a ~{TARGET_RES_M}m), % pixeles validos (sin nubes) {pct_valid:.1f}%', flush=True)

print('Tiles NDVI guardados:', ndvi_paths, flush=True)
with open(f'{OUT_DIR}/ndvi_paths.txt', 'w') as f:
    f.write('\n'.join(ndvi_paths))
