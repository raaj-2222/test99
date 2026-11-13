# TerraScope — Earth System Trend Detective

**Live-data-based NASA Space Apps prototype** built using five user-provided NASA POWER monthly CSV exports, 2001–2025. Explore **5 Indian locations, 8 variables, 5 reporting periods, and 200 trend analyses** using an interactive map, timelines, a contrast engine, a comparison ranking, download-ready findings, and transparent significance labels.

![Status](https://img.shields.io/badge/status-prototype-8df2cc) ![Data](https://img.shields.io/badge/data-NASA%20POWER-5da6cb)

## Features

- Interactive Leaflet point map for **Mumbai, Delhi, Chennai, Guwahati, and Leh**, with markers showing slope direction and significance; five sites are **not** a dense pixel trend map of India.
- Explore **temperature, minimum/maximum temperature, precipitation, humidity, wind, pressure, and longwave radiation**. Includes annual and four India-relevant seasons.
- Chart.js historical series for selected and comparison sites, plus the calculated Sen trend line.
- **Mann–Kendall** two-sided trend test with tie-adjusted variance, **Theil–Sen slope** with 95% interval, and **Benjamini–Hochberg FDR** correction across the five sites separately within each variable × time-period family.
- Automatically finds same-variable **opposite-sign** slope pairs; explicitly warns when one or both directions are not FDR-significant.
- Download filtered CSV and a Markdown research case brief; see caveats and data provenance in the UI.
- Works as static files: **no API key, database, build system, login, user account, paid services, or backend required**.

## Run the prototype

**Option A — preview locally:** Open `index.html` in a browser with an internet connection. It uses CDN assets for Chart.js, Leaflet, fonts and map tiles. The embedded data bundle `data/results.js` requires no fetch and works from `file://`.

**Option B — GitHub Pages:** Publish the folder as a Pages site (for example copy it to a dedicated repo root or set up a Pages workflow). For Vercel, import a repo and select this directory as the **Root Directory**, framework **Other**, with no build command; output directory `.`.

**Option C — local server:**

```sh
python -m http.server 8000
# open http://localhost:8000
```

## Rebuild the analyses from the exact NASA CSVs

The original exports live in `raw/`. Precomputed annual and seasonal data is committed in `data/`, so visitors do not need Python.

```sh
python -m pip install -r requirements.txt
python scripts/build_data.py
python -m pytest -q
```

Outputs:

| File | Purpose |
| --- | --- |
| `data/monthly_clean.csv` | 1,500 city-month rows, 8 source variables |
| `data/trend_results.csv` | 200 test summaries, slopes, confidence intervals, p and q values |
| `data/results.json` | Provenance, metadata and compact annual/seasonal time series |
| `data/results.js` | Same compact dataset as a static browser-ready bundle |

## Statistical methodology

1. Parse NASA POWER's nonstandard CSV header (ending with `-END HEADER-`). Preserve the source parameter names, UTC time standard, and year range.
2. Convert monthly mean **precipitation rate in mm/day** to period **totals in mm** using the number of calendar days per month. Other variables are day-weighted monthly means.
3. Define annual (Jan–Dec), winter (Dec previous year–Feb current year), pre-monsoon (Mar–May), monsoon (Jun–Sep), and post-monsoon (Oct–Nov). Winter has **24** complete seasons (2002–2025); every other period has **25**.
4. Estimate a Sen slope per year (display ×10 as per decade) and a two-sided Mann–Kendall p-value with ties correction. Compute a nominal 95% Sen slope confidence interval.
5. Correct each five-site family of p-values using Benjamini–Hochberg; `q < 0.05` determines the displayed significance flag. It does **not** control FDR across all 200 exploratory tests or adjust for temporal autocorrelation.

### Important scientific limitations

- **Five city coordinate samples do not establish national or global trends.** Results are for sampled NASA POWER gridded values, not local instrument measurements.
- Annual series may be **autocorrelated**; the MK p-values and Sen confidence intervals assume independent year-to-year observations. The app is exploratory; replicate with autocorrelation-aware tests for publication.
- **Possible step changes** or changes in source processing require follow-up validation. Some surprising results (e.g., negative Leh minimum-temperature slope) must be verified against independent data before public scientific claims.
- These are trends, **not causal explanations**; a significant site trend does not prove that trends differ statistically between two sites.
- FDR correction is **only within a displayed metric × period across five cities**. Selecting many variables/periods increases the chance of false discoveries beyond that local family.
- Source CSV header describes `IMERG_PRECTOT` as **"MERRA-2 Total Precipitation (mm/day)"**. It is retained under the exact export parameter key; do not call it purely IMERG satellite-derived without source verification. `ALLSKY_SFC_LW_DWN` is labelled **CERES SYN1deg**.

## Dataset details

| Sample site | Approx. latitude | Approx. longitude |
| --- | ---: | ---: |
| Mumbai | 19.08 N | 72.88 E |
| Delhi | 28.63 N | 77.22 E |
| Chennai | 13.07 N | 80.20 E |
| Guwahati | 26.14 N | 91.66 E |
| Leh | 34.14 N | 77.57 E |

**Source:** [NASA POWER Data Access Viewer](https://power.larc.nasa.gov/data-access-viewer/). The period and parameter codes are those in the original downloads. NASA data use is subject to NASA's stated data policies; check product references for any formal scientific submission.

## Project layout

```
index.html                Dashboard layout and controls
styles.css                Responsive dark visual style
app.js                    Map, chart, comparisons, exports (browser JavaScript)
raw/                      Five original NASA POWER CSVs
scripts/build_data.py     Reproducible parsing and statistical computations
data/                     Processed outputs consumed by frontend
tests/test_data.py        Data, quality, and statistical sanity tests
requirements.txt          Python tools to regenerate results
```

## Demo flow for judges (60–90 seconds)

1. Introduce the question: *"Can one Earth variable rise in one place while falling in another?"*
2. Start with **Minimum 2 m temperature / Annual**. Compare Guwahati against Leh and show each 25-year time series. Both individual site slopes pass the within-metric FDR threshold; this is not, by itself, a formal between-site slope difference test.
3. Change to **Precipitation / Annual** and click Mumbai to inspect a rainfall trend in **mm per decade**. Click any city on the map to compare.
4. Show **FDR q-values, 95% intervals, and limitations**—not just colored dots. Export the evidence CSV and case brief.
5. Mention future work: expand to a real gridded map and run serial-correlation-aware trend analyses.

### Next-step improvements

* Gridded NASA Earth data (e.g., GES DISC) instead of five selected coordinates.
* Sensitivity checks for breakpoints, autocorrelation, and slope differences between sites.
* Validated links between climate variables and any real-world decision-support claims.

---

Created for exploratory learning in the NASA Earth System Trend Detective challenge. Not an official NASA product or an endorsed NASA analysis.