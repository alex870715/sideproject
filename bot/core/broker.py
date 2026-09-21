"""Broker 介面：交易撮合層的契約。

任何符合此 Protocol 的物件都能被 `TradingEngine` 使用：
  - `LocalBroker`  — 模擬模式（包住本地 `Account`，純記帳）
  - `OKXBroker`    — 接 OKX V5 demo / 正式環境
  - 之後可加 `BinanceBroker` / `BybitBroker` 等

設計原則：
- 所有 method 對外都是「同步阻塞」的；async 的 broker 應在內部處理 event loop
  並對 caller 呈現阻塞語意。Engine 端可在 web 模式下用 `asyncio.to_thread`
  包起來避免阻塞事件迴圈。
- 介面與 Account 對齊，因此本地模擬可以零成本切換到真實 broker。
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Dict, Optional, Protocol, runtime_checkable

from core.account import Position, PositionSide, Trade


@runtime_checkable
class Broker(Protocol):
    """Broker contract used by TradingEngine."""

    def get_position(self, symbol: str) -> Position: ...

    def equity(self, mark_prices: Dict[str, Decimal]) -> Decimal: ...

    def open_position(
        self,
        symbol: str,
        side: PositionSide,
        price: Decimal,
        quantity: Decimal,
        timestamp: Optional[datetime] = None,
        is_taker: bool = True,
        leverage: int = 1,
    ) -> Trade: ...

    def close_position(
        self,
        symbol: str,
        price: Decimal,
        quantity: Optional[Decimal] = None,
        timestamp: Optional[datetime] = None,
        is_taker: bool = True,
    ) -> Trade: ...

    def snapshot(self, mark_prices: Optional[Dict[str, Decimal]] = None) -> dict: ...
