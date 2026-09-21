"""Allowlisted OKX trading-account data for the local dashboard."""
from __future__ import annotations

import math


def number(value):
    """Unknown exchange fields stay unknown; they are never displayed as zero."""
    try:
        value=float(value)
    except (TypeError,ValueError):
        return None
    return value if math.isfinite(value) else None


def account_view(balance,positions,orders,algos,owned,pending,as_of,fee_rate):
    details=balance.get('details')
    if not isinstance(details,list):
        raise ValueError('OKX 資產明細未完整回傳，保留上次資料並停止新進場')
    assets=[]
    for row in details:
        assets.append(dict(currency=row.get('ccy',''),equity=number(row.get('eq')),
            cash_balance=number(row.get('cashBal')),available=number(row.get('availBal')),
            frozen=number(row.get('frozenBal')),equity_usd=number(row.get('eqUsd')),
            unrealized_pnl=number(row.get('upl'))))
    assets.sort(key=lambda r:(r['equity_usd'] is None,-abs(r['equity_usd'] or 0),r['currency']))
    usdt=next((r for r in assets if r['currency']=='USDT'),None)
    displayed_positions=[]
    for row in positions:
        quantity=number(row.get('pos'))
        expected=number(owned['contracts'])*(1 if owned['side']=='long' else -1) if owned else None
        managed=bool(owned and row.get('instId')==owned['symbol'] and quantity==expected
            and (not owned.get('pos_id') or row.get('posId')==owned['pos_id']))
        displayed_positions.append(dict(symbol=row.get('instId',''),instrument_type=row.get('instType',''),
            quantity=quantity,side=row.get('posSide'),margin_mode=row.get('mgnMode'),
            leverage=number(row.get('lever')),entry_price=number(row.get('avgPx')),
            mark_price=number(row.get('markPx')),unrealized_pnl=number(row.get('upl')),
            margin=number(row.get('margin')),currency=row.get('ccy',''),
            liquidation_price=number(row.get('liqPx')),managed=managed))
    displayed_orders=[]
    for row in orders+algos:
        managed=bool(pending and row.get('clOrdId')==pending['client_id'] or
            owned and row.get('algoClOrdId') and row.get('algoClOrdId')==owned['algo_client_id'])
        displayed_orders.append(dict(symbol=row.get('instId',''),instrument_type=row.get('instType',''),
            side=row.get('side'),order_type=row.get('ordType',''),state=row.get('state',''),
            quantity=number(row.get('sz')),filled=number(row.get('accFillSz')),
            price=number(row.get('px')),stop=number(row.get('slTriggerPx')),
            target=number(row.get('tpTriggerPx')),managed=managed))
    return dict(demo=True,connected=True,source='OKX Demo · Trading account',as_of=as_of,
        exchange_updated_ms=number(balance.get('uTime')),total_equity_usd=number(balance.get('totalEq')),
        available_usdt=usdt['available'] if usdt else 0.,equity_usdt=usdt['equity'] if usdt else 0.,
        assets=assets,positions=displayed_positions,orders=displayed_orders,
        orders_scope='一般委託與 OCO／條件停損止盈，每類最多 100 筆',
        orders_may_be_truncated=len(orders)>=100 or len(algos)>=100,
        fee_bps=fee_rate*10000)
