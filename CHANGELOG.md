# Changelog

All notable changes to **MCDA Tools** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-09-27

### Initial Release: Web Platform for Multi-Criteria Decision Analysis & Spatial MCDA

#### Added
- **Group Analytic Hierarchy Process (AHP)**:
  - Multi-expert pairwise comparison with Saaty's 1–9 intensity scale.
  - Principal eigenvector calculation via power iteration and normalized column-average benchmark.
  - Geometric mean group aggregation for multi-expert consensus.
  - Consistency Ratio (CR) calculation with random index (RI) validation.
  - Group consensus index ($S^*$) based on Shannon entropy (Goepel, 2018).
  - Monte Carlo simulation for criteria weight uncertainty and sensitivity.
- **Matrix Multi-Criteria Decision Suite**:
  - **TOPSIS**: Vector normalization, Euclidean distance to positive/negative ideal solutions, relative closeness index.
  - **VIKOR**: Manhattan ($S$) and Chebyshev ($R$) metrics, compromise metric ($Q$), editable strategy weight $v \in [0, 1]$, automated checking of Opricovic & Tzeng (2004) conditions (Acceptable Advantage and Acceptable Stability), compromise set determination, and parametric $Q(v)$ sensitivity curves.
  - **ELECTRE I**: Concordance and discordance matrices with user-defined thresholds ($c^*, d^*$), outranking relations, and Roy's graph kernel extraction.
  - **PROMETHEE II**: Linear preference functions with indifference ($q$) and preference ($p$) thresholds, positive, negative, and net outranking flows.
  - **SAW (Simple Additive Weighting)**: Linear normalization and direct multi-attribute utility.
  - **Fuzzy TOPSIS**: Triangular Fuzzy Numbers (TFN), linguistic scale translation, and fuzzy distance to ideals.
  - **Target Criteria Support**: "Nominal-the-best" criteria with tolerance intervals ($|x - \text{target}| - \text{tol}$), smoothly converted to minimization metrics across all matrix methods.
  - **Objective Weighting**: Integrated CRITIC and Shannon Entropy weighting methods.
- **Spatial MCDA / Geoviewer (GIS + AHP)**:
  - In-browser raster and vector layer parsing: GeoTIFF, GeoJSON, Shapefile (.zip), KML, GPX.
  - Exact Euclidean distance transform (Felzenszwalb algorithm) for spatial proximity criteria.
  - On-the-fly CRS reprojection via Proj4 (UTM, MAGNA-SIRGAS, WGS84, Web Mercator).
  - Continuous and discrete suitability membership functions (linear, trapezoid, step, goal/target).
  - Interactive multi-layer web map (Leaflet) with point interrogation, area statistics (hectares and percentages), and contiguous patch detection.
  - Full GIS export suite: georeferenced GeoTIFF (0–100 suitability and discrete classes) with QGIS style (.qml), PNG cartographic map, KMZ (Google Earth), CSV pixel grid, and comprehensive Excel summary.
- **Formula-Driven Spreadsheet Export**:
  - Live `.xlsx` workbook generation with native Excel formulas (`SUMPRODUCT`, `INDEX`, power iteration steps) rather than static numerical values.
  - Verified against LibreOffice headless re-evaluation tests.
  - Two-way workbook round-trip: export, offline editing, and seamless re-import.
- **Security & Privacy Architecture**:
  - PostgreSQL Row Level Security (RLS) policies.
  - Unique tokenized survey links (`/e/<token>`) allowing external panel experts to participate without requiring account registration.
  - Public project sharing via read-only tokenized links (`/p/<token>`).
  - Strict rate-limiting on token-based endpoints.
- **Validation & Benchmarks**:
  - Complete Python Jupyter notebook validation suite (`notebooks/`) benchmarked against `pyDecision`.
  - Comprehensive unit test suite covering all 7 decision methods and geospatial algorithms.
  - Citation metadata conforming to Citation File Format 1.2.0 (`CITATION.cff`).
