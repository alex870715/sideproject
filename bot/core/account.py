"""帳戶模組：管理虛擬資產、持倉、未實現/已實現損益與手續費。

對標 OKX/Binance 永續合約：
- 支援多/空雙向持倉與槓桿欄位（簡化版本暫不做強平與維持保證金率）。
- 採「PnL 結算式」記帳：開倉時僅扣手續費，平倉時把實現損益加回 `balance`，
  使 `equity = balance + Σ unrealized_pnl` 永遠成立。
- 金額一律使用 `Decimal`，避免回測時的浮點誤差累積。

本模組不認識市場數據，也不認識策略；它只是「被動接收下單請求」的純粹會計模組。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal, getcontext
from enum import Enum
from typing import Dict, List, Optional

# 高精度避免長序列累計後的尾差
getcontext().prec = 28

ZERO = Decimal("0")


class OrderSide(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


class PositionSide(str, Enum):
    LONG = "LONG"
    SHORT = "SHORT"
    FLAT = "FLAT"


class InsufficientBalanceError(Exception):
    """餘額不足以支付保證金或手續費。"""


class InvalidOrderError(Exception):
    """下單參數非法（如反向開倉、數量為 0、無持倉卻平倉等）。"""


@dataclass(frozen=True)
class Trade:
    """已成交的交易紀錄；不可變，方便事後重放或做報表。"""

    timestamp: datetime
    symbol: str
    side: OrderSide
    price: Decimal
    quantity: Decimal
    fee: Decimal
    realized_pnl: Decimal = ZERO


@dataclass
class Position:
    """單一交易對的持倉狀態。

    `quantity` 永遠為非負；多/空方向由 `side` 表示。
    """

    symbol: str
    side: PositionSide = PositionSide.FLAT
    quantity: Decimal = ZERO
    avg_entry_price: Decimal = ZERO
    leverage: int = 1
    liq_price: Decimal = ZERO

    @property
    def is_open(self) -> bool:
        return self.side != PositionSide.FLAT and self.quantity > 0

    def notional(self, mark_price: Decimal) -> Decimal:
        return self.quantity * Decimal(mark_price)

    def unrealized_pnl(self, mark_price: Decimal) -> Decimal:
        if not self.is_open:
            return ZERO
        mark_price = Decimal(mark_price)
        if self.side == PositionSide.LONG:
            return (mark_price - self.avg_entry_price) * self.quantity
        return (self.avg_entry_price - mark_price) * self.quantity


class Account:
    """虛擬交易帳戶。

    Attributes:
        balance:           可用餘額（USDT）。
        positions:         {symbol: Position}。
        trades:            歷史成交紀錄。
        realized_pnl:      已實現損益（僅來自平倉）。
        total_fee_paid:    累計手續費。
    """

    def __init__(
        self,
        initial_balance: Decimal = Decimal("10000"),
        taker_fee_rate: Decimal = Decimal("0.0005"),
        maker_fee_rate: Decimal = Decimal("0.0002"),
    ) -> None:
        self._initial_balance: Decimal = Decimal(initial_balance)
        self.balance: Decimal = Decimal(initial_balance)
        self.taker_fee_rate: Decimal = Decimal(taker_fee_rate)
        self.maker_fee_rate: Decimal = Decimal(maker_fee_rate)

        self.positions: Dict[str, Position] = {}
        self.trades: List[Trade] = []
        self.realized_pnl: Decimal = ZERO
        self.total_fee_paid: Decimal = ZERO

    # ------------------------------------------------------------------ #
    # 查詢
    # ------------------------------------------------------------------ #
    def get_position(self, symbol: str) -> Position:
        """取得指定 symbol 的持倉；若不存在則建立空倉並返回。"""
        return self.positions.setdefault(symbol, Position(symbol=symbol))

    def total_unrealized_pnl(self, mark_prices: Dict[str, Decimal]) -> Decimal:
        total = ZERO
        for sym, pos in self.positions.items():
            if pos.is_open and sym in mark_prices:
                total += pos.unrealized_pnl(mark_prices[sym])
        return total

    def equity(self, mark_prices: Dict[str, Decimal]) -> Decimal:
        """總權益 = 餘額 + 所有未實現損益。"""
        return self.balance + self.total_unrealized_pnl(mark_prices)

    def return_pct(self, mark_prices: Dict[str, Decimal]) -> Decimal:
        """相對初始資金的收益率（小數）。"""
        if self._initial_balance == 0:
            return ZERO
        return (self.equity(mark_prices) - self._initial_balance) / self._initial_balance

    # ------------------------------------------------------------------ #
    # 下單
    # ------------------------------------------------------------------ #
    def open_position(
        self,
        symbol: str,
        side: PositionSide,
        price: Decimal,
        quantity: Decimal,
        timestamp: Optional[datetime] = None,
        is_taker: bool = True,
        leverage: int = 1,
    ) -> Trade:
        """開倉或同方向加倉。反方向開倉會被拒絕，需先呼叫 `close_position`。"""
        if side == PositionSide.FLAT:
            raise InvalidOrderError("Cannot open a FLAT position.")

        price = Decimal(price)
        quantity = Decimal(quantity)
        if price <= 0 or quantity <= 0:
            raise InvalidOrderError("Price and quantity must be positive.")

        notional = price * quantity
        fee_rate = self.taker_fee_rate if is_taker else self.maker_fee_rate
        fee = notional * fee_rate

        if fee > self.balance:
            raise InsufficientBalanceError(
                f"Need {fee} for fee, only {self.balance} available."
            )

        pos = self.get_position(symbol)
        if pos.is_open and pos.side != side:
            raise InvalidOrderError(
                f"Existing {pos.side.value} position on {symbol}; "
                f"close it before opening {side.value}."
            )

        if pos.is_open:
            # 加倉：以加權平均更新開倉價
            total_cost = pos.avg_entry_price * pos.quantity + price * quantity
            new_qty = pos.quantity + quantity
            pos.avg_entry_price = total_cost / new_qty
            pos.quantity = new_qty
        else:
            pos.symbol = symbol
            pos.side = side
            pos.quantity = quantity
            pos.avg_entry_price = price
            pos.leverage = leverage

        self.balance -= fee
        self.total_fee_paid += fee

        trade = Trade(
            timestamp=timestamp or datetime.now(timezone.utc),
            symbol=symbol,
            side=OrderSide.BUY if side == PositionSide.LONG else OrderSide.SELL,
            price=price,
            quantity=quantity,
            fee=fee,
        )
        self.trades.append(trade)
        return trade

    def close_position(
        self,
        symbol: str,
        price: Decimal,
        quantity: Optional[Decimal] = None,
        timestamp: Optional[datetime] = None,
        is_taker: bool = True,
    ) -> Trade:
        """平倉；`quantity=None` 表示全平。回傳的 `Trade` 內含實現損益。"""
        pos = self.get_position(symbol)
        if not pos.is_open:
            raise InvalidOrderError(f"No open position for {symbol}.")

        price = Decimal(price)
        close_qty = Decimal(quantity) if quantity is not None else pos.quantity
        if close_qty <= 0 or close_qty > pos.quantity:
            raise InvalidOrderError(
                f"Invalid close quantity {close_qty} (holding {pos.quantity})."
            )

        notional = price * close_qty
        fee_rate = self.taker_fee_rate if is_taker else self.maker_fee_rate
        fee = notional * fee_rate

        if pos.side == PositionSide.LONG:
            pnl = (price - pos.avg_entry_price) * close_qty
            order_side = OrderSide.SELL
        else:
            pnl = (pos.avg_entry_price - price) * close_qty
            order_side = OrderSide.BUY

        self.balance += pnl - fee
        self.realized_pnl += pnl
        self.total_fee_paid += fee

        pos.quantity -= close_qty
        if pos.quantity == 0:
            pos.side = PositionSide.FLAT
            pos.avg_entry_price = ZERO

        trade = Trade(
            timestamp=timestamp or datetime.now(timezone.utc),
            symbol=symbol,
            side=order_side,
            price=price,
            quantity=close_qty,
            fee=fee,
            realized_pnl=pnl,
        )
        self.trades.append(trade)
        return trade

    # ------------------------------------------------------------------ #
    # 報表
    # ------------------------------------------------------------------ #
    def snapshot(self, mark_prices: Optional[Dict[str, Decimal]] = None) -> dict:
        """供 Dashboard 使用的當前狀態快照。傳入 `mark_prices` 才能算 unrealized。"""
        mark_prices = mark_prices or {}
        unrealized_by_symbol = {
            sym: pos.unrealized_pnl(mark_prices.get(sym, pos.avg_entry_price))
            for sym, pos in self.positions.items()
            if pos.is_open
        }
        return {
            "initial_balance": self._initial_balance,
            "balance": self.balance,
            "equity": self.equity(mark_prices),
            "return_pct": self.return_pct(mark_prices),
            "realized_pnl": self.realized_pnl,
            "unrealized_pnl_by_symbol": unrealized_by_symbol,
            "total_unrealized_pnl": sum(unrealized_by_symbol.values(), ZERO),
            "total_fee_paid": self.total_fee_paid,
            "open_positions": {
                sym: {
                    "side": pos.side.value,
                    "quantity": pos.quantity,
                    "avg_entry_price": pos.avg_entry_price,
                    "leverage": pos.leverage,
                }
                for sym, pos in self.positions.items()
                if pos.is_open
            },
            "trades_count": len(self.trades),
        }

    def __repr__(self) -> str:
        open_count = sum(1 for p in self.positions.values() if p.is_open)
        return (
            f"<Account balance={self.balance:.2f} "
            f"realized={self.realized_pnl:.2f} "
            f"open_positions={open_count} "
            f"trades={len(self.trades)}>"
        )
