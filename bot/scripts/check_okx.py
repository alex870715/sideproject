"""快速檢查目前 OKX demo 帳戶的狀態 + 一鍵清空所有持倉。

用法：
    python scripts/check_okx.py                # 只看狀態
    python scripts/check_okx.py --flatten      # 看完狀態並把所有 SWAP 持倉平掉
"""

from __future__ import annotations

import argparse
import os
import sys
from decimal import Decimal
from pathlib import Path

# 讓 scripts/ 也能 import 根目錄的 core/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

from core.okx_broker import OKXBroker
from core.okx_client import OKXAPIError, OKXClient


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbol", default=os.getenv("OKX_SYMBOL", "BTC-USDT-SWAP"))
    parser.add_argument("--flatten", action="store_true", help="把所有持倉以 market 平倉")
    args = parser.parse_args()

    load_dotenv()
    api_key = os.environ["OKX_API_KEY"]
    api_secret = os.environ["OKX_API_SECRET"]
    passphrase = os.environ["OKX_PASSPHRASE"]
    demo = os.getenv("OKX_DEMO", "true").lower() != "false"

    client = OKXClient(api_key, api_secret, passphrase, demo=demo)
    print(f"==> OKX {'demo' if demo else 'LIVE'} | symbol={args.symbol}")
    print(f"    ping: {client.ping()}")

    bal = client.get_balance()
    print(f"    totalEq        : {bal.get('totalEq')}")
    usdt = next((d for d in bal.get("details", []) if d.get("ccy") == "USDT"), {})
    print(f"    USDT cashBal   : {usdt.get('cashBal')}")
    print(f"    USDT availBal  : {usdt.get('availBal')}")
    print(f"    USDT availEq   : {usdt.get('availEq')}")
    print(f"    USDT eq        : {usdt.get('eq')}")
    print(f"    USDT frozenBal : {usdt.get('frozenBal')}")
    print(f"    USDT stgyEq    : {usdt.get('stgyEq')}")

    avail = max(
        Decimal(usdt.get("availBal") or "0"),
        Decimal(usdt.get("availEq") or "0"),
    )
    eq = Decimal(usdt.get("eq") or "0")
    frozen = Decimal(usdt.get("frozenBal") or "0")
    stgy = Decimal(usdt.get("stgyEq") or "0")
    if avail <= 0 and eq > 0:
        print()
        print("    ⚠ 無法開 USDT-SWAP：USDT 可用保證金為 0")
        if stgy > 0 or frozen >= eq:
            print(
                "      → USDT 可能在策略子帳或凍結中；"
                "請至 OKX Demo 把 USDT 轉回交易帳，或重置 Demo 帳戶"
            )
        else:
            print("      → 請充值 USDT 或把其它資產換成 USDT")
    elif avail <= 0:
        print()
        print("    ⚠ 無法開 USDT-SWAP：帳戶沒有可用 USDT 保證金")

    positions = client.get_positions()
    print(f"    open positions ({len(positions)}):")
    for p in positions:
        if Decimal(p.get("pos") or "0") == 0:
            continue
        print(
            f"      {p['instId']}  posSide={p.get('posSide')}  pos={p.get('pos')}  "
            f"avgPx={p.get('avgPx')}  upl={p.get('upl')}  lever={p.get('lever')}"
        )

    if args.flatten and positions:
        print()
        print("==> Flattening all positions...")
        broker = OKXBroker(client, symbol=args.symbol, td_mode="isolated")
        broker.refresh_state()
        pos = broker.get_position(args.symbol)
        if pos.is_open:
            try:
                trade = broker.close_position(
                    symbol=args.symbol,
                    price=pos.avg_entry_price,
                    quantity=None,
                )
                print(f"    closed {trade.quantity} {trade.symbol} @ {trade.price}, PnL={trade.realized_pnl}")
            except OKXAPIError as e:
                print(f"    close failed: {e}")
        else:
            print("    no open position to close")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
