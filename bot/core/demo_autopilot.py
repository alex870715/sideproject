"""Durable, demo-only execution. Uses no other account assets as strategy equity."""
from __future__ import annotations

import copy
import hashlib
import json
import os
import threading
import time
import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from pathlib import Path

from dotenv import dotenv_values
from core.okx_client import OKXClient, OKXAPIError
from core.okx_market import _parse_candle
from core.autopilot_policy import AutoConfig, HORIZONS, SYMBOLS, TACTICS, catalog, evaluate, size_order
from core.autopilot_account import account_view
from core.storage import DATA_DIR

ROOT = Path(__file__).resolve().parents[1]
STORE = DATA_DIR/'autopilot'


def stamp():
    return datetime.now(timezone.utc).isoformat()


def taipei_day():
    return datetime.now(timezone(timedelta(hours=8))).date().isoformat()


class DemoClient(OKXClient):
    """Do not retry any write: clOrdId alone does not prevent duplicate filled orders."""
    def __init__(self, **kwargs):
        if kwargs.get('demo') is not True:
            raise ValueError('自動機器人僅支援 OKX Demo')
        kwargs['max_retries']=1
        super().__init__(**kwargs)

    def _request(self, method, path, params=None, body=None):
        if self.demo is not True or self.base_url != 'https://www.okx.com':
            raise ValueError('Demo 交易環境檢查未通過')
        if method != 'GET' and path not in (
            '/api/v5/trade/order', '/api/v5/trade/cancel-order',
            '/api/v5/trade/cancel-algos', '/api/v5/account/set-leverage',
        ):
            raise ValueError('不支援此交易操作')
        return super()._request(method,path,params,body)


def configured_client():
    cfg = {**dotenv_values(ROOT/'.env'), **{k:v for k,v in os.environ.items() if k.startswith('OKX_')}}
    if str(cfg.get('OKX_DEMO','')).lower() != 'true':
        raise ValueError('請明確設定 OKX_DEMO=true；不會自動改用實盤')
    keys={k:cfg.get(v) for k,v in dict(api_key='OKX_API_KEY',api_secret='OKX_API_SECRET',passphrase='OKX_PASSPHRASE').items()}
    if not all(keys.values()):
        raise ValueError('缺少 OKX Demo 金鑰，請在 .env 設定')
    return DemoClient(**keys,demo=True,timeout=10)


class DemoAutopilot:
    def __init__(self, client, path=STORE/'state.json'):
        if client.demo is not True:
            raise ValueError('拒絕實盤帳戶')
        self.client=client
        self.path=Path(path)
        self.lock=threading.RLock()
        self.specs={}
        self.last_scan=0
        self.market=[]
        self.account={}
        self.error=None
        self.last_sync=None
        self.status='connecting'
        self.message='正在連接 OKX 模擬帳戶'
        self.fee_rate=.0005
        self.account_checked=False
        binding=hashlib.sha256(client.api_key.encode()).hexdigest()
        if self.path.exists():
            self.state=json.loads(self.path.read_text())
            self.state['config']=AutoConfig(**self.state['config']).model_dump()
            if self.state.get('account_binding') != binding:
                raise ValueError('金鑰與既有策略帳本不一致，請使用原模擬帳戶')
        else:
            self.state=dict(version=1,account_binding=binding,config=AutoConfig().model_dump(),enabled=False,
                pending=None,position=None,trades=[],events=[],curve=[],seen={},last_exit={},
                peak=100.,day=taipei_day(),day_start=100.,daily_halt=False,hard_halt=False,day_opens=0,created_at=stamp())
            self.save()

    @property
    def config(self):
        return AutoConfig(**self.state['config'])

    def save(self):
        self.path.parent.mkdir(parents=True,exist_ok=True)
        tmp=self.path.with_suffix('.tmp')
        with tmp.open('w') as f:
            json.dump(self.state,f,ensure_ascii=False,allow_nan=False)
            f.flush();os.fsync(f.fileno())
        tmp.replace(self.path)

    def event(self,kind,message):
        events=self.state['events']
        if events and events[-1]['message']==message:
            return
        events.append(dict(t=stamp(),kind=kind,message=message))
        self.state['events']=events[-200:]

    def set_status(self,status,message):
        self.status,self.message=status,message

    def ledger(self):
        realized=sum(t['realized_pnl'] for t in self.state['trades'])
        position=self.state['position']
        live=position.get('exchange',{}) if position else {}
        booked=float(live.get('realizedPnl') or 0)
        unrealized=float(live.get('upl') or 0)
        equity=self.config.budget+realized+booked+unrealized
        fees=sum(t.get('fees',0) for t in self.state['trades'])-float(live.get('fee') or 0)
        funding=sum(t.get('funding',0) for t in self.state['trades'])+float(live.get('fundingFee') or 0)
        return dict(equity=equity,realized_pnl=realized+booked,unrealized_pnl=unrealized,
                    net_pnl=equity-self.config.budget,fees=fees,funding=funding,
                    return_pct=(self.state.get('return_factor',1)*equity/self.state.get('return_base',self.config.budget)-1)*100)

    def snapshot(self):
        with self.lock:
            l=self.ledger()
            l.update(drawdown=max(0,self.state['peak']-l['equity']),day_pnl=l['equity']-self.state['day_start'])
            return copy.deepcopy(dict(mode='demo',status=self.status,message=self.message,error=self.error,
                enabled=self.state['enabled'],last_sync=self.last_sync,config=self.state['config'],
                limits=self.config.limits,account=self.account,ledger=l,market=self.market,
                position=self.state['position'],pending=self.state['pending'],trades=self.state['trades'][-100:],trade_count=len(self.state['trades']),
                events=self.state['events'][-60:],curve=self.state['curve'][-1000:],catalog=catalog(),
                hard_halt=self.state['hard_halt'],daily_halt=self.state['daily_halt']))

    def configure(self,config):
        with self.lock:
            if self.state['enabled'] or self.state['position'] or self.state['pending']:
                raise ValueError('請先暫停，並等待本機器人的持倉與委託結束後調整設定')
            old=self.config.budget
            if config.budget != old:
                before=self.ledger()
                delta=config.budget-old
                equity=before['equity']+delta
                if equity<=0 or before['equity']<=0:
                    raise ValueError('策略權益不足，無法調整預算')
                # Capital flows must not count as profit, daily P&L or drawdown.
                self.state['return_factor']=1+before['return_pct']/100
                self.state['return_base']=equity
                self.state['peak']+=delta
                self.state['day_start']+=delta
                self.state.setdefault('capital_changes',[]).append(dict(t=stamp(),amount=delta,budget=config.budget))
                self.state['curve'].append(dict(t=stamp(),ts=time.time(),equity=equity,capital_change=delta))
                self.event('capital',f'策略預算由 {old:g} 調整為 {config.budget:g} USDT；資金調整不計入損益，報酬按調整前後分段計算')
            self.state['config']=config.model_dump()
            self.event('settings','已更新策略偏好；開始後會依新設定判斷下一筆交易')
            self.last_scan=0
            self.save()
            return self.snapshot()

    def start(self):
        with self.lock:
            self._sync()
            self._risk()
            if self.state['hard_halt']:
                raise ValueError('已達累計回撤上限，此策略已停止；不自動重置損失')
            if self.state['daily_halt'] and self.state['day']==taipei_day():
                raise ValueError('今日虧損上限已觸發，台灣時間隔日再評估')
            if self.state['pending']:
                raise ValueError('尚有委託待確認，請等待帳務同步')
            if self._foreign_positions or self._foreign_orders:
                raise ValueError('帳戶有其他持倉或委託，先處理後再啟動，以免混用部位')
            if self.account['available_usdt'] < self.config.budget:
                raise ValueError('模擬帳戶可用 USDT 不足策略預算')
            self.state['enabled']=True
            self.state['stop_requested']=False
            self.event('start',f'已啟動 {self.config.budget:g} USDT 模擬自動交易，逐倉 {self.config.leverage} 倍、最多 1 個部位')
            self.set_status('watching','自動交易已啟動，等待符合成本與風險條件的訊號')
            self.save()
            return self.snapshot()

    def pause(self):
        with self.lock:
            self.state['enabled']=False
            self.event('pause','已暫停新進場；既有持倉仍持續管理停損、止盈與到期出場')
            self.set_status('paused','已暫停新進場，持倉管理仍持續')
            self.save()
            return self.snapshot()

    def stop(self):
        with self.lock:
            self.state['enabled']=False
            self.state['stop_requested']=True
            self.event('stop','已要求停止並平掉本機器人的持倉；等待交易所確認')
            self.save()
            self._sync()
            if self.state['position'] and not self.state['pending']:
                self._close('手動停止')
            return self.snapshot()

    def _rows(self,path,params=None):
        return self.client._request('GET',path,params=params).get('data') or []

    def _sync(self):
        try:
            self._sync_account()
        except Exception:
            # Retain the last snapshot with its original timestamp, visibly stale.
            self.account['connected']=False
            raise

    def _sync_account(self):
        if self.client.demo is not True:
            raise ValueError('交易環境已變更，拒絕執行')
        if self.state.get('cleanup'):
            self._cancel_brackets(self.state['cleanup'])
            self.state['cleanup']=None
            self.save()
        if not self.account_checked:
            cfg=self.client.get_account_config()
            if cfg.get('posMode') != 'net_mode':
                raise ValueError('目前只支援 OKX 單向持倉 net_mode；不會自動變更帳戶設定')
            for s in SYMBOLS:
                self.specs[s]=self.client.get_instrument(s)
            rates=self._rows('/api/v5/account/trade-fee',{'instType':'SWAP','instFamily':'BTC-USDT'})
            if rates:
                r=rates[0]
                self.fee_rate=max(.0005,abs(float(r.get('takerU') or r.get('taker') or -.0005)))
            self.account_checked=True
        balance=self.client.get_balance()
        positions=[p for p in self.client.get_positions() if Decimal(p.get('pos') or '0') != 0]
        orders=self._rows('/api/v5/trade/orders-pending',{'limit':'100'})
        algos=[]
        for kind in ('oco','conditional'):
            algos+=self._rows('/api/v5/trade/orders-algo-pending',{'ordType':kind,'limit':'100'})
        self.account=account_view(balance,positions,orders,algos,self.state['position'],
            self.state['pending'],stamp(),self.fee_rate)
        if self.account['available_usdt'] is None:
            raise ValueError('OKX 未回傳可用 USDT，暫停新進場，請等待資產同步')
        pending=self.state['pending']
        if pending:
            self._reconcile(pending,positions)
        owned=self.state['position']
        if owned:
            current=next((p for p in positions if p.get('instId')==owned['symbol']),None)
            if current:
                if current.get('mgnMode')!='isolated' or current.get('posSide')!='net' or float(current.get('lever') or 0)!=owned['plan'].get('leverage',1):
                    raise ValueError('持倉模式與本機器人不一致，停止新交易')
                sign=1 if owned['side']=='long' else -1
                if Decimal(current['pos']) != Decimal(owned['contracts'])*sign:
                    raise ValueError('持倉數量被外部操作更動，暫停自動操作，請檢查 OKX')
                if owned.get('pos_id') and owned['pos_id'] != current['posId']:
                    raise ValueError('持倉識別碼不符，暫停自動操作')
                owned['pos_id']=current['posId']
                owned['exchange']={k:current.get(k) for k in ['posId','upl','realizedPnl','fee','fundingFee','avgPx','markPx','margin','pos','lever','liqPx']}
            elif not self.state['pending']:
                self._settle(owned)
        owned=self.state['position']
        self._foreign_positions=[p for p in positions if not owned or p['instId']!=owned['symbol']]
        owned_order=self.state['pending']
        self._foreign_orders=[o for o in orders if not owned_order or o.get('clOrdId') != owned_order['client_id']]
        self._foreign_orders.extend(r for r in algos if not owned or r.get('algoClOrdId') != owned['algo_client_id'])
        # Reconciled ownership may have changed since the initial account read.
        self.account=account_view(balance,positions,orders,algos,owned,owned_order,stamp(),self.fee_rate)
        self.last_sync=stamp()
        l=self.ledger()
        self.state['peak']=max(self.state['peak'],l['equity'])
        if self.state['day']!=taipei_day():
            self.state.update(day=taipei_day(),day_start=l['equity'],daily_halt=False,day_opens=0)
        if not self.state['curve'] or time.time()-self.state['curve'][-1]['ts']>=60:
            self.state['curve'].append(dict(t=stamp(),ts=time.time(),equity=l['equity']))
            self.state['curve']=self.state['curve'][-10000:]

    def _reconcile(self,pending,positions):
        try:
            rows=self._rows('/api/v5/trade/order',{'instId':pending['symbol'],'clOrdId':pending['client_id']})
        except OKXAPIError as exc:
            if exc.code in ('51603','51604'):
                self.state['enabled']=False
                pending['message']='交易所尚未確認委託結果，停止送出新單；持續查詢原委託'
                return
            raise
        if not rows:
            self.state['enabled']=False
            return
        order=rows[0]
        pending['order_id']=order.get('ordId')
        status=order.get('state')
        if status in ('live','partially_filled'):
            if time.time()-pending['sent_at']>30:
                self.client.cancel_order(pending['symbol'],order['ordId'])
            return
        filled=Decimal(order.get('accFillSz') or '0')
        if status not in ('filled','canceled','mmp_canceled'):
            return
        if pending['action']=='open' and filled>0:
            self.state['position']=dict(symbol=pending['symbol'],side=pending['side'],contracts=str(filled),
                entry=float(order.get('avgPx') or pending['plan']['reference']),plan=pending['plan'],
                tactic=pending['tactic'],horizon=pending['horizon'],reason=pending['reason'],
                opened_at=pending['sent_at'],deadline=pending['sent_at']+pending['hold_seconds'],
                client_id=pending['client_id'],order_id=order['ordId'],algo_client_id=pending['algo_client_id'],
                exchange={'realizedPnl':order.get('fee') or '0'},pos_id=None)
            self.event('fill',f"{pending['symbol']} {'做多' if pending['side']=='long' else '做空'} 成交 {filled} 張，策略：{TACTICS[pending['tactic']]['label']}")
            if status!='filled':
                self.state['stop_requested']=True
                self.event('risk','委託僅部分成交，平掉已成交部位以避免未生效的附加保護')
        elif pending['action']=='open':
            self.event('order','進場委託已取消且未成交')
        elif pending['action']=='close':
            self.event('order','平倉委託已確認，等待持倉與費用結算')
        self.state['pending']=None
        self.save()

    def _settle(self,owned):
        params={'instId':owned['symbol'],'limit':'100'}
        if owned.get('pos_id'):params['posId']=owned['pos_id']
        rows=self._rows('/api/v5/account/positions-history',params)
        matches=[r for r in rows if int(r.get('cTime') or 0)>=int(owned['opened_at']*1000)-5000
            and r.get('direction')==owned['side'] and r.get('type') in ('2','3','6')]
        if not matches:
            raise ValueError('部位已不在持倉列表，等待 OKX 歷史帳務確認；暫停新進場')
        row=matches[0]
        record={k:owned[k] for k in ['symbol','side','tactic','horizon','entry','opened_at','reason','contracts','order_id']}
        record.update(closed_at=float(row['uTime'])/1000,exit=float(row.get('closeAvgPx') or 0),
            leverage=owned['plan'].get('leverage',1),
            realized_pnl=float(row['realizedPnl']),fees=-float(row.get('fee') or 0),funding=float(row.get('fundingFee') or 0),
            exit_reason=owned.get('exit_reason','交易所停損 / 止盈'),pos_id=row.get('posId'))
        self.state['trades'].append(record)
        self.state['last_exit'][owned['symbol']]=time.time()
        self.state['position']=None
        self.state['cleanup']={'symbol':owned['symbol'],'algo_client_id':owned['algo_client_id']}
        self.event('closed',f"{owned['symbol']} 已平倉，含費用與資金費率淨損益 {record['realized_pnl']:+.4f} USDT")
        self.save()
        # Only cancel this bot's still-pending bracket, never other account orders.
        self._cancel_brackets(owned)
        self.state['cleanup']=None
        self.save()

    def _brackets(self,owned):
        rows=[]
        for kind in ('oco','conditional'):
            rows+=self._rows('/api/v5/trade/orders-algo-pending',{'ordType':kind,'instId':owned['symbol']})
        return [r for r in rows if r.get('algoClOrdId')==owned['algo_client_id']]

    def _cancel_brackets(self,owned):
        for row in self._brackets(owned):
            self.client.cancel_algo_orders(owned['symbol'],algo_id=row['algoId'])

    def _close(self,reason):
        owned=self.state['position']
        if not owned or self.state['pending']:return
        # Check position identity and quantity immediately before sending reduce-only.
        rows=[p for p in self.client.get_positions(owned['symbol']) if Decimal(p.get('pos') or '0')!=0]
        if not rows:return
        expected=Decimal(owned['contracts'])*(1 if owned['side']=='long' else -1)
        if len(rows)!=1 or Decimal(rows[0]['pos'])!=expected or rows[0].get('mgnMode')!='isolated':
            raise ValueError('平倉前部位檢查不一致，停止自動操作')
        owned['exit_reason']=reason
        intent=dict(action='close',client_id='qa'+uuid.uuid4().hex[:28],symbol=owned['symbol'],sent_at=time.time())
        self.state['pending']=intent
        self.save()
        try:
            result=self.client.place_order(inst_id=owned['symbol'],td_mode='isolated',
                side='sell' if owned['side']=='long' else 'buy',ord_type='market',sz=owned['contracts'],
                reduce_only=True,cl_ord_id=intent['client_id'])
            intent['order_id']=result['ordId']
        except OKXAPIError:
            self.state['pending']=None
            raise
        finally:self.save()

    def _risk(self):
        l=self.ledger();c=self.config
        if self.state['peak']-l['equity'] >= c.budget*c.limits['max_drawdown_pct']/100:
            self.state['hard_halt']=True
            self.state['enabled']=False
        if self.state['day_start']-l['equity'] >= c.budget*c.limits['daily_loss_pct']/100:
            self.state['daily_halt']=True
        halt=self.state['hard_halt'] or self.state['daily_halt']
        if halt:
            self.event('risk','已達虧損上限，停止新進場並關閉本機器人部位')
        return halt

    def _scan(self):
        horizons=list(HORIZONS) if self.config.horizon=='auto' else [self.config.horizon]
        result=[]
        for sym in SYMBOLS:
            funding=self.client.get_funding_rate(sym)
            ticker_rows=self._rows('/api/v5/market/ticker',{'instId':sym})
            ticker=ticker_rows[0] if ticker_rows else {}
            for horizon in horizons:
                h=HORIZONS[horizon]
                rows=self.client.get_candles(sym,h['bar'],limit=100)
                unique={int(r[0]):r for r in rows if len(r)>=9 and r[8]=='1'}
                bars=[_parse_candle(unique[t],sym) for t in sorted(unique)]
                item=evaluate(bars,horizon,self.config.allow_short)
                item['symbol']=sym
                item['funding_rate']=float(funding['fundingRate']) if funding.get('fundingRate') not in (None,'') else None
                item['ticker']=ticker
                if bars:
                    gap=any((b.timestamp-a.timestamp).total_seconds()!=h['seconds'] for a,b in zip(bars,bars[1:]))
                    age=time.time()-(bars[-1].timestamp.timestamp()+h['seconds'])
                    item['fresh']=not gap and -5<=age<=120 and time.time()-float(ticker.get('ts') or 0)/1000<=30
                    if item['signal'] and not item['fresh']:
                        item['reason']='訊號已超過進場時窗；等待下一根收盤重新確認'
                else:item['fresh']=False
                result.append(item)
        self.market=result
        self.last_scan=time.time()

    def _open(self,item):
        c=self.config
        sym=item['symbol']
        # Re-fetch price, positions and pending orders before reserving any budget.
        if any(Decimal(p.get('pos') or '0') for p in self.client.get_positions()):
            raise ValueError('進場前發現既有持倉，略過本次下單')
        external_orders=self._rows('/api/v5/trade/orders-pending',{'instType':'SWAP'})
        for kind in ('oco','conditional'):
            external_orders+=self._rows('/api/v5/trade/orders-algo-pending',{'ordType':kind,'instType':'SWAP'})
        if external_orders:
            raise ValueError('進場前發現其他委託，略過本次下單')
        ticker=self._rows('/api/v5/market/ticker',{'instId':sym})[0]
        if time.time()-float(ticker['ts'])/1000>30:
            raise ValueError('報價過期，略過本次下單')
        bid,ask=float(ticker['bidPx']),float(ticker['askPx'])
        if bid<=0 or ask<=bid or (ask-bid)/bid>.0015:
            raise ValueError('買賣價差過大或報價無效，等待流動性恢復')
        price=ask if item['side']=='long' else bid
        if abs(price-item['price'])>item['atr']*.6:
            raise ValueError('價格已離開訊號區域，不追價')
        rate=item['funding_rate']
        if rate is None or rate*(1 if item['side']=='long' else -1)>.0005:
            raise ValueError('資金費率不利或資料缺失，略過本次交易')
        plan=size_order(item,self.specs[sym],c,self.ledger()['equity'],price,self.fee_rate)
        if plan['margin']+plan['estimated_cost']>self.account['available_usdt']:
            raise ValueError('可用保證金不足')
        leverage=self.client.set_leverage(inst_id=sym,lever=c.leverage,mgn_mode='isolated')
        if float(leverage.get('lever') or 0)!=c.leverage or leverage.get('mgnMode')!='isolated':
            raise ValueError('交易所未確認指定逐倉槓桿，略過下單')
        intent=dict(action='open',symbol=sym,side=item['side'],horizon=item['horizon'],tactic=item['tactic'],
            reason=item['reason'],hold_seconds=item['hold_seconds'],plan=plan,sent_at=time.time(),
            client_id='qa'+uuid.uuid4().hex[:28],algo_client_id='qs'+uuid.uuid4().hex[:28])
        self.state['pending']=intent
        self.state['day_opens']=self.state.get('day_opens',0)+1
        self.save() # Durable intent BEFORE network write. Never blindly resubmit on timeout.
        try:
            result=self.client.place_order(inst_id=sym,td_mode='isolated',side='buy' if item['side']=='long' else 'sell',
                ord_type='market',sz=plan['contracts'],cl_ord_id=intent['client_id'],
                attach_algo_ords=[dict(attachAlgoClOrdId=intent['algo_client_id'],
                    slTriggerPx=plan['stop'],slOrdPx='-1',slTriggerPxType='mark',
                    tpTriggerPx=plan['target'],tpOrdPx='-1',tpTriggerPxType='mark')])
            intent['order_id']=result['ordId']
            self.event('order',f"送出 {sym} 模擬委託，逐倉 {c.leverage} 倍、保證金約 {plan['margin']:.2f} USDT、名目金額約 {plan['notional']:.2f} USDT、風險估算 {plan['estimated_risk']:.2f} USDT")
        except OKXAPIError:
            self.state['pending']=None
            raise
        finally:self.save()

    def tick(self):
        with self.lock:
            try:
                self._sync()
                self.error=None
                halt=self._risk()
                if self.state['pending']:
                    self.set_status('reconciling','委託已記錄，正在向 OKX 確認結果；不會重複送單')
                elif self.state['position']:
                    owned=self.state['position']
                    liq=float(owned.get('exchange',{}).get('liqPx') or 0)
                    stop=float(owned['plan']['stop'])
                    unsafe_liq=liq>0 and (stop<=liq if owned['side']=='long' else stop>=liq)
                    if unsafe_liq:
                        self.state['enabled']=False
                        self.event('risk','交易所預估強平價已越過停損保護範圍，停止進場並減倉平倉')
                        self._close('強平緩衝不足')
                    elif halt or self.state.get('stop_requested') or time.time()>=owned['deadline']:
                        self._close('風控停止' if halt else '手動停止' if self.state.get('stop_requested') else '持倉到期')
                    else:
                        bracket=self._brackets(owned)
                        protected=any(r.get('slTriggerPx') and float(r['slTriggerPx'])>0 for r in bracket)
                        owned['protected']=protected
                        if not protected and time.time()-owned['opened_at']>60:
                            self.event('risk','交易所停損未確認，立即減倉平倉')
                            self._close('停損保護未生效')
                    self.set_status('holding','持倉管理中：交易所停損 / 止盈與到期出場持續生效')
                elif halt:
                    self.set_status('halted','虧損上限已觸發，停止交易')
                elif self._foreign_positions or self._foreign_orders:
                    self.set_status('blocked','偵測到其他持倉或委託，避免混用部位，暫停新進場')
                else:
                    if self.state.get('stop_requested'):
                        self.state['stop_requested']=False
                    if time.time()-self.last_scan>=30:self._scan()
                    if not self.state['enabled']:
                        self.set_status('paused',f'已連接模擬帳戶；按「啟動機器人」開始 {self.config.budget:g} USDT 預算交易')
                    else:
                        todays=self.state.get('day_opens',0)
                        candidates=[]
                        for item in self.market:
                            if not item['signal'] or not item['fresh']:continue
                            key=item['symbol']+':'+item['horizon']
                            if self.state['seen'].get(key)==item['candle_ms']:continue
                            if time.time()-self.state['last_exit'].get(item['symbol'],0)<HORIZONS[item['horizon']]['seconds']*3:continue
                            candidates.append(item)
                        if candidates and todays<self.config.limits['max_trades']:
                            selected=max(candidates,key=lambda x:(x['score'],HORIZONS[x['horizon']]['seconds']))
                            self.state['seen'][selected['symbol']+':'+selected['horizon']]=selected['candle_ms']
                            self.save()
                            try:self._open(selected)
                            except ValueError as exc:
                                self.event('skip',str(exc))
                                self.set_status('watching',str(exc))
                            else:self.set_status('reconciling','已送出模擬委託，等待交易所成交確認')
                        else:
                            reason='今天已達交易次數上限，等待台灣時間隔日' if todays>=self.config.limits['max_trades'] else '持續掃描 BTC、ETH、SOL；目前等待新鮮且符合條件的進場訊號'
                            self.set_status('watching',reason)
            except Exception as exc:
                self.error=str(exc) if isinstance(exc,(ValueError,OKXAPIError)) else 'OKX 連線暫時失敗，保留原委託並等待下次同步'
                self.set_status('error',self.error)
                self.event('error',self.error)
            finally:
                self.save()
