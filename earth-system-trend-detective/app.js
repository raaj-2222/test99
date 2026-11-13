/* TerraScope: client-side exploration of reproducible, precomputed NASA POWER analyses.
   No user credentials, API keys, cookies, tracking, or external data requests.
   Map tiles, fonts and Chart.js are public CDN dependencies. */
(() => {
  'use strict';
  const D = window.TREND_DATA;
  if (!D) {
    document.querySelector('.hero p').textContent = 'Data bundle not loaded. Run python scripts/build_data.py to generate data/results.js.';
    return;
  }
  // The committed data bundle packs each annual series as values only.
  D.results.forEach(r => {r.points = r.points.map((value,i) => ({year:r.first_year+i,value}));});
  const $ = id => document.getElementById(id);
  const cities = D.cities.map(c => c.name);
  const keys = Object.keys(D.metrics);
  const seasons = Object.keys(D.periods);
  const DEFAULT = {metric:'T2M_MIN',period:'annual',city:'Guwahati',compare:'Leh',significant:false};
  const state = {...DEFAULT};
  const lookup = new Map(D.results.map(r => [`${r.city}|${r.metric}|${r.period}`,r]));
  const get = (city=state.city,metric=state.metric,period=state.period) => lookup.get(`${city}|${metric}|${period}`);
  let chart = null, map = null, markers = [];
  const color = r => r.slope_decade >= 0 ? '#80f2d0' : '#efa76e';
  const sign = v => v > 0 ? '+' : v < 0 ? '−' : '';
  const absNum = (v,d=2) => Number(Math.abs(v)).toFixed(d);
  const number = (v,d=2) => `${sign(v)}${absNum(v,d)}`;
  const fmtP = x => x < .0001 ? '<0.0001' : Number(x).toFixed(4);
  const unit = () => D.metrics[state.metric].unit;
  const fmtSlope = r => `${number(r.slope_decade, D.metrics[state.metric].precision===0?0:2)} ${unit()}`;
  const escapeHtml = str => String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const opt = (val,text) => {const o=document.createElement('option');o.value=val;o.textContent=text;return o;};
  const median = a => {const sorted=[...a].sort((x,y)=>x-y);const mid=Math.floor(sorted.length/2);return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;};

  function setupInputs(){
    keys.forEach(k => $('metricSelect').appendChild(opt(k,D.metrics[k].name)));
    seasons.forEach(k => $('periodSelect').appendChild(opt(k,`${D.periods[k].name} · ${D.periods[k].description}`)));
    cities.forEach(k => {$('citySelect').appendChild(opt(k,k));$('compareSelect').appendChild(opt(k,k));});
    ['metric','period','city','compare'].forEach(name => {
      const el = $(`${name}Select`);
      el.addEventListener('change',()=>{
        state[name] = el.value;
        if (name==='city' && state.city===state.compare) state.compare=cities.find(c=>c!==state.city);
        if (name==='compare' && state.city===state.compare) state.city=cities.find(c=>c!==state.compare);
        update();
      });
    });
    $('significantOnly').addEventListener('change',e=>{state.significant=e.target.checked;update();});
    $('resetBtn').addEventListener('click',()=>{Object.assign(state,DEFAULT);update();});
    $('downloadBtn').addEventListener('click',downloadCurrentCSV);
    $('briefBtn').addEventListener('click',downloadBrief);
    $('jumpContrast').addEventListener('click',()=>{
      if(!lastContrast)return;
      state.city=lastContrast.a.city;state.compare=lastContrast.b.city;
      update();document.querySelector('.analytics-grid').scrollIntoView({behavior:'smooth',block:'start'});
    });
  }
  function syncInputs(){
    ['metric','period','city','compare'].forEach(name => $(`${name}Select`).value=state[name]);
    $('significantOnly').checked=state.significant;
  }
  function setupMap(){
    if(!window.L){$('mapFallback').hidden=false;$('map').style.height='120px';$('map').textContent='Interactive map unavailable; use city selectors and the table below.';return;}
    map=L.map('map',{scrollWheelZoom:false,zoomControl:false,attributionControl:true}).setView([23.6,80.5],5);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{
      maxZoom:17,attribution:'&copy; OpenStreetMap contributors &copy; CARTO'
    }).addTo(map);
    L.control.zoom({position:'bottomright'}).addTo(map);
    map.fitBounds([[12.5,71],[35.2,93]],{padding:[25,25]});
  }
  function updateMap(){
    if(!map)return;
    markers.forEach(m=>map.removeLayer(m));markers=[];
    D.cities.forEach(location=>{
      const r=get(location.name);
      const selected=location.name===state.city;
      const radius=selected?14:9;
      const strong=r.significant;
      const marker=L.circleMarker([location.lat,location.lon],{
        radius,color:color(r),weight:selected?3:2,
        fillColor:color(r),fillOpacity: state.significant && !strong ? .06 : strong ? .65 : .12,
        opacity:state.significant && !strong ? .45 : 1,
      }).addTo(map);
      marker.bindTooltip(`${escapeHtml(location.name)} · ${escapeHtml(fmtSlope(r))}/decade · q ${fmtP(r.q)}`);
      marker.bindPopup(`<strong>${escapeHtml(location.name)}</strong><br/>${escapeHtml(D.metrics[state.metric].short)}: ${escapeHtml(fmtSlope(r))}/decade<br/>FDR q ${fmtP(r.q)} · ${r.significant?'Significant':'Not significant'}<br/><small>NASA POWER sample point</small>`);
      marker.on('click',()=>{if(state.city!==location.name){state.city=location.name;if(state.city===state.compare)state.compare=cities.find(c=>c!==state.city);update();}});
      markers.push(marker);
    });
    $('mapCaption').textContent = state.significant ? 'Muted markers did not pass FDR q < 0.05. Every point remains selectable.' : 'Marker colors show Sen slope direction. Solid centers pass FDR q < 0.05; outlined points do not.';
  }
  function updateChart(){
    const a=get(),b=get(state.compare);
    const seriesA=a.points, byYearB=new Map(b.points.map(p=>[p.year,p.value]));
    const years=seriesA.map(p=>p.year);
    const intercept=median(seriesA.map(p=>p.value-a.slope_year*p.year));
    $('chartTitle').textContent=`${state.city} vs ${state.compare}`;
    $('chartSubtitle').textContent=`${D.metrics[state.metric].name} · ${D.periods[state.period].name} · ${a.first_year}–${a.last_year}`;
    $('seriesUnit').textContent=unit();
    $('trendStatus').textContent=a.significant?'● FDR SIGNIFICANT':'○ NOT SIGNIFICANT';
    $('trendStatus').classList.toggle('confirmed',a.significant);
    $('slopeValue').textContent=`${fmtSlope(a)}`;
    $('intervalValue').textContent=`${number(a.ci_low_decade)} to ${number(a.ci_high_decade)}`;
    $('qValue').textContent=fmtP(a.q);
    if(!window.Chart){$('chartFallback').hidden=false;return;}
    if(chart)chart.destroy();
    chart = new Chart($('trendChart').getContext('2d'),{
      type:'line',
      data:{labels:years.map(String),datasets:[
        {label:state.city,data:seriesA.map(p=>p.value),borderColor:'#80f2d0',backgroundColor:'#80f2d0',pointRadius:2.3,pointHoverRadius:5,borderWidth:2,tension:.16},
        {label:state.compare,data:years.map(y=>byYearB.get(y)??null),borderColor:'#efa76e',backgroundColor:'#efa76e',pointRadius:1.8,pointHoverRadius:5,borderWidth:1.7,tension:.16},
        {label:'Sen trend',data:years.map(y=>intercept+a.slope_year*y),borderColor:'#ecf4f6',borderDash:[6,5],pointRadius:0,borderWidth:1.5,tension:0},
      ]},
      options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{backgroundColor:'#172c38',titleColor:'#eaf3f7',bodyColor:'#d2e1e8',borderColor:'#355464',borderWidth:1,callbacks:{label:ctx=>` ${ctx.dataset.label}: ${ctx.parsed.y==null?'—':ctx.parsed.y.toFixed(2)} ${unit()}`}}},scales:{x:{ticks:{color:'#718d9c',maxTicksLimit:8,font:{size:10}},grid:{display:false},border:{color:'#375060'}},y:{title:{display:true,text:unit(),color:'#88a5b4',font:{size:9}},ticks:{color:'#718d9c',font:{size:10}},grid:{color:'#253847'},border:{display:false}}}}
    });
  }
  function updateRanking(){
    const res=cities.map(city=>get(city)).sort((a,b)=>b.slope_decade-a.slope_decade);
    const peak=Math.max(1e-9,...res.map(r=>Math.abs(r.slope_decade)));
    $('rankUnit').textContent=`${unit()} / DECADE`;
    $('rankingBars').innerHTML='';
    res.forEach(r=>{
      const row=document.createElement('div');row.className='rank-row';row.tabIndex=0;row.setAttribute('role','button');row.setAttribute('aria-label',`Inspect ${r.city}, trend ${fmtSlope(r)} per decade`);
      const pct=Math.abs(r.slope_decade)/peak*49;
      const left=r.slope_decade>=0?50:50-pct;
      row.innerHTML=`<span class="rank-label">${escapeHtml(r.city)}</span><div class="rank-track"><div class="rank-bar ${r.significant?'':'weak'}" style="left:${left}%;width:${Math.max(.75,pct)}%;background:${color(r)}"></div></div><span class="rank-value">${escapeHtml(number(r.slope_decade))} ${escapeHtml(unit())}</span>`;
      const choose=()=>{state.city=r.city;if(state.city===state.compare)state.compare=cities.find(c=>c!==state.city);update();};
      row.addEventListener('click',choose);row.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();choose();}});
      $('rankingBars').appendChild(row);
    });
  }
  function updateTable(){
    const body=$('evidenceBody');body.innerHTML='';
    cities.map(city=>get(city)).sort((a,b)=>b.slope_decade-a.slope_decade).forEach(r=>{
      const tr=document.createElement('tr');tr.className=r.city===state.city?'selected':'';
      tr.innerHTML=`<td><strong>${escapeHtml(r.city)}</strong></td><td style="color:${color(r)}">${escapeHtml(fmtSlope(r))}</td><td>${escapeHtml(number(r.ci_low_decade))} to ${escapeHtml(number(r.ci_high_decade))}</td><td>${fmtP(r.p)}</td><td>${fmtP(r.q)}</td><td><span class="mini-badge ${r.significant?'good':''}">${r.significant?'Significant':'Not significant'}</span></td>`;
      tr.tabIndex=0;
      tr.addEventListener('click',()=>{state.city=r.city;if(state.city===state.compare)state.compare=cities.find(c=>c!==state.city);update();});
      tr.addEventListener('keydown',ev=>{if(ev.key==='Enter'){tr.click();}});
      body.appendChild(tr);
    });
    $('evidenceNote').textContent=`Trend unit: ${unit()} per decade. 95% interval: Sen slope estimate. p: Mann–Kendall (independence assumed). q: FDR adjusted across these five locations only, for ${D.metrics[state.metric].short.toLowerCase()} / ${D.periods[state.period].name.toLowerCase()}.`;
  }
  let lastContrast=null;
  function updateContrast(){
    const r=cities.map(city=>get(city));
    const pos=r.filter(d=>d.slope_decade>0);
    const neg=r.filter(d=>d.slope_decade<0);
    const importance = x => (x.significant?15:0)+Math.min(10,Math.abs(x.slope_decade)/(Math.max(.01,Math.abs(x.mean)))*100);
    let a,b,headline,desc,confidence;
    if(pos.length && neg.length){
      a=[...pos].sort((x,y)=>importance(y)-importance(x))[0];
      b=[...neg].sort((x,y)=>importance(y)-importance(x))[0];
      headline=`${a.city} rises. ${b.city} falls.`;
      const both=a.significant&&b.significant;
      desc=`The ${D.metrics[state.metric].short.toLowerCase()} series moves in opposite directions in these two places. ${both?'Both pass the five-site FDR screen.':'At least one direction does not pass the five-site FDR screen, so this contrast is exploratory.'}`;
      confidence=both?'Both directional trends pass FDR q < 0.05':'Directional contrast, not confirmed for both cities';
    }else{
      const ranked=[...r].sort((x,y)=>y.slope_decade-x.slope_decade);
      a=ranked[0];b=ranked[ranked.length-1];
      headline='Same direction? Different pace.';
      desc=`Across these five point samples, a clear opposite-direction pair is absent for ${D.metrics[state.metric].short.toLowerCase()} in this period. Compare the largest and smallest slopes instead; unequal slopes do not by themselves prove a difference.`;
      confidence='No opposite-direction pair among the five sites';
    }
    lastContrast={a,b};
    $('contrastHeadline').textContent=headline;
    $('contrastDescription').textContent=desc;
    $('contrastConfidence').textContent=confidence;
    $('contrastSites').innerHTML=[a,b].map(r=>`<div class="contrast-site"><span>${escapeHtml(r.city)}</span><b class="${r.slope_decade>=0?'rise':'fall'}">${escapeHtml(fmtSlope(r))}<small> / decade</small></b><small>FDR q ${fmtP(r.q)} · ${r.significant?'significant':'not significant'}</small></div>`).join('');
  }
  function updateKpis(){
    $('kpiSites').textContent=String(D.cities.length).padStart(2,'0');
    $('kpiRecords').textContent=D.summary.monthly_rows.toLocaleString('en-IN');
    $('kpiTests').textContent=D.summary.tested_series.toLocaleString('en-IN');
    const count=cities.map(city=>get(city)).filter(r=>r.significant).length;
    $('kpiConfirmed').textContent=String(count).padStart(2,'0')+' / 05';
    $('kpiConfirmedCaption').textContent=`FDR q < 0.05 · ${D.periods[state.period].name.toLowerCase()}`;
  }
  function update(){syncInputs();updateKpis();updateMap();updateChart();updateContrast();updateRanking();updateTable();}
  function blobDownload(contents,filename,type){
    const url=URL.createObjectURL(new Blob([contents],{type}));
    const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  function downloadCurrentCSV(){
    const header=['city','metric','period','n','start_year','end_year','sen_slope_per_decade','unit','ci_low_per_decade','ci_high_per_decade','mk_p_value','fdr_q_value','significant'];
    const rows=cities.map(city=>get(city)).map(r=>[r.city,r.metric,r.period,r.n,r.first_year,r.last_year,r.slope_decade,unit(),r.ci_low_decade,r.ci_high_decade,r.p,r.q,r.significant]);
    const quote=x=>`"${String(x).replaceAll('"','""')}"`;
    blobDownload([header,...rows].map(row=>row.map(quote).join(',')).join('\n'),`terrascope_${state.metric}_${state.period}.csv`,'text/csv;charset=utf-8');
  }
  function downloadBrief(){
    const a=get(),b=get(state.compare);
    const lines=[`# TerraScope — trend case file`,``,`## Question`,`How has ${D.metrics[state.metric].name.toLowerCase()} changed at ${state.city} and ${state.compare} over ${D.periods[state.period].name.toLowerCase()} periods?`,``,`## Data`,`Source: NASA POWER monthly point CSVs (UTC), 2001–2025.`,`Selected months: ${D.periods[state.period].description}.`,``,`## Findings`,`- ${state.city}: Sen slope ${fmtSlope(a)} per decade (95% interval ${number(a.ci_low_decade)} to ${number(a.ci_high_decade)} ${unit()}/decade); Mann–Kendall p=${fmtP(a.p)}, BH FDR q=${fmtP(a.q)}; ${a.significant?'passes':'does not pass'} q<0.05.`,`- ${state.compare}: Sen slope ${fmtSlope(b)} per decade (95% interval ${number(b.ci_low_decade)} to ${number(b.ci_high_decade)} ${unit()}/decade); p=${fmtP(b.p)}, q=${fmtP(b.q)}; ${b.significant?'passes':'does not pass'} q<0.05.`,``,`## Method`, `Annual/seasonal metrics use day-weighted monthly means, except precipitation, which sums monthly mm/day × days. Winter assigns December to the following year. Theil–Sen slopes, tie-corrected Mann–Kendall, and Benjamini–Hochberg FDR across five cities for the selected metric and season.`,``,`## Limitations`,...D.source.caveats.map(c=>`- ${c}`),``,`Dataset: ${D.source.url}`,`Generated by TerraScope; observational trends only.`];
    blobDownload(lines.join('\n'),`terrascope_case_${state.metric}_${state.period}.md`,'text/markdown;charset=utf-8');
  }
  setupInputs();setupMap();update();
})();