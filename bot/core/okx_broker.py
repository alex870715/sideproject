"""OKX V5 永續合約 Broker（demo / 正式）。

Broker 介面：與 LocalBroker 完全相同，所以 Engine 切換時零改動。

關鍵設計：
- 啟動時讀取 instrument 規格（ctVal / lotSz / minSz）並快取，之後做幣 ↔ 合約張數換算。
- 自動偵測帳戶 posMode（net_mode / long_short_mode），下單時帶對應參數。
- 所有 method 都同步阻塞：market order 下單後 poll 至 filled / canceled，再回傳。
- equity / position 直接從 OKX 取，避免本地與 OKX 狀態飄移。

簡化前提（後續可擴充）：
- 一律用 market order。
- tdMode 預設 cross；可建構時覆寫。
- 不做部分成交、不做手動撤單；market 通常會立刻成交。
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from decimal import Decimal, ROUND_DOWN
from typing import Any, Dict, Optional

from core.account import (
    InvalidOrderError,
    OrderSide,
    Position,
    PositionSide,
    Trade,
)
from core.okx_client import OKXAPIError, OKXClient


ZERO = Decimal("0")


class OKXBroker:
    def __init__(
        self,
        client: OKXClient,
        symbol: str,
        td_mode: str = "cross",
        margin_ccy: str = "USDT",
        order_poll_seconds: float = 0.5,
        order_poll_max: int = 60,
    ) -> None:
        self.client = client
        self.symbol = symbol
        self.td_mode = td_mode
        self.margin_ccy = margin_ccy
        self.order_poll_seconds = order_poll_seconds
        self.order_poll_max = order_poll_max

        # 帳戶設定
        cfg = client.get_account_config()
        self.pos_mode: str = cfg.get("posMode", "net_mode")  # 'net_mode' | 'long_short_mode'

        # Instrument 規格
        inst = client.get_instrument(symbol, inst_type="SWAP")
        self.contract_value: Decimal = Decimal(inst.get("ctVal") or "1")
        self.lot_size: Decimal = Decimal(inst.get("lotSz") or "1")
        self.min_size: Decimal = Decimal(inst.get("minSz") or "1")
        self.tick_size: Decimal = Decimal(inst.get("tickSz") or "0.01")

        # 起始狀態
        self._initial_equity: Decimal = ZERO
        self._equity_cache: Decimal = ZERO
        self._position_cache: Dict[str, Position] = {}
        self._trades: list[Trade] = []
        self._realized_pnl: Decimal = ZERO
        self._total_fee: Decimal = ZERO
        self.refresh_state()
        self._initial_equity = self._equity_cache

    # ------------------------------------------------------------------ #
    # 狀態同步
    # ------------------------------------------------------------------ #
    def refresh_state(self) -> None:
        """從 OKX 重新拉取帳戶 / 持倉。每次下單後呼叫。"""
        bal = self.client.get_balance()
        # totalEq 是整個帳戶以 USD 計值的總權益；details 含每個幣種
        try:
            self._equity_cache = Decimal(bal.get("totalEq") or "0")
        except Exception:  # noqa: BLE001
            self._equity_cache = ZERO

        positions = self.client.get_positions(inst_id=self.symbol)
        self._position_cache.clear()
        for p in positions:
            pos_qty_contract = Decimal(p.get("pos") or "0")
            if pos_qty_contract == 0:
                continue
            inst_id = p.get("instId") or self.symbol
            avg_px = Decimal(p.get("avgPx") or "0")

            # net_mode：pos 為含正負號的張數；long_short_mode：posSide 顯示方向，pos 永遠正
            pos_side_str = p.get("posSide") or ""
            if pos_side_str in ("long", "short"):
                side = PositionSide.LONG if pos_side_str == "long" else PositionSide.SHORT
                qty_contracts_abs = pos_qty_contract.copy_abs()
            else:
                if pos_qty_contract > 0:
                    side = PositionSide.LONG
                elif pos_qty_contract < 0:
                    side = PositionSide.SHORT
                else:
                    continue
                qty_contracts_abs = pos_qty_contract.copy_abs()

            qty_coin = qty_contracts_abs * self.contract_value
            self._position_cache[inst_id] = Position(
                symbol=inst_id,
                side=side,
                quantity=qty_coin,
                avg_entry_price=avg_px,
                leverage=int(Decimal(p.get("lever") or "1")),
            )

    # ------------------------------------------------------------------ #
    # Broker 介面
    # ------------------------------------------------------------------ #
    def get_position(self, symbol: str) -> Position:
        if symbol not in self._position_cache:
            self._position_cache[symbol] = Position(symbol=symbol)
        return self._position_cache[symbol]

    def equity(self, mark_prices: Dict[str, Decimal]) -> Decimal:
        # 直接用 OKX 提供的 totalEq；mark_prices 對 OKX 沒意義，但仍接受以對齊介面
        return self._equity_cache

    def open_position(
        self,
        symbol: str,
        side: PositionSide,
        price: Decimal,
        quantity: Decimal,
        timestamp: Optional[datetime] = None,
        is_taker: bool = True,  # noqa: ARG002 — market order 一律 taker
        leverage: int = 1,  # noqa: ARG002 — OKX 槓桿在帳戶層設定
    ) -> Trade:
        if side == PositionSide.FLAT:
            raise InvalidOrderError("Cannot open FLAT position")

        contracts = self._coins_to_contracts(Decimal(quantity))
        if contracts == 0:
            raise InvalidOrderError(
                f"Quantity {quantity} below min_size {self.min_size} (contract value {self.contract_value})"
            )

        order_side = "buy" if side == PositionSide.LONG else "sell"
        pos_side = self._pos_side_for(side)

        result = self.client.place_order(
            inst_id=symbol,
            td_mode=self.td_mode,
            side=order_side,
            ord_type="market",
            sz=str(contracts),
            pos_side=pos_side,
            ccy=self.margin_ccy if self.td_mode == "cross" else None,
        )
        return self._finalize_trade(result, symbol, order_side, timestamp)

    def close_position(
        self,
        symbol: str,
        price: Decimal,
        quantity: Optional[Decimal] = None,
        timestamp: Optional[datetime] = None,
        is_taker: bool = True,  # noqa: ARG002
    ) -> Trade:
        pos = self.get_position(symbol)
        if not pos.is_open:
            raise InvalidOrderError(f"No open position for {symbol}")

        close_qty = Decimal(quantity) if quantity is not None else pos.quantity
        contracts = self._coins_to_contracts(close_qty)
        if contracts == 0:
            raise InvalidOrderError(f"Close qty {close_qty} below min_size")

        # 平多 = sell；平空 = buy
        order_side = "sell" if pos.side == PositionSide.LONG else "buy"
        pos_side = self._pos_side_for(pos.side)

        result = self.client.place_order(
            inst_id=symbol,
            td_mode=self.td_mode,
            side=order_side,
            ord_type="market",
            sz=str(contracts),
            pos_side=pos_side,
            reduce_only=(self.pos_mode == "net_mode"),  # long_short_mode 不需 reduceOnly
            ccy=self.margin_ccy if self.td_mode == "cross" else None,
        )
        return self._finalize_trade(result, symbol, order_side, timestamp, is_close=True)

    def snapshot(self, mark_prices: Optional[Dict[str, Decimal]] = None) -> dict:
        unrealized = {
            sym: pos.unrealized_pnl(
                (mark_prices or {}).get(sym, pos.avg_entry_price)
            )
            for sym, pos in self._position_cache.items()
            if pos.is_open
        }
        return {
            "initial_balance": self._initial_equity,
            "balance": self._equity_cache,  # 用 totalEq 當 balance（OKX 沒有「現金餘額」這種純概念）
            "equity": self._equity_cache,
            "return_pct": (
                (self._equity_cache - self._initial_equity) / self._initial_equity
                if self._initial_equity > 0
                else ZERO
            ),
            "realized_pnl": self._realized_pnl,
            "unrealized_pnl_by_symbol": unrealized,
            "total_unrealized_pnl": sum(unrealized.values(), ZERO),
            "total_fee_paid": self._total_fee,
            "open_positions": {
                sym: {
                    "side": pos.side.value,
                    "quantity": pos.quantity,
                    "avg_entry_price": pos.avg_entry_price,
                    "leverage": pos.leverage,
                }
                for sym, pos in self._position_cache.items()
                if pos.is_open
            },
            "trades_count": len(self._trades),
        }

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #
    def _coins_to_contracts(self, qty_coin: Decimal) -> Decimal:
        """幣的數量 → 合約張數，向下對齊 lot_size；低於 min_size 則回傳 0。"""
        if qty_coin <= 0 or self.contract_value <= 0:
            return ZERO
        contracts = qty_coin / self.contract_value
        if self.lot_size > 0:
            contracts = (contracts / self.lot_size).quantize(
                Decimal("1"), rounding=ROUND_DOWN
            ) * self.lot_size
        if contracts < self.min_size:
            return ZERO
        return contracts

    def _pos_side_for(self, side: PositionSide) -> Optional[str]:
        """根據 posMode 決定要不要送 posSide；net_mode 不送，long_short_mode 一定要送。"""
        if self.pos_mode == "long_short_mode":
            return "long" if side == PositionSide.LONG else "short"
        return None

    def _finalize_trade(
        self,
        place_result: dict,
        symbol: str,
        order_side: str,
        timestamp: Optional[datetime],
        is_close: bool = False,
    ) -> Trade:
        ord_id = place_result.get("ordId")
        if not ord_id:
            raise OKXAPIError("NO_ORD_ID", f"order missing ordId: {place_result}")

        order = self._wait_order_filled(symbol, ord_id)
        avg_px = Decimal(order.get("avgPx") or "0")
        sz = Decimal(order.get("accFillSz") or order.get("sz") or "0")
        filled_qty_coin = sz * self.contract_value
        fee = (Decimal(order.get("fee") or "0")).copy_abs()
        # OKX `pnl`：交易帶來的已實現損益（平倉才會有）
        realized = Decimal(order.get("pnl") or "0")

        trade = Trade(
            timestamp=timestamp or datetime.now(timezone.utc),
            symbol=symbol,
            side=OrderSide.BUY if order_side == "buy" else OrderSide.SELL,
            price=avg_px,
            quantity=filled_qty_coin,
            fee=fee,
            realized_pnl=realized,
        )
        self._trades.append(trade)
        self._total_fee += fee
        if is_close:
            self._realized_pnl += realized
        # 同步本地快取
        self.refresh_state()
        return trade

    def _wait_order_filled(self, symbol: str, ord_id: str) -> dict:
        """Polling 直到完全成交；逾時若有部分成交則取消剩餘並接受 partial。"""
        last: Dict[str, Any] = {}
        for _ in range(self.order_poll_max):
            order = self.client.get_order(symbol, ord_id)
            last = order
            state = order.get("state")
            if state == "filled":
                return order
            if state in ("canceled", "mmp_canceled"):
                if self._acc_fill_sz(order) > ZERO:
                    return order
                raise OKXAPIError(state, f"order {ord_id} {state}", order)
            time.sleep(self.order_poll_seconds)

        if self._acc_fill_sz(last) > ZERO:
            self._try_cancel_order(symbol, ord_id)
            time.sleep(self.order_poll_seconds)
            last = self.client.get_order(symbol, ord_id)
            if self._acc_fill_sz(last) > ZERO:
                return last

        self._try_cancel_order(symbol, ord_id)
        raise OKXAPIError(
            "TIMEOUT",
            f"order {ord_id} not filled after {self.order_poll_max} polls (state={last.get('state')})",
            last,
        )

    @staticmethod
    def _acc_fill_sz(order: Dict[str, Any]) -> Decimal:
        for key in ("accFillSz", "fillSz"):
            v = order.get(key)
            if v not in (None, ""):
                try:
                    sz = Decimal(str(v))
                    if sz > 0:
                        return sz
                except Exception:  # noqa: BLE001
                    pass
        return ZERO

    def _try_cancel_order(self, symbol: str, ord_id: str) -> None:
        try:
            self.client.cancel_order(symbol, ord_id)
        except OKXAPIError:
            pass
