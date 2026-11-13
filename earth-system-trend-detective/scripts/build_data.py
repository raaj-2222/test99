#!/usr/bin/env python3
"""Build a reproducible exploratory climate-trend dashboard from NASA POWER CSVs.

Source files: NASA POWER monthly single-point CSV, 2001-2025.
All p-values assume independent annual observations; exploratory, not causal.
"""
from __future__ import annotations

import calendar
import csv
import json
import math
import re
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm, theilslopes

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'raw'
OUT = ROOT / 'data'
OUT.mkdir(exist_ok=True)

CITIES = {
    'Mumbai': ('019d08N_072d88E', 19.08, 72.88),
    'Delhi': ('028d63N_077d22E', 28.63, 77.22),
    'Chennai': ('013d07N_080d20E', 13.07, 80.20),
    'Guwahati': ('026d14N_091d66E', 26.14, 91.66),
    'Leh': ('034d14N_077d57E', 34.14, 77.57),
}
METRICS = {
    'T2M': {'name': 'Mean temperature', 'short': 'Temperature', 'unit': '°C', 'type': 'average', 'precision': 2},
    'T2M_MAX': {'name': 'Maximum 2 m temperature', 'short': 'Daytime maximum', 'unit': '°C', 'type': 'average', 'precision': 2},
    'T2M_MIN': {'name': 'Minimum 2 m temperature', 'short': 'Nighttime minimum', 'unit': '°C', 'type': 'average', 'precision': 2},
    'IMERG_PRECTOT': {'name': 'Total precipitation', 'short': 'Precipitation', 'unit': 'mm', 'type': 'total', 'precision': 0},
    'RH2M': {'name': 'Relative humidity', 'short': 'Humidity', 'unit': '%', 'type': 'average', 'precision': 1},
    'WS10M': {'name': '10 m wind speed', 'short': 'Wind', 'unit': 'm/s', 'type': 'average', 'precision': 2},
    'PS': {'name': 'Surface pressure', 'short': 'Pressure', 'unit': 'kPa', 'type': 'average', 'precision': 2},
    'ALLSKY_SFC_LW_DWN': {'name': 'Downward longwave radiation', 'short': 'Longwave radiation', 'unit': 'MJ/m²/day', 'type': 'average', 'precision': 2},
}
SEASONS = {
    'annual': {'name': 'Annual', 'description': 'January–December', 'months': list(range(1,13))},
    'winter': {'name': 'Winter', 'description': 'December (previous year)–February', 'months': [12,1,2]},
    'pre_monsoon': {'name': 'Pre-monsoon', 'description': 'March–May', 'months': [3,4,5]},
    'monsoon': {'name': 'Monsoon', 'description': 'June–September', 'months': [6,7,8,9]},
    'post_monsoon': {'name': 'Post-monsoon', 'description': 'October–November', 'months': [10,11]},
}
MONTH_COLUMNS = [calendar.month_abbr[m].upper() for m in range(1, 13)]


def read_raw() -> pd.DataFrame:
    frames = []
    for city, (locator, lat, lon) in CITIES.items():
        candidates = list(RAW.glob(f'*{locator}*.csv'))
        if len(candidates) != 1:
            raise ValueError(f'Expected one source for {city}, found {len(candidates)}')
        path = candidates[0]
        with path.open(encoding='utf-8-sig') as handle:
            source = handle.read()
        if '-END HEADER-' not in source:
            raise ValueError(f'Not a NASA POWER data export: {path}')
        start = source.index('PARAMETER,YEAR,')
        lines = source[start:].splitlines()
        rows = list(csv.DictReader(lines))
        for row in rows:
            if row['PARAMETER'] not in METRICS:
                continue
            year = int(row['YEAR'])
            if not 2001 <= year <= 2025:
                continue
            for month, code in enumerate(MONTH_COLUMNS, start=1):
                value = float(row[code])
                if value <= -990 or not math.isfinite(value):
                    raise ValueError(f'Missing/invalid input: {city} {year}-{month} {row["PARAMETER"]}')
                frames.append({'city':city, 'lat':lat, 'lon':lon, 'year':year, 'month':month,
                    'parameter': row['PARAMETER'], 'value':value, 'days': calendar.monthrange(year,month)[1]})
    raw = pd.DataFrame(frames)
    expected = len(CITIES)*25*12*len(METRICS)
    if len(raw) != expected:
        raise ValueError(f'Expected {expected} monthly measurements, got {len(raw)}')
    if raw.duplicated(subset=['city','year','month','parameter']).any():
        raise ValueError('Duplicate monthly measurement')
    return raw


def series_for(raw: pd.DataFrame, city: str, code: str, period: str):
    df = raw[(raw.city == city)&(raw.parameter == code)].copy()
    if period == 'annual':
        df['period_year'] = df['year']
    elif period == 'winter':
        df = df[df.month.isin([12,1,2])]
        df['period_year'] = df['year'] + (df['month']==12).astype(int)
    else:
        df = df[df.month.isin(SEASONS[period]['months'])]
        df['period_year'] = df['year']
    result = []
    n_months = len(SEASONS[period]['months'])
    for year, group in df.groupby('period_year'):
        if len(group) != n_months or not 2001 <= year <= 2025:
            continue
        if METRICS[code]['type'] == 'total':
            value = float((group.value * group.days).sum())
        else:
            value = float(np.average(group.value,weights=group.days))
        result.append({'year': int(year), 'value': round(value,5)})
    return result


def mann_kendall(values):
    """Two-sided normal-approximation MK with tie-corrected variance (no autocorrelation adjustment)."""
    arr = np.asarray(values, dtype=float)
    n = len(arr)
    s = sum(int(np.sign(arr[j]-arr[i])) for i in range(n-1) for j in range(i+1,n))
    _, counts = np.unique(arr, return_counts=True)
    var = (n*(n-1)*(2*n+5) - sum(int(t*(t-1)*(2*t+5)) for t in counts if t>1))/18
    if var <= 0:
        return 1.0
    z = ((s-1) if s>0 else ((s+1) if s<0 else 0)) / math.sqrt(var)
    return float(2*norm.sf(abs(z)))


def benjamini_hochberg(pvals):
    """Adjusted q-values for a fixed family of simultaneous tests."""
    p = np.asarray(pvals, dtype=float)
    order = np.argsort(p)
    result = np.zeros(len(p), dtype=float)
    running = 1.0
    for rank_idx in range(len(order)-1,-1,-1):
        k = rank_idx+1
        j = order[rank_idx]
        running = min(running, float(p[j])*len(p)/k)
        result[j] = min(1.0, running)
    return result.tolist()


def main():
    raw = read_raw()
    rows = []
    monthly = []
    for city in CITIES:
        cd = raw[raw.city == city]
        for (year, month), group in cd.groupby(['year','month']):
            item = {'city': city, 'year': int(year), 'month': int(month)}
            item.update({r.parameter: round(float(r.value),4) for r in group.itertuples()})
            monthly.append(item)
        for code in METRICS:
            for period in SEASONS:
                points = series_for(raw,city,code,period)
                x = np.asarray([p['year'] for p in points], dtype=float)
                y = np.asarray([p['value'] for p in points], dtype=float)
                if len(x) < 15:
                    raise ValueError(f'Insufficient years: {city}/{code}/{period}')
                slope, intercept, lo, hi = theilslopes(y,x,alpha=.95)
                p = mann_kendall(y)
                rows.append({
                    'city':city, 'metric':code, 'period':period, 'n':len(points),
                    'first_year':points[0]['year'], 'last_year':points[-1]['year'],
                    'slope_year':round(float(slope), 6),
                    'slope_decade':round(float(slope)*10, 5),
                    'ci_low_decade':round(float(lo)*10,5), 'ci_high_decade':round(float(hi)*10,5),
                    'p':round(p,9), 'mean':round(float(np.mean(y)),4),
                    'start_value':round(float(y[0]),4), 'end_value':round(float(y[-1]),4),
                    'points':points,
                })
    for code in METRICS:
        for period in SEASONS:
            family = [r for r in rows if r['metric']==code and r['period']==period]
            q = benjamini_hochberg([r['p'] for r in family])
            for row, qval in zip(family,q):
                row['q'] = round(qval,9)
                row['significant'] = bool(qval<.05)
    significant = sum(r['significant'] for r in rows if r['period']=='annual')
    dataset = {
        'project': 'Earth System Trend Detective',
        'source': {'name':'NASA POWER Data Access Viewer', 'url':'https://power.larc.nasa.gov/data-access-viewer/',
                   'data_start':2001,'data_end':2025,'time_standard':'UTC',
                   'precipitation_note': 'The supplied NASA POWER CSVs label IMERG_PRECTOT as MERRA-2 Total Precipitation; retain the exported code and verify product lineage before making instrument-specific claims.',
                   'caveats':['Five point samples, not national coverage or a gridded trend map.',
                              'All results are exploratory observational associations, not evidence of causes.',
                              'Annual observations are assumed independent for Mann–Kendall p-values; serial correlation may affect inference.',
                              'False-discovery correction applies across five cities within each variable and period, not across every dashboard test.',
                              'NASA POWER samples are gridded estimates rather than observations at exact street locations.']},
        'cities':[{'name':name,'lat':lat,'lon':lon} for name,(_,lat,lon) in CITIES.items()],
        'metrics':METRICS,'periods':SEASONS,'results':rows,'monthly':monthly,
        'summary':{'monthly_rows':len(monthly), 'tested_series':len(rows), 'significant_annual_tests':significant}
    }
    # Site only needs annual/seasonal series; keep full monthly values in monthly_clean.csv.
    webdata = {k:v for k,v in dataset.items() if k!='monthly'}
    for row in webdata['results']:
        # Series are consecutive whole years; first_year allows reconstruction in JS.
        row['points'] = [point['value'] for point in row['points']]
    packed = json.dumps(webdata,separators=(',',':'),ensure_ascii=False)
    (OUT/'results.json').write_text(packed,encoding='utf-8')
    # Chunk text so GitHub and code-indexing tools can read the bundle in safe line lengths.
    chunks = [packed[i:i+800] for i in range(0,len(packed),800)]
    js = 'window.TREND_DATA=JSON.parse([\n' + ',\n'.join(json.dumps(part,ensure_ascii=False) for part in chunks) + '\n].join(""));\n'
    (OUT/'results.js').write_text(js,encoding='utf-8')
    pd.DataFrame([{k:v for k,v in r.items() if k!='points'} for r in rows]).to_csv(OUT/'trend_results.csv', index=False)
    pd.DataFrame(monthly).to_csv(OUT/'monthly_clean.csv',index=False)
    print('Source measurements:', len(raw),'Monthly city rows:', len(monthly),'Trend analyses:',len(rows))
    print('Significant annual trends after per-variable FDR:', significant)
    for row in sorted([r for r in rows if r['period']=='annual' and r['metric']=='T2M'],key=lambda x:x['city']):
        print(row['city'],f"temp {row['slope_decade']:+.3f} °C/decade p={row['p']:.4g} q={row['q']:.4g}")

if __name__ == '__main__':
    main()