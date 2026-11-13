"""Reproducibility / plausibility tests run with pytest -q."""
import json
import sys
from pathlib import Path
import pytest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from build_data import read_raw, series_for, mann_kendall, benjamini_hochberg, METRICS, CITIES, SEASONS


def test_monthly_inputs_complete():
    data=read_raw()
    assert len(data)==5*25*12*8
    assert not data.value.isna().any()
    assert not data.duplicated(['city','year','month','parameter']).any()


def test_annual_and_winter_coverage():
    data=read_raw()
    for city in CITIES:
        for metric in METRICS:
            assert len(series_for(data,city,metric,'annual'))==25
            assert len(series_for(data,city,metric,'winter'))==24


def test_known_climate_checks():
    data=read_raw()
    mumbai_july=data[(data.city=='Mumbai')&(data.month==7)&(data.parameter=='IMERG_PRECTOT')].value.mean()
    leh_january=data[(data.city=='Leh')&(data.month==1)&(data.parameter=='T2M')].value.mean()
    assert mumbai_july > 5
    assert leh_january < 0


def test_precipitation_is_total_not_mean():
    data=read_raw()
    mumbai=series_for(data,'Mumbai','IMERG_PRECTOT','annual')
    assert all(700 < y['value'] < 6000 for y in mumbai)


def test_mk_and_bh():
    assert mann_kendall([2.0]*25)==1.0
    assert mann_kendall(list(range(25))) < .001
    assert mann_kendall(list(range(24,-1,-1))) < .001
    assert benjamini_hochberg([.01,.02,.5,1.0])==pytest.approx([.04,.04,2/3,1.0])


def test_bundle_shape_and_provenance():
    obj=json.loads((ROOT/'data/results.json').read_text())
    assert obj['summary']['monthly_rows']==1500
    assert len(obj['results'])==200
    assert all(row['n'] in (24,25) for row in obj['results'])
    assert all(row['significant']==(row['q']<.05) for row in obj['results'])
    assert obj['source']['time_standard']=='UTC'
    assert len({(r['city'],r['period'],r['metric']) for r in obj['results']})==200