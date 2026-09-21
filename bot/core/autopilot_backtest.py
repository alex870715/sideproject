"""Single-timeframe, three-symbol portfolio replay using the live decision policy."""
from __future__ import annotations
import hashlib
import json
import time
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Literal
import httpx
from core.autopilot_policy import AutoConfig, HORIZONS, SYMBOLS, POLICY_VERSION, evaluate, size_order
from core.okx_market import _parse_candle

class ReplayConfig(AutoConfig):
    horizon:Literal['short','medium','long']='medium'
    days:Literal[7,30,90]=30
    style:Literal['careful','balanced','active']='balanced'
    allow_short:bool=True


def download(config,progress):
    h=HORIZONS[config.horizon]
    end=int(time.time())//h['seconds']*h['seconds']
    start=end-config.days*86400
    earliest=start-100*h['seconds']
    data,specs,funding={},{},{}
    with httpx.Client(base_url='https://www.okx.com',timeout=15) as client:
        def get(path,params):
            for attempt in range(3):
                r=client.get(path,params=params)
                if r.status_code not in (429,502,503,504):break
                time.sleep(.4*(attempt+1))
            r.raise_for_status()
            obj=r.json()
            if obj.get('code')!='0':raise ValueError('OKX 歷史資料暫時不可用')
            return obj.get('data') or []
        for symbol in SYMBOLS:
            raw=get('/api/v5/public/instruments',{'instType':'SWAP','instId':symbol})
            if not raw:raise ValueError('缺少合約規格')
            specs[symbol]=raw[0]
            rows,cursor={},None
            for _ in range(105):
                params={'instId':symbol,'bar':h['bar'],'limit':'100'}
                if cursor:params['after']=str(cursor)
                batch=get('/api/v5/market/history-candles',params)
                if not batch:break
                for row in batch:
                    t=int(row[0])//1000
                    if row[8]=='1' and earliest<=t<end:rows[t]=row
                oldest=min(int(row[0]) for row in batch)
                progress(f"下載 {symbol.split('-')[0]} {h['bar']} K 線 · {len(rows):,} 根")
                if oldest//1000<=earliest or cursor is not None and oldest>=cursor:break
                cursor=oldest
            bars=[_parse_candle(rows[t],symbol) for t in sorted(rows)]
            if not bars or int(bars[0].timestamp.timestamp())!=earliest or int(bars[-1].timestamp.timestamp())!=end-h['seconds']:
                raise ValueError(f'{symbol} 資料未覆蓋整段期間與預熱，請縮短期間')
            if any((b.timestamp-a.timestamp).total_seconds()!=h['seconds'] for a,b in zip(bars,bars[1:])):
                raise ValueError('歷史 K 線有缺口，停止產出績效')
            for b in bars:
                if any(not v.is_finite() or v<=0 for v in [b.open,b.high,b.low,b.close]) or not b.volume.is_finite() or b.volume<0 or b.low>min(b.open,b.close) or b.high<max(b.open,b.close):
                    raise ValueError('K 線價格資料不一致')
            data[symbol]=bars
            rates,cursor={},None
            for _ in range(30):
                params={'instId':symbol,'limit':'100'}
                if cursor:params['after']=str(cursor)
                batch=get('/api/v5/public/funding-rate-history',params)
                if not batch:break
                for row in batch:rates[int(row['fundingTime'])]=float(row.get('realizedRate') or row['fundingRate'])
                oldest=min(int(row['fundingTime']) for row in batch)
                if oldest<=start*1000 or cursor is not None and oldest>=cursor:break
                cursor=oldest
            if not rates or min(rates)>start*1000:
                raise ValueError('歷史資金費率未覆蓋起始時間，請縮短回測期間')
            funding[symbol]=sorted((t/1000,r) for t,r in rates.items())
    return data,specs,funding,100


def simulate(config,data,specs,funding,start_index=100):
    cfg=AutoConfig(**config.model_dump(exclude={'days'}))
    symbols=list(data)
    n=min(len(data[s]) for s in symbols)
    if n<=start_index+1:raise ValueError('樣本不足')
    cash=cfg.budget;position=None;pending=[];trades=[];curve=[];cooldowns={}
    peak=cash;max_dd=0;fees=0;funding_net=0;day=None;day_start=cash;day_opens=0;day_halt=False;halt=False
    interval=HORIZONS[config.horizon]['seconds']
    rate_cursor={s:0 for s in symbols};latest_rate={s:None for s in symbols}
    def finish(price,t,reason):
        nonlocal cash,position,fees
        sign=position['sign'];fill=price*(1-sign*.0005)
        close_fee=position['qty']*fill*.0005
        gross=(fill-position['entry'])*position['qty']*sign
        cash+=gross-close_fee;fees+=close_fee
        trades.append(dict(symbol=position['symbol'],side='long' if sign==1 else 'short',tactic=position['tactic'],
            entry_time=position['time'],exit_time=datetime.fromtimestamp(t,timezone.utc).isoformat(),
            entry=position['entry'],exit=fill,pnl=gross-close_fee-position['fee']+position['funding'],reason=reason,
            leverage=cfg.leverage,margin=position['margin'],notional=position['qty']*position['entry']))
        cooldowns[position['symbol']]=t+3*interval
        position=None
    for i in range(start_index,n):
        t=data[symbols[0]][i].timestamp.timestamp()
        # Fees settle at actual historical funding times, while the position exists.
        for s in symbols:
            rates=funding[s]
            while rate_cursor[s]<len(rates) and rates[rate_cursor[s]][0]<=t:
                ft,rate=rates[rate_cursor[s]]
                latest_rate[s]=rate
                if position and position['symbol']==s and ft>position['opened_at']:
                    charge=-position['qty']*float(data[s][i].open)*rate*position['sign']
                    cash+=charge;position['funding']+=charge;funding_net+=charge
                rate_cursor[s]+=1
        open_equity=cash
        if position:
            open_equity+=(float(data[position['symbol']][i].open)-position['entry'])*position['qty']*position['sign']
        current_day=datetime.fromtimestamp(t,timezone(timedelta(hours=8))).date().isoformat()
        if current_day!=day:day=current_day;day_start=open_equity;day_opens=0;day_halt=False
        if peak-open_equity>=cfg.budget*cfg.limits['max_drawdown_pct']/100:halt=True
        if day_start-open_equity>=cfg.budget*cfg.limits['daily_loss_pct']/100:day_halt=True
        exited_at_open=False
        if position and (i-position['index']>=HORIZONS[config.horizon]['hold_bars'] or day_halt or halt):
            finish(float(data[position['symbol']][i].open),t,'持倉到期 / 風控')
            exited_at_open=True
        if not position and not exited_at_open and not halt and not day_halt and day_opens<cfg.limits['max_trades']:
            if i>0:
                pending=[evaluate(data[s][max(0,i-100):i],config.horizon,config.allow_short) for s in symbols]
            candidates=[p for p in pending if p['signal'] and t>=cooldowns.get(p['symbol'],0)]
            if candidates:
                signal=max(candidates,key=lambda x:x['score']);s=signal['symbol'];sign=1 if signal['side']=='long' else -1
                price=float(data[s][i].open)*(1+sign*.0005)
                rate=latest_rate[s]
                if rate is not None and rate*sign<=.0005 and abs(price-signal['price'])<=signal['atr']*.6:
                    try:plan=size_order(signal,specs[s],cfg,cash,price)
                    except ValueError:pass
                    else:
                        qty=float(Decimal(plan['contracts'])*Decimal(plan['ct_val']))
                        entry_fee=qty*price*.0005
                        cash-=entry_fee;fees+=entry_fee;day_opens+=1
                        position=dict(symbol=s,sign=sign,qty=qty,entry=price,fee=entry_fee,funding=0,margin=plan['margin'],
                            stop=float(plan['stop']),target=float(plan['target']),tactic=signal['tactic'],
                            index=i,opened_at=t,time=datetime.fromtimestamp(t,timezone.utc).isoformat())
        if position:
            s=position['symbol']
            rates=funding[s]
            # OHLC does not reveal intrabar exit time; conservatively settle all funding
            # within the candle before testing its stop/target, at the candle open proxy.
            while rate_cursor[s]<len(rates) and rates[rate_cursor[s]][0]<t+interval:
                ft,rate=rates[rate_cursor[s]]
                latest_rate[s]=rate
                if ft>position['opened_at']:
                    charge=-position['qty']*float(data[s][i].open)*rate*position['sign']
                    cash+=charge;position['funding']+=charge;funding_net+=charge
                rate_cursor[s]+=1
            b=data[position['symbol']][i];o,h,l=map(float,[b.open,b.high,b.low]);sign=position['sign']
            if sign==1 and l<=position['stop'] or sign==-1 and h>=position['stop']:
                finish(min(o,position['stop']) if sign==1 else max(o,position['stop']),t+interval,'停損')
            elif sign==1 and h>=position['target'] or sign==-1 and l<=position['target']:
                finish(position['target'],t+interval,'止盈')
        equity=cash+( (float(data[position['symbol']][i].close)-position['entry'])*position['qty']*position['sign'] if position else 0 )
        peak=max(peak,equity);max_dd=max(max_dd,(peak-equity)/peak*100)
        if peak-equity>=cfg.budget*cfg.limits['max_drawdown_pct']/100:halt=True
        if day_start-equity>=cfg.budget*cfg.limits['daily_loss_pct']/100:day_halt=True
        if position and (halt or day_halt or i==n-1):
            finish(float(data[position['symbol']][i].close),t+interval,'風控停止' if halt or day_halt else '期末平倉')
            equity=cash
            max_dd=max(max_dd,(peak-equity)/peak*100)
        curve.append(dict(t=datetime.fromtimestamp(t+interval,timezone.utc).isoformat(),equity=equity))
    wins=[x['pnl'] for x in trades if x['pnl']>0];losses=[x['pnl'] for x in trades if x['pnl']<0]
    return dict(final_equity=cash,return_pct=(cash/cfg.budget-1)*100,max_drawdown_pct=max_dd,total_trades=len(trades),
        win_rate=len(wins)/len(trades)*100 if trades else None,profit_factor=sum(wins)/-sum(losses) if losses else None,
        fees=fees,funding=funding_net,trades=trades,curve=curve,halted=halt)


def run_backtest(config,progress=lambda s:None):
    data,specs,funding,first=download(config,progress)
    progress(f'重播策略決策與資金費率，計算 {config.budget:g} USDT / {config.leverage}× 組合績效…')
    full=simulate(config,data,specs,funding,first)
    count=len(next(iter(data.values())))
    holdout=simulate(config,data,specs,funding,first+(count-first)*7//10)
    warnings=[f'單週期、三幣共用 {config.budget:g} USDT、逐倉 {config.leverage} 倍、最多一個部位；不是跨週期自動選擇的完整回測。',
        '與 Demo 使用相同訊號及部位規則；歷史按下一根開盤成交，雙邊費用與滑價各假設 5 bps。',
        '資金費率採歷史實際結算；盤中結算以該區間價格估算，進場過濾以當時最近已結算費率代替預測值。',
        '使用目前合約最小下單量；未模擬過往規格變動、委託簿、部分成交與強平。',
        '以交易價格 K 線近似標記價格停損；同根停損與止盈皆觸及採停損優先。盤中出場時間未知，該根內費率先結算再判斷出場。',
        f'後段 30% 重新建立 {config.budget:g} USDT 帳本；反覆調參會破壞驗證獨立性。',
        '槓桿提高名目額度，但單筆風險上限不變。以初始保證金 70% 作停損緩衝，未重現維持保證金級距或強平，不能據此評估高槓桿尾端風險。']
    if full['total_trades']<30:warnings.append('少於 30 筆交易，樣本不足，不據此認定策略有效。')
    if holdout['return_pct']<=0:warnings.append('後段驗證未獲利，先檢查行情適用性，不增加預算。')
    digest=hashlib.sha256(json.dumps({s:[[str(b.timestamp),str(b.open),str(b.high),str(b.low),str(b.close),str(b.volume)] for b in bars] for s,bars in data.items()}).encode()).hexdigest()
    return dict(config=config.model_dump(),version=POLICY_VERSION,generated_at=datetime.now(timezone.utc).isoformat(),
        data_sha256=digest,result=full,holdout={k:v for k,v in holdout.items() if k not in ('curve','trades')},warnings=warnings)
