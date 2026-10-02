# Changelog

All notable changes to **MCDA Tools** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-02

### First stable release
The platform is declared stable for citation and publication: the seven methods (AHP, TOPSIS, VIKOR, ELECTRE, PROMETHEE, SAW, Fuzzy TOPSIS), the live-formula Excel export and the AHP+SIG spatial geoviewer are verified against the reference notebooks (`npm test`, `npm run test:excel`). ANP (Session 6) is planned for a later minor release.

### Added
- QR codes and an open self-registration link for experts (migration `…16_open_expert_link`).
- Edit functionality in the geo layers panel and an expanded help section.

### Fixed
- `JudgmentEditor` sheet logic with empty alternatives.
- Panel positioning for spatial projects; clearer expert instructions.

---

## [0.1.3] - 2026-09-28

### Added
- Co-authors and researchers from Universidad del Magdalena added to the platform's official academic citations, software metadata, and Citation File Format (`CITATION.cff`):
  - **Harold David Hernandez-Solorzano** (`https://orcid.org/0009-0003-4837-3797`)
  - **Alexander Esteban Espinosa-Valdez** (`https://orcid.org/0000-0001-6281-8156`)
  - **Jorge Gómez-Rojas** (`https://orcid.org/0000-0002-0840-8743`)
- Standardized compound Spanish surnames and institutional affiliations across all generated citation formats: APA (7th ed.), IEEE, BibTeX, RIS, and Chicago.
- Interactive research team display with direct verified ORCID profile links in `CitationBox` on `/citar`.
- Updated contributors list in `package.json` and bibliographic references in `ExecutiveReportModal`.

---

## [0.1.2] - 2026-09-28

### Removed
- The "aptitud cacaotera · Sierra Nevada" spatial example (`snsm-cacao-v1`, notebook 07). Its geo-pack shipped two layers (temperature, precipitation) derived from WorldClim 2.1, whose license (CC BY-NC-SA 4.0) explicitly forbids redistribution. The buoy example (`boya-2021`, Polo-Castañeda et al. 2021, no such restriction) is now the platform's only built-in spatial example. The removed files stay available locally (git-ignored) for continued work outside this repository.

### Fixed
- `scripts/check-geo-crs.ts` no longer reads the (now removed) `snsm-cacao-v1/manifest.json`; it uses the reference grid's transform and CRS code directly (georeferencing metadata only, not the licensed data), so the regression test still runs.

---

## [0.1.1] - 2026-09-27

### Fixed
- Restored `notebooks/README.md`, which had been accidentally emptied while preparing the v0.1.0 release.
- Removed `.agents/` (136 unrelated Claude Code UI/UX skill files, ~4 MB) from version control; it was mistakenly tracked during the `mcda-tools` restructuring and is now git-ignored.
- Rewrote `README.es.md` from scratch: it still described the pre-restructuring layout (`plataforma/` as the app root, the deleted `prototipos/` folder and Harold's thesis HTML tool, a hardcoded Supabase project ref, and only 6 of the 15 migrations). It now mirrors `README.md` exactly, section by section.

### Added
- Real screenshots of the production deployment (landing, `/metodo`, `/citar`) under `docs/screenshots/`, embedded in both README files.
- `GitHub release` badge in `README.md` and `README.es.md`.

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
