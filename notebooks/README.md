# Validación Matemática y Benchmarks MCDA (Notebooks Python)

Este directorio contiene la suite de cuadernos de Jupyter utilizados para la formulación, experimentación y validación matemática independiente de los algoritmos implementados en la plataforma **[mcda.tools](https://mcda.tools)**.

Cada cuaderno resuelve de extremo a extremo casos reales utilizando implementaciones en Python con `pyDecision`, `NumPy`, `Pandas` y librerías geoespaciales, sirviendo como **patrón de referencia (ground truth)** para las pruebas unitarias automatizadas (`scripts/check-*.ts`) y las fórmulas vivas en Excel de la plataforma.

---

## Cuadernos de Validación

| # | Notebook | Método | Caso de Estudio | Referencia / Motor |
|---|----------|--------|-----------------|--------------------|
| 00 | [`00_priorizacion_criterios.ipynb`](00_priorizacion_criterios.ipynb) | Tamizaje y Ponderación de Criterios | Selección tecnológica IoT/WSN Palmor | Votación multi-evaluador |
| 01 | [`01_ahp_iot_palmor.ipynb`](01_ahp_iot_palmor.ipynb) | AHP (Analytic Hierarchy Process) | Red IoT/WSN Palmor (Sierra Nevada) | Saaty (1980) / `pyDecision` / Eigenvector |
| 02 | [`02_topsis_iot_palmor.ipynb`](02_topsis_iot_palmor.ipynb) | TOPSIS | Red IoT/WSN Palmor | Hwang & Yoon (1981) / `pyDecision` |
| 03 | [`03_vikor_iot_palmor.ipynb`](03_vikor_iot_palmor.ipynb) | VIKOR | Red IoT/WSN Palmor | Opricovic & Tzeng (2004) / `pyDecision` |
| 04 | [`04_electre_iot_palmor.ipynb`](04_electre_iot_palmor.ipynb) | ELECTRE I | Red IoT/WSN Palmor | Roy (1968) / `pyDecision` |
| 05 | [`05_promethee_iot_palmor.ipynb`](05_promethee_iot_palmor.ipynb) | PROMETHEE II | Red IoT/WSN Palmor | Brans & Vincke (1985) / `pyDecision` |
| 06 | [`06_anp_iot_palmor.ipynb`](06_anp_iot_palmor.ipynb) | ANP (Analytic Network Process) | Red IoT/WSN Palmor | Saaty (1996) / Supermatriz |
| 07 | [`07_ahp_sig_cacao_snsm.ipynb`](07_ahp_sig_cacao_snsm.ipynb) | AHP + SIG (Zonificación Espacial) | Idoneidad cacaotera Sierra Nevada | Rasterio / GDAL / WorldClim / SoilGrids |

---

## Ejecución Local

Para ejecutar estos cuadernos localmente con su entorno virtual:

```bash
cd notebooks
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
jupyter lab
```

---

## Licencia

Distribuido bajo la licencia MIT. Ver [LICENSE](../LICENSE).
