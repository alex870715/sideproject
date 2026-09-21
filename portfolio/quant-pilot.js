(() => {
  let dataset;
  let horizon='short';
  const $=id=>document.getElementById(id);
  const n=(x,d=2)=>x==null?'—':Number(x).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
  const pct=x=>`${x>=0?'+':''}${n(x)}%`;
  const date=t=>new Date(t).toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit'});
  function render(){
    if(!dataset) return;
    const run=dataset.runs.find(r=>r.config.horizon===horizon),r=run.result;
    $('return').textContent=pct(r.return_pct);$('return').className=r.return_pct>=0?'positive':'negative';
    $('equity').textContent=`期末 ${n(r.final_equity)} USDT`;
    $('drawdown').textContent=`${n(r.max_drawdown_pct)}%`;
    $('trades').textContent=r.total_trades;
    $('winrate').textContent=`勝率 ${n(r.win_rate,1)}% · 樣本有限`;
    $('holdout').textContent=pct(run.holdout.return_pct);$('holdout').className=run.holdout.return_pct>=0?'positive':'negative';
    $('holdout-trades').textContent=`${run.holdout.total_trades} 筆交易 · 重新初始化資金`;
    $('fees').textContent=`${n(r.fees)} USDT`;$('funding').textContent=`${n(r.funding)} USDT`;$('profit-factor').textContent=n(r.profit_factor);
    $('run-status').textContent=r.halted?'回撤門檻觸發 · 已停止進場':'歷史模擬 · 完整期間';$('run-status').className=r.halted?'halted':'';
    let title,explanation;
    if(r.halted){title='回撤觸發風控，先檢查適用行情。';explanation='回撤停機有生效；需先檢查策略適用的行情與成本。這份回測沒有支持提高預算的證據。';}
    else if(r.return_pct>0 && run.holdout.return_pct>0){title='區間與後段為正，仍需更多資料。';explanation=`${r.total_trades} 筆交易、${n(r.max_drawdown_pct)}% 最大回撤；單次正報酬不能據此推論未來收益。`;}
    else{title='這組設定尚未證明優勢。';explanation='完整區間或後段驗證未獲利。需要更多不同市場期間，確認成本後表現是否穩定。';}
    $('verdict-title').textContent=title;$('verdict').textContent=explanation;
    document.querySelector('.research-context').textContent=`共用模擬本金 ${n(run.config.budget,0)} USDT · ${run.config.leverage}× 槓桿設定 · ${{careful:'保守',balanced:'均衡',active:'積極'}[run.config.style]}風格 · BTC / ETH / SOL 永續合約 · 最多 1 個部位`;
    $('as-of').textContent=`研究快照 / ${new Date(run.generated_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})} 台灣時間`;
    const curve=run.curve,values=curve.map(p=>p.equity),budget=run.config.budget;
    const low=Math.min(budget,...values),high=Math.max(budget,...values),pad=Math.max((high-low)*.13,2),min=low-pad,max=high+pad;
    const compact=matchMedia("(max-width:760px)").matches;
    const w=compact?380:1000,h=compact?225:245,x0=compact?45:62,x1=w-18,y0=12,y1=h-28;
    const y=v=>y1-(v-min)/(max-min)*(y1-y0);
    const points=values.map((v,i)=>`${(x0+i/(values.length-1)*(x1-x0)).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
    const color=r.return_pct>=0?'#79e3df':'#f29a9e';
    const ticks=[0,.25,.5,.75,1].map(t=>{const v=min+t*(max-min),yy=y(v);return `<line x1="${x0}" y1="${yy}" x2="${x1}" y2="${yy}" stroke="#232c38"/><text x="${x0-12}" y="${yy+4}" text-anchor="end" fill="#a2a9b5" font-size="12" font-family="monospace">${n(v,0)}</text>`;}).join('');
    $('equity-chart').innerHTML=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${horizon==='short'?'短線':horizon==='medium'?'中線':'長線'}策略權益曲線；淨報酬 ${pct(r.return_pct)}，最大回撤 ${n(r.max_drawdown_pct)}%"><defs><linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${color}" stop-opacity=".16"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>${ticks}<line x1="${x0}" y1="${y(budget)}" x2="${x1}" y2="${y(budget)}" stroke="#9aabc5" stroke-dasharray="4 5" opacity=".6"/><polygon points="${x0},${y1} ${points} ${x1},${y1}" fill="url(#equity-fill)"/><polyline points="${points}" stroke="${color}" fill="none" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
    $('range').textContent=`${date(curve[0].t)} → ${date(curve[curve.length-1].t)} · ${run.config.days} 天`;
    $('replay-content').setAttribute('aria-busy','false');
  }
  async function load(){
    $('load-error').hidden=true;$('replay-content').setAttribute('aria-busy','true');
    try{const res=await fetch('data/quant-pilot.json');if(!res.ok)throw Error();dataset=await res.json();render();}
    catch{$('load-error').hidden=false;$('replay-content').setAttribute('aria-busy','false');$('as-of').textContent='研究資料尚未載入';}
  }
  document.querySelectorAll('[data-horizon]').forEach(b=>b.addEventListener('click',()=>{horizon=b.dataset.horizon;document.querySelectorAll('[data-horizon]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();}));
  $('retry').addEventListener('click',load);
  try{if(window.QUANT_PILOT_OWNER_URL){const url=new URL(window.QUANT_PILOT_OWNER_URL);if(url.protocol==='https:'&&!url.username&&!url.password){$('owner-link').href=url.origin;$('owner-link').hidden=false;}}}catch{}
  matchMedia('(max-width:760px)').addEventListener('change',render);
  load();
})();
