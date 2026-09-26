# MCDA Platform

Open-source web platform for multi-criteria decision analysis, built for teaching and research. It runs on Next.js 15, Supabase and
Vercel. The primary documentation is in Spanish ([README.md](README.md)); this file is a short English summary.

> **Status:** pre-release (0.1.0). Not yet peer-reviewed. See [docs/PLAN_publicacion.md](docs/PLAN_publicacion.md) for the
> publication and validation plan (in Spanish).

## What it does

- **Group AHP.** Criteria and alternatives; pairwise judgments from several experts, each opening a private link (no account);
  geometric-mean aggregation; consistency ratio (CR); synthesis and ranking. Optional read-only public results page.
- **Matrix methods.** TOPSIS, VIKOR (editable *v*, checks of the Opricovic & Tzeng conditions, sensitivity to *v*), PROMETHEE,
  ELECTRE (outranking relation with incomparability, not a ranking), SAW and Fuzzy-TOPSIS, on a shared decision matrix. Criteria weights
  come from the same pairwise-comparison sheet; criteria may be benefit, cost, or target-type.
- **AHP + GIS geoviewer.** Alternatives are cells of a territory. Load your own layers (GeoTIFF, GeoJSON, zipped shapefile, KML, GPX),
  edit suitability rules, weight them with an expert panel, query any point, and export GeoTIFF (+ QGIS style), PNG, KMZ, CSV, Excel.
  Source files are read in the browser and never uploaded whole.
- **Excel export with live formulas** and cached values (the AHP eigenvector is computed by power iteration in cell formulas, next to the course's column-average shortcut); the workbook can be re-imported.
- **Method wizard** (`/metodo`) that helps pick a method with three questions.

## How the maths is verified

The same computations live in the TypeScript library and in the formulas of the exported workbook and must agree (a legacy HTML
prototype under `prototipos/` keeps the course's column-average AHP and is not kept in sync). `npm test` checks every method against exact reference values taken from the course notebooks (built on
[`pyDecision`](https://github.com/Valdecy/pyDecision)); `npm run test:excel` round-trips the workbooks; a LibreOffice headless
recalculation test checks that the Excel formulas evaluate on their own.

## Limitations (declared, not hidden)

- Flat hierarchy (criteria → alternatives): no multi-level sub-criteria, no ANP.
- No Monte Carlo weight uncertainty and no group-consensus index yet (planned).
- Distances in the geoviewer are Euclidean, not network distances.
- User interface in Spanish only for now (English planned).
- Some ranking-only methods (PROMETHEE, ELECTRE) use the course's conventions for thresholds; they are editable but defaults are pedagogical.

## Quick start

```bash
cd plataforma
cp .env.example .env.local   # your own Supabase project URL and anon key
npm ci
npm run dev                  # http://localhost:3000
npm test && npm run test:excel && npm run typecheck
```
Apply the SQL files in `supabase/migrations/` in order. `npm run test:db` runs them in a throw-away PostgreSQL 17 and tests row-level
security.

## Citation and licence

MIT. Please cite via [CITATION.cff](../CITATION.cff) (a versioned release with DOI is planned).
