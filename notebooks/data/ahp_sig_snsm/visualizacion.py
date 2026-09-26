"""Estilo de mapa tomado del propio artículo del docente (Polo-Castañeda et
al. 2021, "Application of AHP and GIS for Determination of Suitable
Wireless Sensor Network Zones...", IJASEIT): basemap satelital de fondo,
flecha de norte, barra de escala, y para las capas de idoneidad una
clasificación discreta de 3 clases (verde=apta, naranja=moderadamente
apta, rojo=no apta), igual que sus Fig. 6-10. Las capas continuas (DEM,
temperatura, etc.) usan un colorbar continuo, igual que su Fig. 4."""

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap, BoundaryNorm
from matplotlib.lines import Line2D
from pathlib import Path
import contextily as cx
from matplotlib_scalebar.scalebar import ScaleBar

# Cache persistente de tiles satelitales en disco para acelerar la generacion de mapas
_CACHE_TILES = Path(__file__).resolve().parent / "cache" / "contextily"
_CACHE_TILES.mkdir(parents=True, exist_ok=True)
cx.set_cache_dir(str(_CACHE_TILES))

VERDE = "#2EB07A"
NARANJA = "#E0A62E"
ROJO = "#E04F5A"


def _extent(transform, shape):
    h, w = shape
    x0, y0 = transform * (0, 0)
    x1, y1 = transform * (w, h)
    return (x0, x1, y1, y0)


def _norte(ax, x=0.06, y=0.90):
    ax.annotate("N", xy=(x, y), xycoords="axes fraction", ha="center", va="center",
                fontsize=14, fontweight="bold", color="white",
                path_effects=None, zorder=10)
    ax.annotate("", xy=(x, y + 0.045), xytext=(x, y - 0.035), xycoords="axes fraction",
                arrowprops=dict(arrowstyle="-|>", color="white", lw=2.2, mutation_scale=18),
                zorder=10)


def _escala(ax, crs):
    ax.add_artist(ScaleBar(1, units="m", dimension="si-length", location="lower left",
                            box_alpha=0.7, color="black", font_properties={"size": 9}))


def _basemap(ax, crs, zoom=9):
    try:
        cx.add_basemap(ax, crs=crs, source=cx.providers.Esri.WorldImagery, zoom=zoom, attribution=False)
    except Exception as e:
        print(f"  (basemap no disponible: {e}, se sigue sin él)")


def mapa_continuo(data, transform, crs, titulo, cmap, label, out_path=None, vmin=None, vmax=None):
    fig, ax = plt.subplots(figsize=(9, 8))
    extent = _extent(transform, data.shape)
    # el imshow va PRIMERO: fija los límites de la vista para que add_basemap
    # sepa qué región pedir (al revés, contextily pide un extent por defecto sin sentido)
    im = ax.imshow(data, cmap=cmap, extent=extent, alpha=0.82, zorder=2,
                    vmin=vmin if vmin is not None else np.nanmin(data),
                    vmax=vmax if vmax is not None else np.nanmax(data))
    _basemap(ax, crs)
    plt.colorbar(im, ax=ax, shrink=0.75, label=label)
    _norte(ax)
    _escala(ax, crs)
    ax.set_title(titulo, fontsize=12, pad=10)
    ax.set_xticks([]); ax.set_yticks([])
    plt.tight_layout()
    if out_path:
        plt.savefig(out_path, dpi=140, facecolor="white")
    plt.show()
    plt.close(fig)


def mapa_clasificado(idoneidad, transform, crs, titulo, out_path=None,
                      umbrales=(0.5, 0.7), etiquetas=("No apta", "Moderadamente apta", "Apta")):
    """3 clases por umbral fijo sobre la idoneidad 0-1, mismo esquema visual
    (rojo/naranja/verde) que las Fig. 6-10 del artículo de referencia."""
    bajo, alto = umbrales
    clases = np.full(idoneidad.shape, np.nan)
    clases = np.where(idoneidad < bajo, 0, clases)
    clases = np.where((idoneidad >= bajo) & (idoneidad < alto), 1, clases)
    clases = np.where(idoneidad >= alto, 2, clases)
    clases = np.where(np.isnan(idoneidad), np.nan, clases)

    cmap = LinearSegmentedColormap.from_list("clasificado", [ROJO, NARANJA, VERDE], N=3)
    norm = BoundaryNorm([-0.5, 0.5, 1.5, 2.5], cmap.N)

    fig, ax = plt.subplots(figsize=(9, 8))
    extent = _extent(transform, idoneidad.shape)
    ax.imshow(clases, cmap=cmap, norm=norm, extent=extent, alpha=0.78, zorder=2)
    _basemap(ax, crs)
    _norte(ax)
    _escala(ax, crs)

    handles = [Line2D([0], [0], marker="s", color="w", markerfacecolor=c, markersize=14, label=l)
               for c, l in zip([ROJO, NARANJA, VERDE], etiquetas) if l]
    leg = ax.legend(handles=handles, loc="lower right", title="Criterios",
                     framealpha=0.9, fontsize=9, title_fontsize=10)
    ax.set_title(titulo, fontsize=12, pad=10)
    ax.set_xticks([]); ax.set_yticks([])
    plt.tight_layout()
    if out_path:
        plt.savefig(out_path, dpi=140, facecolor="white")
    plt.show()
    plt.close(fig)
    pcts = {l: np.nanmean(clases == i) * 100 for i, l in enumerate(etiquetas) if l}
    return pcts
