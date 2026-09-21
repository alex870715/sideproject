(() => {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const visuals = {
    'chow-it': '<div class="food-orbit"><span>今天吃什麼？</span><div class="food-plate">喬<span>一餐</span></div><i class="food-chip chip-a">口味配對</i><i class="food-chip chip-b">讓選擇變簡單 ↗</i></div>',
    'earth-online': '<div class="map-grid"><div class="planet"></div><span class="map-pin pin-a">＋</span><span class="map-pin pin-b">＋</span><span class="map-caption">YOUR WORLD, UNLOCKED.</span></div>',
    'plant': '<div class="trip-visual"><div class="trip-line"></div><div class="trip-stop"><b>01</b><span>一起出發<small>PLAN THE JOURNEY</small></span></div><div class="trip-stop"><b>02</b><span>各自探索<small>FIND YOUR OWN PATH</small></span></div><div class="trip-stop"><b>03</b><span>再一起集合<small>MEET & SHARE</small></span></div></div>',
    'stock-oracle': '<div class="stock-visual"><span>RESEARCH BEFORE ACTION</span><div class="stock-bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="stock-labels"><b>STRATEGY</b><b>RISK</b><b>PORTFOLIO</b></div></div>'
  };
  const category = {'chow-it':'life','plant':'life','earth-online':'explore','stock-oracle':'explore'};
  const copy = {'chow-it':'從口味偏好到聚餐選擇，把「隨便，都可以」變成大家都滿意的一餐。','earth-online':'把走過的路，變成逐步解鎖的世界。用地圖、迷霧與成就重新認識日常。','plant':'一起規劃，也保留各自的探索空間。讓團體旅行的路線與協作更清楚。','stock-oracle':'用多策略選股、回測與持股健檢，讓資產研究有可以追溯的判斷依據。'};
  const grid = document.getElementById('project-grid');
  const projects = window.PORTFOLIO?.projects || [];
  grid.innerHTML = projects.map((p,i) => `<article class="project-card" data-category="${category[p.id]}"><a class="project-visual ${esc(p.id)}" ${p.enabled?`href="${esc(p.href)}" target="_blank" rel="noopener noreferrer"`:'aria-disabled="true"'} aria-label="${esc(p.hrefLabel)}">${visuals[p.id] || ''}<span class="visual-index">0${i+2}</span><span class="visual-arrow">↗</span></a><div class="project-card-body"><div class="card-top"><h3>${esc(p.name)}</h3><span>${esc(p.tag)}</span></div><p>${esc(copy[p.id] || p.description)}</p><div class="card-bottom"><div class="tags">${p.stack.slice(0,3).map(s=>`<span>${esc(s)}</span>`).join('')}</div>${p.enabled?`<a class="text-link" href="${esc(p.href)}" target="_blank" rel="noopener noreferrer">開啟作品 ↗<span class="sr-only"> ${esc(p.name)}</span></a>`:'<span class="muted">整理中</span>'}</div></div></article>`).join('');
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b===button)));
    document.querySelectorAll('[data-category]').forEach(card => {card.hidden=button.dataset.filter!=='all' && card.dataset.category!==button.dataset.filter;});
  }));
  fetch('data/quant-pilot.json').then(r=>{if(!r.ok) throw Error(); return r.json();}).then(data=>{
    const run=data.runs.find(r=>r.config.horizon==='short');
    document.getElementById('preview-equity').innerHTML=`${run.result.final_equity.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} <small>USDT · 歷史模擬</small>`;
    const values=run.curve.map(p=>p.equity),min=Math.min(...values),max=Math.max(...values),range=max-min||1;
    const points=values.map((v,i)=>`${(i/(values.length-1)*600).toFixed(1)},${(140-(v-min)/range*112).toFixed(1)}`).join(' ');
    document.getElementById('preview-chart').innerHTML=`<svg viewBox="0 0 600 175" role="img" aria-label="短線歷史模擬權益曲線，報酬 ${run.result.return_pct.toFixed(2)}%，最大回撤 ${run.result.max_drawdown_pct.toFixed(2)}%"><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#66e2e8" stop-opacity=".19"/><stop offset="1" stop-color="#66e2e8" stop-opacity="0"/></linearGradient></defs><path d="M0 45H600M0 90H600M0 135H600" stroke="#26313d" fill="none"/><polygon points="0,175 ${points} 600,175" fill="url(#fill)"/><polyline points="${points}" fill="none" stroke="#66e2e8" stroke-width="2"/></svg>`;
  }).catch(()=>{document.getElementById('preview-chart').textContent='研究資料暫時無法載入，請進入專案重試。';});
})();
