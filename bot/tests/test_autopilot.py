import copy
import json
import tempfile
import time
import unittest
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from pydantic import ValidationError
from core.autopilot_policy import AutoConfig, evaluate, size_order
from core.demo_autopilot import DemoAutopilot, DemoClient
from core.okx_client import OKXAPIError
from core.autopilot_backtest import ReplayConfig, simulate
from core.autopilot_account import account_view
from strategies.base_strategy import Bar

SPEC=dict(ctType='linear',settleCcy='USDT',state='live',ctVal='1',lotSz='.01',minSz='.01',tickSz='.01',maxMktSz='10000')
SYMBOL='SOL-USDT-SWAP'

def signal():
    return dict(symbol=SYMBOL,side='long',horizon='medium',tactic='pullback',reason='test',hold_seconds=3600,
                stop_distance=2.,reward_r=2.2,atr=2.,price=100.,funding_rate=.0001,score=75,signal=True)

class FakeClient:
    demo=True
    api_key='test-only'
    def __init__(self):
        self.positions=[];self.orders=[];self.writes=[];self.history=[];self.fail_order=False
    def close(self):pass
    def get_account_config(self):return {'posMode':'net_mode'}
    def get_balance(self,*args):return {'totalEq':'99000','details':[{'ccy':'USDT','availBal':'4297','eq':'4297'}]}
    def get_positions(self,*args):return self.positions
    def get_instrument(self,*args):return SPEC.copy()
    def set_leverage(self,**kwargs):
        self.writes.append(('leverage',kwargs))
        return {'lever':str(kwargs['lever']),'mgnMode':kwargs['mgn_mode']}
    def get_funding_rate(self,*args):return {'fundingRate':'.0001'}
    def place_order(self,**kwargs):
        self.writes.append(('order',kwargs))
        if self.fail_order:raise httpx.ReadTimeout('response lost')
        return {'ordId':'42'}
    def cancel_order(self,*args):self.writes.append(('cancel',args))
    def cancel_algo_orders(self,*args,**kwargs):self.writes.append(('cancel_algo',args))
    def _request(self,method,path,params=None,body=None):
        if path.endswith('trade-fee'):return {'data':[{'takerU':'-.0005'}]}
        if path.endswith('positions-history'):return {'data':self.history}
        if path.endswith('orders-pending'):return {'data':[]}
        if path.endswith('orders-algo-pending'):return {'data':[]}
        if path.endswith('/ticker'):return {'data':[{'bidPx':'99.99','askPx':'100.01','ts':str(int(time.time()*1000))}]}
        if path.endswith('/order'):return {'data':self.orders}
        return {'data':[]}

class AutopilotTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.client=FakeClient()
        self.path=Path(self.tmp.name)/'state.json'
        self.bot=DemoAutopilot(self.client,self.path)
        self.bot._sync()
    def tearDown(self):self.tmp.cleanup()

    def test_strategy_budget_never_uses_account_equity(self):
        self.assertEqual(self.bot.ledger()['equity'],100)
        self.assertEqual(self.bot.account['available_usdt'],4297)
        for style in ('careful','balanced','active'):
            c=AutoConfig(style=style)
            p=size_order(signal(),SPEC,c,99000,100)
            self.assertLessEqual(p['notional'],100*c.limits['exposure_pct']/100)
            self.assertLessEqual(p['estimated_risk'],c.limits['risk_pct'])

    def test_full_account_assets_do_not_replace_strategy_budget(self):
        balance=dict(totalEq='94500',uTime='1789634862436',secret='never-expose',details=[
            dict(ccy='BTC',eq='1',cashBal='1',availBal='.8',frozenBal='.2',eqUsd='76400'),
            dict(ccy='ETH',eq='1',availBal='1',eqUsd='2450'),
            dict(ccy='OKB',eq='100',availBal='100',eqUsd='11352.2'),
            dict(ccy='USDT',eq='4297.86',availBal='4200',frozenBal='97.86',eqUsd='4295.20')])
        with patch.object(self.client,'get_balance',return_value=balance) as get:
            self.bot._sync()
        get.assert_called_once_with()
        a=self.bot.snapshot()['account']
        self.assertEqual(a['total_equity_usd'],94500)
        self.assertEqual(a['available_usdt'],4200)
        self.assertEqual(a['equity_usdt'],4297.86)
        self.assertEqual(len(a['assets']),4)
        self.assertEqual(a['assets'][0]['currency'],'BTC')
        self.assertNotIn('secret',a)
        self.assertEqual(self.bot.ledger()['equity'],100)
        self.assertEqual(self.client.writes,[])

    def test_missing_usdt_and_unknown_estimates_are_not_inferred(self):
        a=account_view(dict(details=[dict(ccy='BTC',eq='1',availBal='1',eqUsd='')]),[],[],[],None,None,'now',.0005)
        self.assertEqual(a['available_usdt'],0)
        self.assertIsNone(a['total_equity_usd'])
        self.assertIsNone(a['assets'][0]['equity_usd'])
        self.assertIsNone(a['assets'][0]['frozen'])
        with patch.object(self.client,'get_balance',return_value=dict(details=[dict(ccy='USDT',eq='100',availBal='')])):
            with self.assertRaisesRegex(ValueError,'未回傳可用 USDT'):self.bot._sync()
        self.assertFalse(self.bot.account['connected'])
        self.assertIsNone(self.bot.account['available_usdt'])

    def test_account_timeout_retains_last_values_and_timestamp(self):
        before=copy.deepcopy(self.bot.account)
        with patch.object(self.client,'get_balance',side_effect=httpx.ReadTimeout('timeout')):
            self.bot.tick()
        a=self.bot.snapshot()['account']
        self.assertFalse(a['connected'])
        self.assertEqual(a['as_of'],before['as_of'])
        self.assertEqual(a['assets'],before['assets'])
        self.assertEqual(a['available_usdt'],4297)
        self.assertEqual(self.client.writes,[])

    def test_account_view_shows_ownership_without_account_identifiers(self):
        owned=dict(symbol=SYMBOL,side='short',contracts='2',pos_id='p1',algo_client_id='our-algo')
        pending=dict(client_id='our-order')
        positions=[dict(instId=SYMBOL,pos='-2',posId='p1',instType='SWAP',ccy='USDT',upl='-1.2',uid='private'),
                   dict(instId='BTC-USDT-SWAP',pos='1',posId='p2',instType='SWAP',ccy='USDT')]
        orders=[dict(instId=SYMBOL,clOrdId='our-order',side='buy',sz='2',ordType='market'),
                dict(instId='BTC-USDT',clOrdId='external-order',side='buy',ordType='limit',sz='.01')]
        algos=[dict(instId=SYMBOL,algoClOrdId='our-algo',ordType='oco',slTriggerPx='102')]
        a=account_view(dict(details=[]),positions,orders,algos,owned,pending,'now',.0005)
        self.assertEqual([r['managed'] for r in a['positions']],[True,False])
        self.assertEqual([r['managed'] for r in a['orders']],[True,False,True])
        self.assertEqual(a['positions'][0]['quantity'],-2)
        self.assertEqual(a['positions'][0]['unrealized_pnl'],-1.2)
        self.assertNotIn('uid',a['positions'][0])
        self.assertNotIn('posId',a['positions'][0])

    def test_minimum_lot_never_rounds_up(self):
        with self.assertRaisesRegex(ValueError,'最小下單'):
            size_order(signal(),dict(SPEC,minSz='100'),AutoConfig(),100,100)

    def test_invalid_budget_or_live_client_rejected(self):
        for amount in (0,-100,float('nan'),float('inf')):
            with self.assertRaises(ValidationError):AutoConfig(budget=amount)
        self.client.demo=False
        with self.assertRaises(ValueError):DemoAutopilot(self.client,self.path)
        with self.assertRaises(ValueError):DemoClient(api_key='x',api_secret='x',passphrase='x',demo=False)

    def test_only_demo_header_and_no_retry_of_timeout_write(self):
        calls=[]
        def handler(request):
            calls.append(request)
            self.assertEqual(request.headers['x-simulated-trading'],'1')
            raise httpx.ReadTimeout('lost')
        c=DemoClient(api_key='x',api_secret='x',passphrase='x',demo=True)
        c._client.close();c._client=httpx.Client(base_url='https://www.okx.com',transport=httpx.MockTransport(handler))
        with self.assertRaises(httpx.ReadTimeout):c.place_order(inst_id=SYMBOL,td_mode='isolated',side='buy',ord_type='market',sz='.1')
        self.assertEqual(len(calls),1)
        c.demo=False
        with self.assertRaises(ValueError):c.get_balance()
        c.close()

    def test_unknown_order_persists_across_restart(self):
        self.client.fail_order=True
        with self.assertRaises(httpx.ReadTimeout):self.bot._open(signal())
        intent=json.loads(self.path.read_text())['pending']
        self.assertEqual(intent['action'],'open')
        recovered=DemoAutopilot(self.client,self.path)
        recovered.tick()
        self.assertEqual(recovered.state['pending']['client_id'],intent['client_id'])
        self.assertEqual(len([w for w in self.client.writes if w[0]=='order']),1)
        self.assertFalse(recovered.state['enabled'])

    def test_filled_order_reconciles_once(self):
        self.bot._open(signal())
        p=self.bot.state['pending']
        self.client.orders=[dict(state='filled',accFillSz=p['plan']['contracts'],avgPx='100.01',ordId='42',fee='-.03')]
        self.bot._reconcile(p,[])
        self.assertIsNone(self.bot.state['pending'])
        self.assertEqual(self.bot.state['position']['contracts'],p['plan']['contracts'])
        self.assertEqual(len([w for w in self.client.writes if w[0]=='order']),1)

    def test_foreign_position_blocks_start_and_stop_does_not_close_it(self):
        self.client.positions=[dict(instId=SYMBOL,pos='1',posSide='net',mgnMode='isolated')]
        with self.assertRaises(ValueError):self.bot.start()
        self.bot.stop()
        self.assertEqual(self.client.writes,[])

    def test_pause_keeps_management_and_close_is_reduce_only(self):
        self.bot._open(signal());p=self.bot.state['pending']
        self.client.orders=[dict(state='filled',accFillSz=p['plan']['contracts'],avgPx='100',ordId='42')]
        self.bot._reconcile(p,[])
        pos=self.bot.state['position']
        self.client.positions=[dict(instId=SYMBOL,pos=pos['contracts'],posSide='net',mgnMode='isolated',posId='p1',lever='1')]
        self.bot.state['enabled']=True
        self.bot.pause();self.assertIsNotNone(self.bot.state['position'])
        self.bot._close('test')
        order=self.client.writes[-1][1]
        self.assertTrue(order['reduce_only']);self.assertEqual(order['sz'],pos['contracts'])
        self.assertEqual(order['side'],'sell')

    def test_partial_fill_requests_safe_close(self):
        self.bot._open(signal());p=self.bot.state['pending']
        self.client.orders=[dict(state='canceled',accFillSz='.01',avgPx='100',ordId='42')]
        self.bot._reconcile(p,[])
        self.assertTrue(self.bot.state['stop_requested'])
        self.assertEqual(Decimal(self.bot.state['position']['contracts']),Decimal('.01'))

    def test_history_uses_current_round_trip_not_reused_position_id(self):
        self.bot._open(signal());pending=self.bot.state['pending']
        self.client.orders=[dict(state='filled',accFillSz=pending['plan']['contracts'],avgPx='100',ordId='42')]
        self.bot._reconcile(pending,[]);owned=self.bot.state['position'];owned['pos_id']='reused'
        now=int(time.time()*1000)
        old=dict(cTime=str(now-86400000),uTime=str(now-3600000),direction='long',type='2',realizedPnl='1000',posId='reused')
        new=dict(cTime=str(now),uTime=str(now+1000),direction='long',type='2',realizedPnl='-.12',fee='-.04',fundingFee='-.01',closeAvgPx='99',posId='reused')
        self.client.history=[old,new];self.bot._settle(owned)
        self.assertAlmostEqual(self.bot.ledger()['equity'],99.88)
        self.assertAlmostEqual(self.bot.ledger()['fees'],.04)
        self.assertAlmostEqual(self.bot.ledger()['funding'],-.01)

    def test_hard_drawdown_latches(self):
        self.bot.state['trades']=[dict(realized_pnl=-9)]
        self.bot.state['enabled']=True
        self.assertTrue(self.bot._risk());self.assertTrue(self.bot.state['hard_halt'])
        self.assertFalse(self.bot.state['enabled'])
        with self.assertRaises(ValueError):self.bot.start()

    def test_wrong_key_does_not_reuse_budget_ledger(self):
        self.client.api_key='another-key'
        with self.assertRaisesRegex(ValueError,'不一致'):DemoAutopilot(self.client,self.path)

    def test_setting_blocked_while_running(self):
        self.bot.state['enabled']=True
        with self.assertRaises(ValueError):self.bot.configure(AutoConfig(style='active'))

    def test_no_fixed_budget_ceiling_and_available_balance_still_required(self):
        self.bot.configure(AutoConfig(budget=100000,leverage=20))
        self.assertEqual(self.bot.config.budget,100000)
        with self.assertRaisesRegex(ValueError,'可用 USDT 不足'):self.bot.start()
        self.assertFalse(self.bot.state['enabled'])
        self.assertEqual(self.client.writes,[])

    def test_leverage_validation_shared_by_live_and_replay(self):
        for cls in (AutoConfig,ReplayConfig):
            for leverage in (0,21,1.5,True,'20'):
                with self.assertRaises(ValidationError):cls(leverage=leverage)
            self.assertEqual(cls(leverage=20,budget=2500).budget,2500)
            with self.assertRaises(ValidationError):cls(budget=float('inf'))

    def test_leverage_reduces_margin_without_multiplying_stop_risk(self):
        for side in ('long','short'):
            s=dict(signal(),side=side)
            one=size_order(s,SPEC,AutoConfig(budget=2500),2500,100)
            twenty=size_order(s,SPEC,AutoConfig(budget=2500,leverage=20),2500,100)
            self.assertAlmostEqual(twenty['margin']*20,twenty['notional'])
            self.assertLessEqual(twenty['estimated_risk'],2500*.0075)
            self.assertEqual(twenty['contracts'],one['contracts'])
            self.assertLessEqual(twenty['margin']+twenty['estimated_cost'],2500*.65)
            tight=dict(s,stop_distance=.7)
            one=size_order(tight,SPEC,AutoConfig(budget=2500),2500,100)
            twenty=size_order(tight,SPEC,AutoConfig(budget=2500,leverage=20),2500,100)
            self.assertGreater(twenty['notional'],one['notional'])
            self.assertLessEqual(twenty['estimated_risk'],2500*.0075)

    def test_high_leverage_rejects_wide_stop_and_unsupported_contract(self):
        with self.assertRaisesRegex(ValueError,'緩衝不足'):
            size_order(dict(signal(),stop_distance=4),SPEC,AutoConfig(leverage=20),100,100)
        with self.assertRaisesRegex(ValueError,'合約允許'):
            size_order(signal(),dict(SPEC,lever='10'),AutoConfig(leverage=20),100,100)

    def test_configured_leverage_is_confirmed_and_reconciled(self):
        self.bot.configure(AutoConfig(budget=2500,leverage=20))
        self.bot._open(signal());pending=self.bot.state['pending']
        self.assertEqual(self.client.writes[0][1]['lever'],20)
        self.assertEqual(pending['plan']['leverage'],20)
        self.client.orders=[dict(state='filled',accFillSz=pending['plan']['contracts'],avgPx='100',ordId='42')]
        self.client.positions=[dict(instId=SYMBOL,pos=pending['plan']['contracts'],posSide='net',mgnMode='isolated',posId='p1',lever='20',liqPx='96')]
        self.bot._sync()
        self.assertEqual(self.bot.state['position']['exchange']['lever'],'20')
        self.client.positions[0]['lever']='10'
        with self.assertRaisesRegex(ValueError,'模式與本機器人不一致'):self.bot._sync()

    def test_no_order_if_exchange_did_not_confirm_leverage(self):
        with patch.object(self.client,'set_leverage',return_value={}):
            with self.assertRaisesRegex(ValueError,'未確認'):self.bot._open(signal())
        self.assertIsNone(self.bot.state['pending'])
        self.assertFalse(any(w[0]=='order' for w in self.client.writes))

    def test_liquidation_price_inside_stop_requests_reduce_only_close(self):
        self.bot.configure(AutoConfig(leverage=20))
        self.bot._open(signal());pending=self.bot.state['pending']
        self.client.orders=[dict(state='filled',accFillSz=pending['plan']['contracts'],avgPx='100',ordId='42')]
        self.client.positions=[dict(instId=SYMBOL,pos=pending['plan']['contracts'],posSide='net',mgnMode='isolated',posId='p1',lever='20',liqPx='99')]
        self.bot.tick()
        self.assertEqual(self.bot.state['pending']['action'],'close')
        self.assertTrue(self.client.writes[-1][1]['reduce_only'])
        self.assertFalse(self.bot.state['enabled'])

    def test_legacy_config_and_open_plan_default_to_one(self):
        self.bot.state['config'].pop('leverage')
        self.bot.save()
        recovered=DemoAutopilot(self.client,self.path)
        self.assertEqual(recovered.snapshot()['config']['leverage'],1)

    def test_capital_changes_preserve_profit_return_drawdown_and_halt(self):
        self.bot.state['trades']=[dict(realized_pnl=-5)]
        self.bot.state['hard_halt']=True
        before=self.bot.snapshot()['ledger']
        self.bot.configure(AutoConfig(budget=1000,leverage=20))
        after=self.bot.snapshot()['ledger']
        for key in ('net_pnl','day_pnl','drawdown','return_pct'):
            self.assertAlmostEqual(after[key],before[key])
        self.assertTrue(self.bot.state['hard_halt'])
        self.bot.state['trades'].append(dict(realized_pnl=10))
        self.assertAlmostEqual(self.bot.ledger()['return_pct'],(.95*1005/995-1)*100)
        self.bot.configure(AutoConfig(budget=500))
        self.assertEqual(self.bot.ledger()['net_pnl'],5)
        self.assertEqual(self.bot.snapshot()['ledger']['day_pnl'],5)
        self.bot.save()
        recovered=DemoAutopilot(self.client,self.path)
        self.assertAlmostEqual(recovered.ledger()['return_pct'],self.bot.ledger()['return_pct'])

    def test_replay_custom_budget_return_and_leverage_reconcile(self):
        bars=[Bar(datetime(2026,1,1,tzinfo=timezone.utc)+timedelta(hours=i),SYMBOL,
                  Decimal('100'),Decimal('100.5'),Decimal('99.5'),Decimal('100'),Decimal('1')) for i in range(120)]
        with patch('core.autopilot_backtest.evaluate',return_value=signal()):
            r=simulate(ReplayConfig(budget=2500,leverage=20),{SYMBOL:bars},{SYMBOL:SPEC},{SYMBOL:[(0,.0001)]})
        self.assertGreater(r['total_trades'],0)
        self.assertAlmostEqual(r['final_equity']-2500,sum(t['pnl'] for t in r['trades']))
        self.assertAlmostEqual(r['return_pct'],(r['final_equity']/2500-1)*100)
        self.assertAlmostEqual(r['trades'][0]['margin']*20,r['trades'][0]['notional'])

    def test_replay_reconciles_costs_and_shares_single_budget(self):
        bars=[]
        for i in range(120):
            t=datetime(2026,1,1,tzinfo=timezone.utc)+timedelta(hours=i)
            bars.append(Bar(t,SYMBOL,Decimal('100'),Decimal('100.5'),Decimal('99.5'),Decimal('100'),Decimal('1')))
        s=signal();s.update(candle_ms=0)
        with patch('core.autopilot_backtest.evaluate',return_value=s):
            r=simulate(ReplayConfig(),{SYMBOL:bars},{SYMBOL:SPEC},{SYMBOL:[(0,.0001)]})
        self.assertEqual(r['total_trades'],1)
        self.assertAlmostEqual(r['final_equity']-100,sum(t['pnl'] for t in r['trades']))
        self.assertGreater(r['fees'],0)
        self.assertLess(r['final_equity'],100)

    def test_intrabar_funding_is_included_before_stop(self):
        series=[]
        for i in range(102):
            t=datetime(2026,1,1,tzinfo=timezone.utc)+timedelta(hours=i)
            series.append(Bar(t,SYMBOL,Decimal('100'),Decimal('101'),Decimal('97') if i==100 else Decimal('99'),Decimal('100'),Decimal('1')))
        funding_time=series[100].timestamp.timestamp()+1800
        with patch('core.autopilot_backtest.evaluate',return_value=signal()):
            r=simulate(ReplayConfig(),{SYMBOL:series},{SYMBOL:SPEC},{SYMBOL:[(0,.0001),(funding_time,.01)]})
        self.assertEqual(r['total_trades'],1)
        self.assertLess(r['funding'],0)
        self.assertAlmostEqual(r['final_equity']-100,sum(t['pnl'] for t in r['trades']))

    def test_cleanup_remains_recoverable_after_cancel_failure(self):
        self.bot._open(signal());p=self.bot.state['pending']
        self.client.orders=[dict(state='filled',accFillSz=p['plan']['contracts'],avgPx='100',ordId='42')]
        self.bot._reconcile(p,[]);owned=self.bot.state['position']
        now=int(time.time()*1000)
        self.client.history=[dict(cTime=str(now),uTime=str(now+1),direction='long',type='2',realizedPnl='0',closeAvgPx='100')]
        with patch.object(self.bot,'_cancel_brackets',side_effect=httpx.ReadTimeout('lost')):
            with self.assertRaises(httpx.ReadTimeout):self.bot._settle(owned)
        self.assertIsNone(self.bot.state['position'])
        self.assertEqual(self.bot.state['cleanup']['algo_client_id'],owned['algo_client_id'])
        self.bot._sync()
        self.assertIsNone(self.bot.state['cleanup'])
        self.assertEqual(len(self.bot.state['trades']),1)

    def test_local_api_rejects_cross_origin_and_preserves_read(self):
        from webui.autopilot_server import create_autopilot_app
        class Idle:
            client=FakeClient()
            def tick(self):pass
            def snapshot(self):return {'mode':'demo','status':'paused'}
            def start(self):return {'enabled':True}
        with patch('webui.autopilot_server.STORE',Path(self.tmp.name)),TestClient(create_autopilot_app(Idle)) as client:
            self.assertEqual(client.get('/api/auto/state').status_code,200)
            self.assertEqual(client.post('/api/auto/start',json={},headers={'Origin':'https://foreign.test'}).status_code,403)
            self.assertEqual(client.post('/api/auto/start',content='').status_code,415)
            self.assertEqual(client.post('/api/auto/start',json={}).status_code,200)

if __name__=='__main__':unittest.main()
