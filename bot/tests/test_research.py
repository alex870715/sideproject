import tempfile
import threading
import unittest
import httpx
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from fastapi.testclient import TestClient
from pydantic import ValidationError
from core.research import ResearchConfig, simulate, catalog, fetch_bars
from core.pump_engine import PumpEngine
from strategies.base_strategy import Bar, BaseStrategy, Signal, SignalAction
from webui.research_server import app


def bars(n=180):
    return [Bar(datetime(2026,1,1,tzinfo=timezone.utc)+timedelta(hours=i), 'BTC-USDT',
        Decimal('100'),Decimal('101'),Decimal('99'),Decimal('100'),Decimal('1000')) for i in range(n)]


class Once(BaseStrategy):
    @classmethod
    def param_meta(cls):
        return {}
    def check_signal(self, bar):
        if len(self.bars)==150:
            return Signal(bar.timestamp,bar.symbol,SignalAction.BUY,bar.close)


class ResearchTests(unittest.TestCase):
    def test_catalog_defaults_valid(self):
        for item in catalog()['strategies']:
            ResearchConfig(strategy=item['key'], params=item['params'])

    def test_reject_bad_parameters(self):
        for kwargs in [dict(params={'fast_ma':0}),dict(params={'fast_ma':1.5}),dict(params={'unknown':1}),
                       dict(risk_pct=float('nan')),dict(days=365,horizon='short'),dict(strategy='FundingReversion')]:
            with self.assertRaises(ValidationError):
                ResearchConfig(**kwargs)

    def test_next_open_and_fees_reconcile(self):
        data=bars()
        data[150]=Bar(data[150].timestamp,'BTC-USDT',Decimal('102'),Decimal('103'),Decimal('101'),Decimal('102'),Decimal('1000'))
        with patch.dict('core.research.PUMP_STRATEGY_REGISTRY',{'HigherLow':Once}):
            r=simulate(ResearchConfig(),data)
        self.assertEqual(r['total_trades'],1)
        t=r['trades'][0]
        self.assertEqual(t['entry_time'],data[150].timestamp.isoformat())
        self.assertAlmostEqual(t['entry'],102*1.0005)
        self.assertAlmostEqual(r['final_equity']-10000,t['pnl'])
        self.assertAlmostEqual(r['total_fees'],t['fees'])
        self.assertLess(t['pnl'],0)

    def test_ambiguous_bar_stop_first(self):
        data=bars()
        data[150]=Bar(data[150].timestamp,'BTC-USDT',Decimal('100'),Decimal('150'),Decimal('50'),Decimal('100'),Decimal('1000'))
        with patch.dict('core.research.PUMP_STRATEGY_REGISTRY',{'HigherLow':Once}):
            r=simulate(ResearchConfig(),data)
        self.assertEqual(r['trades'][0]['reason'],'停損')
        self.assertLess(r['trades'][0]['pnl'],0)

    def test_no_signals_zero_return(self):
        r=simulate(ResearchConfig(),bars())
        self.assertEqual(r['total_trades'],0)
        self.assertEqual(r['return_pct'],0)
        self.assertIsNone(r['win_rate'])

    def test_local_clock_not_global_count(self):
        engine=object.__new__(PumpEngine)
        data=bars()
        engine.market=SimpleNamespace(bars_of=lambda symbol:data)
        engine.bar_interval='1H'
        engine._global_bar_count=100000
        start=engine._bar_clock('BTC-USDT')
        engine._global_bar_count+=1000
        self.assertEqual(engine._bar_clock('BTC-USDT'),start)
        data.append(bars(181)[-1])
        self.assertEqual(engine._bar_clock('BTC-USDT'),start+1)

    def test_profile_rejects_wrong_interval_before_mutation(self):
        engine=object.__new__(PumpEngine)
        engine.bar_interval='1m'
        with self.assertRaises(ValueError):
            engine.set_trading_profile('swing_long')

    def test_api_drafts_validation_and_isolation(self):
        with tempfile.TemporaryDirectory() as root, patch('webui.research_api.STORE',Path(root)), TestClient(app) as client:
            self.assertEqual(client.get('/lab').status_code,200)
            self.assertEqual(client.get('/api/research/catalog').status_code,200)
            self.assertEqual(client.post('/api/research/drafts',json={'risk_pct':20}).status_code,422)
            self.assertEqual(client.post('/api/research/drafts',json={}).status_code,201)
            self.assertEqual(len(client.get('/api/research/saved/drafts').json()),1)
            self.assertEqual(client.get('/api/pump/state').status_code,404)
            self.assertEqual(client.get('/api/research/backtests/missing').status_code,404)

    def test_public_download_coverage_and_gaps(self):
        seconds=3600
        end=int(datetime.now(timezone.utc).timestamp())//seconds*seconds
        rows=[[str((end-i*seconds)*1000),'100','101','99','100','1000','0','0','1']
              for i in range(1,319)]
        original=httpx.Client
        def handler(request):
            self.assertNotIn('OK-ACCESS-KEY',request.headers)
            cursor=int(request.url.params.get('after',str(end*1000)))
            batch=[r for r in rows if int(r[0])<cursor][:100]
            return httpx.Response(200,json={'code':'0','data':batch})
        with patch('core.research.httpx.Client',side_effect=lambda **kw:original(**kw,transport=httpx.MockTransport(handler))):
            loaded,start=fetch_bars(ResearchConfig(days=7))
            self.assertEqual(len(loaded),318)
            self.assertEqual(int(loaded[150].timestamp.timestamp()),start)
            rows.pop(20)
            with self.assertRaisesRegex(ValueError,'缺口'):
                fetch_bars(ResearchConfig(days=7))

    def test_higher_low_rejects_falling_trend(self):
        from strategies.pump.higher_low import HigherLowStrategy
        strategy=HigherLowStrategy('BTC-USDT')
        for i,bar in enumerate(bars(180)):
            price=Decimal(300-i)
            candle=Bar(bar.timestamp,bar.symbol,price,price+1,price-1,price,bar.volume)
            self.assertIsNone(strategy.push_bar(candle))

    def test_backtest_job_failure_and_busy(self):
        started=threading.Event(); release=threading.Event()
        def run(*args):
            started.set();release.wait(3);raise ValueError('資料缺口')
        with patch('webui.research_api.run_research',run), TestClient(app) as client:
            job=client.post('/api/research/backtests',json={}).json()
            self.assertTrue(started.wait(2))
            self.assertEqual(client.post('/api/research/backtests',json={}).status_code,409)
            release.set()
            for _ in range(100):
                result=client.get('/api/research/backtests/'+job['id']).json()
                if result['status']=='failed':break
            self.assertEqual(result['status'],'failed')
            self.assertEqual(result['message'],'資料缺口')

if __name__=='__main__':unittest.main()
