"""Funciones de membresía (idoneidad 0-1) por criterio, basadas en los
umbrales agronómicos reales de FEDECACAO (2015), Guía técnica para el
cultivo del cacao, no en normalización lineal min-max arbitraria.

Cada función es trapezoidal: 0 fuera del rango tolerable, 1 en el rango
óptimo, rampa lineal en las zonas intermedias -- lo mismo que un análisis
de idoneidad de tierras FAO/AHP+SIG real (ver Sales et al. 2024, ya citado
en sesion-03/README.md del curso).
"""
import numpy as np


def trapezoid(x, a, b, c, d):
    """0 en x<=a o x>=d, 1 en b<=x<=c, rampa lineal en (a,b) y (c,d)."""
    x = np.asarray(x, dtype=float)
    y = np.zeros_like(x)
    y = np.where((x >= b) & (x <= c), 1.0, y)
    rise = (x - a) / (b - a) if b > a else np.ones_like(x)
    y = np.where((x > a) & (x < b), np.clip(rise, 0, 1), y)
    fall = (d - x) / (d - c) if d > c else np.ones_like(x)
    y = np.where((x > c) & (x < d), np.clip(fall, 0, 1), y)
    y = np.where(np.isnan(x), np.nan, y)
    return y


def idoneidad_temperatura(temp_c):
    """FEDECACAO (2015): óptimo 22-30°C, límites duros 15-38°C (fuera de
    eso el propio manual dice que afecta el comportamiento fisiológico)."""
    return trapezoid(temp_c, 15, 22, 30, 38)


def idoneidad_precipitacion(precip_mm_anual):
    """FEDECACAO (2015): óptimo 1500-2500 mm/año. Por debajo de 1500 mm
    "es indispensable la aplicación de riego" (penaliza, no descarta del
    todo); se usa 500 mm como piso duro (semiárido, sin riego disponible
    asumido). Por encima de 2500 mm el manual no da un techo duro, se usa
    un decaimiento suave hasta 4000 mm (exceso de humedad favorece hongos,
    coherente con el objetivo real de riesgo de Moniliasis del proyecto)."""
    return trapezoid(precip_mm_anual, 500, 1500, 2500, 4000)


def idoneidad_ph(ph):
    """FEDECACAO (2015): óptimo 5.5-6.5 ("moderadamente ácidos"); tolera
    "acidez fuerte a moderada de 5 a 6". Límites dados por SoilGrids
    Poggio et al. (2021) rango real observado en la zona (4.9-7.2)."""
    return trapezoid(ph, 4.0, 5.5, 6.5, 8.0)


def idoneidad_humedad_proxy(ndvi, precip_norm):
    """Humedad bajo el dosel no tiene fuente satelital directa (ver
    sesion-05/README.md). Proxy: NDVI alto (dosel denso, sombra, retiene
    humedad) combinado con precipitación -- ambos suben la humedad relativa
    bajo el dosel. NDVI ya viene 0-1 aprox (rango real de vegetación densa
    tropical 0.4-0.9), se usa directo como proporción de "densidad de
    dosel"; se combina 50/50 con la idoneidad de precipitación ya calculada
    (mismo criterio agronómico, la humedad bajo dosel depende de ambos)."""
    ndvi_norm = np.clip((ndvi - 0.2) / (0.8 - 0.2), 0, 1)  # 0.2=suelo desnudo, 0.8=dosel denso
    return 0.5 * ndvi_norm + 0.5 * precip_norm
