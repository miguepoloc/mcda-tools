#!/usr/bin/env python3
"""Exporta un paquete del catálogo del geovisor a partir de las
matrices ya calculadas por 07_ahp_sig_cacao_snsm.ipynb (notebooks/data/ahp_sig_snsm/cache/).

No descarga nada nuevo: reusa el caché del notebook. Produce, bajo
public/geo-packs/<pack_id>/:
  - manifest.json   grilla (CRS/bbox/res/tamaño), un registro por capa
                     (id, etiqueta, unidad, min/max reales, ruta) y puntos de
                     ejemplo.
  - layers/*.bin.gz  cada capa cuantizada a Uint8 [0,254] + 255=sin dato,
                      comprimida con gzip (se decodifica en el navegador con
                      DecompressionStream('gzip'), sin dependencias nuevas).
  - base.png          hillshade del DEM, tamaño nativo de la grilla, como
                      fondo del mapa (el geovisor lo pinta con opacidad baja).

Ver src/lib/geo/membership.ts y suitability.ts para el consumidor.
Ver docs/PLAN_geovisor_ahp_sig.md § 6.2 sobre `pend`: la función de
idoneidad de pendiente no está en membership.py (falta en el notebook); aquí
solo se exporta el dato crudo en grados, la función vive en el cliente.

Uso: .venv/bin/python scripts/geo/export_pack.py
"""
import json
import gzip
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "notebooks" / "data" / "ahp_sig_snsm" / "cache"
OUT = ROOT / "public" / "geo-packs" / "snsm-cacao-v1"
(OUT / "layers").mkdir(parents=True, exist_ok=True)


def quantize(arr: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """Uint8 en [0,254] sobre [lo,hi]; 255 = sin dato (nan)."""
    v = np.clip((arr - lo) / (hi - lo), 0.0, 1.0)
    out = np.where(np.isnan(arr), 255, np.round(v * 254)).astype(np.uint8)
    return out


def write_layer(name: str, arr: np.ndarray, lo: float, hi: float) -> dict:
    q = quantize(arr, lo, hi)
    raw = q.tobytes()
    gz = gzip.compress(raw, 9)
    path = OUT / "layers" / f"{name}.u8.gz"
    path.write_bytes(gz)
    print(f"  {name}: {len(raw)/1024:.0f} KB crudo -> {len(gz)/1024:.0f} KB gzip")
    return {"min": lo, "max": hi, "path": f"layers/{name}.u8.gz", "bytes": len(gz)}


def main() -> None:
    with rasterio.open(CACHE / "dem_250m.tif") as d:
        dem = d.read(1).astype(float)
        transform = d.transform
        crs = str(d.crs)
    temp = np.load(CACHE / "bio1_temp_anual_250m.npy")
    precip = np.load(CACHE / "bio12_precip_anual_250m.npy")
    ph = np.load(CACHE / "ph_250m.npy")
    pend = np.load(CACHE / "pendiente_grados_250m.npy")
    clases = np.load(CACHE / "clases_zonificacion_upra_250m.npy")
    H, W = dem.shape
    valid = ~np.isnan(dem)
    excl_legal = valid & (clases == 0)

    print(f"Grilla {W}x{H} ({W*H:,} píxeles) · CRS {crs}")
    print("Exportando capas…")
    layers = {
        "temp": write_layer("temp", temp, float(np.nanmin(temp)), float(np.nanmax(temp))),
        "precip": write_layer("precip", precip, float(np.nanmin(precip)), float(np.nanmax(precip))),
        "ph": write_layer("ph", ph, float(np.nanmin(ph)), float(np.nanmax(ph))),
        "pend": write_layer("pend", pend, 0.0, float(np.nanmax(pend))),
    }
    # máscara: 0 sin dato, 1 válido, 2 exclusión legal (PNN + páramo ≥3000msnm,
    # ya resuelto en clases_zonificacion_upra_250m.npy por el notebook)
    mask = np.zeros((H, W), np.uint8)
    mask[valid] = 1
    mask[excl_legal] = 2
    mgz = gzip.compress(mask.tobytes(), 9)
    (OUT / "layers" / "mask.u8.gz").write_bytes(mgz)
    print(f"  mask: {mgz.__sizeof__()/1024:.0f} KB gzip")

    # hillshade como fondo, resolución nativa de la grilla (el navegador escala)
    gy, gx = np.gradient(np.where(valid, dem, np.nanmin(dem)), 250.0, 250.0)
    az, alt = np.radians(315), np.radians(40)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    hs = np.clip(np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect), 0, 1)
    g = (18 + hs * 70).astype(np.uint8)
    base = np.stack([g, np.clip(g * 1.05, 0, 255).astype(np.uint8), np.clip(g * 1.25, 0, 255).astype(np.uint8)], -1)
    base[~valid] = [11, 15, 23]
    Image.fromarray(base).save(OUT / "base.png", optimize=True)
    print(f"  base.png: {(OUT/'base.png').stat().st_size/1024:.0f} KB")

    ha_pixel = (250.0 ** 2) / 10000.0
    manifest = {
        "id": "snsm-cacao-v1",
        "title": "Aptitud cacaotera — Sierra Nevada de Santa Marta",
        "attribution": "WorldClim 2.1 (BIO1/BIO12), SoilGrids 2.0 (ISRIC), Copernicus DEM GLO-30, RUNAP",
        "grid": {
            "crs": crs,
            "width": W,
            "height": H,
            "resM": 250,
            "haPerPixel": ha_pixel,
            # afín GDAL/rasterio (a,b,c,d,e,f): x = a*col + b*row + c; y = d*col + e*row + f
            "transform": [transform.a, transform.b, transform.c, transform.d, transform.e, transform.f],
        },
        "layers": {
            "temp": {**layers["temp"], "label": "Temperatura media anual", "unit": "°C"},
            "precip": {**layers["precip"], "label": "Precipitación anual", "unit": "mm/año"},
            "ph": {**layers["ph"], "label": "pH del suelo (0–5 cm)", "unit": ""},
            "pend": {**layers["pend"], "label": "Pendiente", "unit": "°"},
        },
        "mask": {"path": "layers/mask.u8.gz", "legend": {"0": "sin dato", "1": "válido", "2": "exclusión legal (PNN, páramo ≥3000 msnm)"}},
        "base": "base.png",
        "points": {
            "Palmor": {"lat": 10.7702774, "lon": -74.0241478},
            "San Pedro": {"lat": 10.9069506, "lon": -74.0459379},
            "Bonda": {"lat": 11.2343429, "lon": -74.1247860},
            "Guachaca": {"lat": 11.2502349, "lon": -73.8284338},
        },
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
    print(f"\nmanifest.json escrito en {OUT}")
    total = sum((OUT / "layers" / f).stat().st_size for f in ["temp.u8.gz", "precip.u8.gz", "ph.u8.gz", "pend.u8.gz", "mask.u8.gz"])
    total += (OUT / "base.png").stat().st_size
    print(f"Tamaño total del paquete: {total/1024:.0f} KB")


if __name__ == "__main__":
    main()
