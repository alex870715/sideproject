"""Shared, deterministic strategy selection and budget sizing for OKX demo."""
from __future__ import annotations

import math
from decimal import Decimal, ROUND_DOWN, ROUND_UP
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field
from strategies.indicators import sma, atr, adx, rsi, stddev

SYMBOLS = ('BTC-USDT-SWAP', 'ETH-USDT-SWAP', 'SOL-USDT-SWAP')
HORIZONS = {
    'short': dict(label='短線', bar='15m', seconds=900, hold_bars=32, description='15 分鐘判斷，最長持有 8 小時'),
    'medium': dict(label='中線', bar='1H', seconds=3600, hold_bars=48, description='1 小時判斷，最長持有 2 天'),
    'long': dict(label='長線', bar='4H', seconds=14400, hold_bars=42, description='4 小時判斷，最長持有 7 天'),
}
STYLES = {
    'careful': dict(label='保守', risk_pct=.5, exposure_pct=50, daily_loss_pct=2, max_drawdown_pct=6, max_trades=4),
    'balanced': dict(label='均衡', risk_pct=.75, exposure_pct=65, daily_loss_pct=3, max_drawdown_pct=8, max_trades=6),
    'active': dict(label='積極', risk_pct=1, exposure_pct=80, daily_loss_pct=4, max_drawdown_pct=10, max_trades=8),
}
TACTICS = {
    'pullback': dict(label='順勢回踩', description='趨勢成立後，回踩均線再轉強；下跌趨勢可反向做空。'),
    'breakout': dict(label='放量突破', description='突破區間且量能確認，避免單憑價格追高。'),
    'reversion': dict(label='區間回歸', description='僅在低趨勢盤整，偏離後出現反轉才進場。'),
}
POLICY_VERSION = 'demo-auto-v2'


class AutoConfig(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    budget: float = Field(default=100, ge=20, strict=True)
    leverage: int = Field(default=1, ge=1, le=20, strict=True)
    style: Literal['careful', 'balanced', 'active'] = 'balanced'
    horizon: Literal['auto', 'short', 'medium', 'long'] = 'auto'
    allow_short: bool = True

    @property
    def limits(self):
        return STYLES[self.style]


def catalog():
    return dict(horizons=HORIZONS, styles=STYLES, tactics=TACTICS, version=POLICY_VERSION,
                defaults=AutoConfig().model_dump(), symbols=SYMBOLS)


def evaluate(bars, horizon, allow_short=True):
    """Closed candles only. Score is rule priority, NOT a win probability."""
    h = HORIZONS[horizon]
    base = dict(horizon=horizon, bar=h['bar'], tactic=None, side=None, score=0,
                regime='資料不足', reason='等待至少 80 根完整 K 線', signal=False)
    if len(bars) < 80:
        return base
    bars = bars[-100:]
    b, prev = bars[-1], bars[-2]
    closes = [x.close for x in bars]
    fast, slow, old_slow = sma(closes, 20), sma(closes, 60), sma(closes[:-3], 60)
    volatility = atr([x.high for x in bars], [x.low for x in bars], closes, 14)
    strength = adx([x.high for x in bars], [x.low for x in bars], closes, 14)
    relative = rsi(closes, 14)
    dev = stddev(closes[:-1], 20)
    previous_mean = sma(closes[:-1], 20)
    c = float(b.close)
    base.update(symbol=b.symbol, candle_ms=int(b.timestamp.timestamp()*1000), price=c,
                atr=volatility, adx=strength, rsi=relative, hold_seconds=h['seconds']*h['hold_bars'])
    if not all(math.isfinite(v) for v in [c, volatility, strength, relative, dev]) or c <= 0:
        return dict(base, reason='指標資料無效')
    if volatility / c > .05 or volatility / c < .001:
        return dict(base, regime='極端波動' if volatility/c>.05 else '低波動', reason='波幅不適合目前的成本與風險預算')
    up = c > slow and fast > slow and slow > old_slow
    down = c < slow and fast < slow and slow < old_slow
    base.update(regime='上升趨勢' if up and strength>=22 else '下跌趨勢' if down and strength>=22 else '盤整',
                reason='行情已更新，等待進場條件同時成立')
    volume = sum(float(x.volume) for x in bars[-21:-1])/20
    volume_ratio = float(b.volume)/volume if volume else 0
    side, tactic, score, reason = None, None, 0, base['reason']
    if strength >= 22:
        if up and c > max(float(x.high) for x in bars[-21:-1]) and volume_ratio >= 1.3:
            side,tactic,score,reason='long','breakout',85,'上升趨勢突破前 20 根高點，成交量至少為均量 1.3 倍'
        elif down and c < min(float(x.low) for x in bars[-21:-1]) and volume_ratio >= 1.3:
            side,tactic,score,reason='short','breakout',85,'下跌趨勢跌破前 20 根低點，成交量確認'
        elif up and min(float(x.low) for x in bars[-4:]) <= fast and c > fast and c > float(prev.high) and 45 <= relative <= 70:
            side,tactic,score,reason='long','pullback',75,'上升均線結構成立，回踩後突破前根高點'
        elif down and max(float(x.high) for x in bars[-4:]) >= fast and c < fast and c < float(prev.low) and 30 <= relative <= 55:
            side,tactic,score,reason='short','pullback',75,'下降均線結構成立，反彈後跌破前根低點'
    elif strength < 20 and dev > 0:
        if float(prev.close) < previous_mean-1.8*dev and c > float(prev.close) and relative < 42:
            side,tactic,score,reason='long','reversion',60,'低趨勢區間跌出下緣後收回，尋找均值回歸'
        elif float(prev.close) > previous_mean+1.8*dev and c < float(prev.close) and relative > 58:
            side,tactic,score,reason='short','reversion',60,'低趨勢區間漲出上緣後回落，尋找均值回歸'
    if side == 'short' and not allow_short:
        return dict(base, reason='出現做空條件，但目前設定只做多')
    return dict(base, side=side, tactic=tactic, score=score, reason=reason, signal=side is not None,
                stop_distance=max(volatility*(1.8 if tactic=='reversion' else 2.2),c*.004),
                reward_r=1.5 if tactic=='reversion' else 2.2)


def size_order(signal, spec, config, equity, price, fee_rate=.0005, slip_rate=.0005):
    """Isolated margin cap and independent stop-risk cap; never round lots up."""
    D=lambda v:Decimal(str(v))
    if spec.get('ctType') != 'linear' or spec.get('settleCcy') != 'USDT' or spec.get('state') != 'live':
        raise ValueError('合約規格不支援，略過交易')
    if not all(math.isfinite(v) for v in (price,equity,fee_rate,slip_rate)) or price <= 0 or min(fee_rate,slip_rate)<0:
        raise ValueError('價格無效')
    if spec.get('lever') and config.leverage > float(spec['lever']):
        raise ValueError('設定槓桿超過此合約允許的倍率')
    usable = max(0, min(equity, config.budget))
    margin_cap = usable*(config.limits['exposure_pct']/100)
    risk = min(usable*(config.limits['risk_pct']/100), usable*.01)
    sign = 1 if signal['side']=='long' else -1
    tick, lot, ct = D(spec['tickSz']), D(spec['lotSz']), D(spec['ctVal'])
    if min(tick,lot,ct,D(spec['minSz'])) <= 0:
        raise ValueError('合約規格無效')
    def round_price(value, direction):
        return (D(value)/tick).to_integral_value(rounding=direction)*tick
    stop = round_price(price-sign*signal['stop_distance'], ROUND_DOWN if sign==1 else ROUND_UP)
    target = round_price(price+sign*signal['stop_distance']*signal['reward_r'], ROUND_DOWN if sign==1 else ROUND_UP)
    distance = abs(price-float(stop))
    costs = price*2*(fee_rate+slip_rate)
    if min(stop,target) <= 0 or costs > distance*.3:
        raise ValueError('預估來回交易成本超過停損距離的 30%，等待更好的機會')
    # A conservative margin buffer, not an exchange liquidation-price model.
    if (distance+costs)/price > .7/config.leverage:
        raise ValueError('停損距離相對槓桿過大，保證金緩衝不足；請降低槓桿或等待較低波動')
    units = min(risk/(distance+costs), margin_cap/(price/config.leverage+costs))
    contracts = (D(units)/ct/lot).to_integral_value(rounding=ROUND_DOWN)*lot
    if D(spec.get('maxMktSz') or '0') > 0:
        contracts=min(contracts,(D(spec['maxMktSz'])/lot).to_integral_value(rounding=ROUND_DOWN)*lot)
    if contracts < D(spec['minSz']):
        raise ValueError('目前預算與風險設定低於最小下單量；不放大部位湊單')
    notional = float(contracts*ct)*price
    return dict(contracts=str(contracts), ct_val=str(ct), stop=str(stop), target=str(target),
                leverage=config.leverage, notional=notional, margin=notional/config.leverage,
                estimated_risk=float(contracts*ct)*(distance+costs),
                estimated_cost=float(contracts*ct)*costs, reference=price)
