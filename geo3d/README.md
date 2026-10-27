# Surat Underground

A 3D web explorer for the **OGIA 2017 regional geological model of the Surat Cumulative Management Area** (Rev2B, 250 m grid, exported from Petrel as Eclipse GRDECL). 21 formations from the Cenozoic cover to the undivided lower Bowen Basin, 460 × 650 km, 1836 × 2598 × 21 cells.

The deployable app is the sibling folder **`../surat3d/`** (`index.html`, `assets/`, `data/`): open it from any static host, e.g. GitHub Pages at `/webtest/surat3d/`. This folder (`geo3d/`) is the Vite source project; `npm run build` writes into `../surat3d/`.

## What it does

- Lit 3D bodies for every formation (top, base and boundary walls), built in a Web Worker from the horizon grids, with a 2 km version for instant load and a 1 km version streamed in behind it.
- **Cut**: slice and slab sections with exact caps computed from the grid, draggable in 3D, plus free-form **fence diagrams**; a 2D profile panel is drawn from the same data.
- **Probe**: click to drill a virtual borehole and read every formation top, base, thickness and depth (copy as CSV).
- Exploded view, vertical exaggeration, contours, and colouring by formation, age (ICS colours), hydro role (OGIA classes), elevation or thickness.
- Queensland Government relief or topographic basemap draped on surrounding terrain, towns, MGA grid, fault traces, guided tour, shareable URL state, screenshots, keyboard shortcuts.

## Data pipeline

`scripts/` converts the Petrel export (the raw 7.5 GB archive is not in the repo):

1. `expand.c`: streams the 4.5 GB `ZCORN` and `COORD` ASCII files (with `n*v` repeat counts) to binary.
2. `reduce.py`: averages the corner depths of the active cells meeting at each pillar node to produce a top and a base grid per layer (elevation = −depth, m AHD), plus per-layer fault indicators (corner discrepancies > 10 m).
3. `pack.py`: decimates to 1 km and 2 km (block means, masks require ≥ 25 % active fine cells), quantises to 16 bit per grid with per-grid scale/offset, and writes a small self-describing container (`GEO3` magic, JSON header, 4-byte aligned arrays) that is gzipped and decoded in the browser with fflate.
4. `context_dem.py`: builds the surrounding terrain from public Terrarium tiles; the basemaps are exports from the Queensland Government ArcGIS services (CC BY 4.0).

Coordinates are GDA94 / MGA zone 55 (EPSG:28355); elevations m AHD. The pillar positions of the Petrel grid wobble by up to ~300 m around a perfect lattice, so real node X/Y are stored rather than an affine lattice.

## Development

```
npm install
npm run dev      # http://localhost:5173
npm run build    # writes ../surat3d/index.html and ../surat3d/assets (data stays in ../surat3d/data)
node scripts/qa_screenshots.cjs out/ http://127.0.0.1:8787/surat3d/index.html   # headless screenshots and console check
```

Stack: Three.js 0.186, camera-controls, three-mesh-bvh, postprocessing + N8AO, fflate, proj4, Vite 8.

## Attribution

Model: Office of Groundwater Impact Assessment (Queensland Government), 2017 Surat CMA geological model as supplied. Basemaps © State of Queensland (Department of Natural Resources and Mines, Manufacturing and Regional and Rural Development), CC BY 4.0. Terrain: Mapzen / AWS Terrarium tiles (SRTM). Colour maps: Fabio Crameri (batlow).
