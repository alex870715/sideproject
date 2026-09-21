"""OKX 永續合約「多 symbol」Broker。給 PumpEngine 用。

跟 `OKXBroker` 的差異：
- 那個是「單一 symbol」固定 contract 規格與槓桿；
  本檔針對多 symbol 同時持倉，instrument 規格 / set-leverage 都按 symbol lazy 拿。
- 介面不嚴格符合 `Broker` Protocol（多 symbol 概念跟既有 Engine 不一樣），
  改由 PumpEngine 直接呼叫所需 method。

主要 method:
- `ensure_instrument(symbol)`     — 拿並快取 ctVal/lotSz/minSz/maxLever/...
- `set_leverage(symbol, lever)`   — 開倉前呼叫；本地快取，避免每次都打
- `open_long(symbol, qty_coin, lever, ...)` / `close_position(symbol)`
- `refresh_state()` 取整體權益、所有持倉
- `snapshot()` 提供給 UI 的 dict
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from decimal import Decimal, ROUND_DOWN
from typing import Any, Dict, List, Optional

from core.account import (
    InvalidOrderError,
    OrderSide,
    Position,
    PositionSide,
    Trade,
)
from core.okx_client import OKXAPIError, OKXClient


ZERO = Decimal("0")


class InstrumentSpec:
    __slots__ = (
        "inst_id", "ct_val", "lot_size", "min_size", "tick_size",
        "max_lever", "max_mkt_size", "max_lmt_size", "state",
    )

    def __init__(self, raw: Dict[str, Any]) -> None:
        self.inst_id: str = raw.get("instId", "")
        self.ct_val: Decimal = Decimal(raw.get("ctVal") or "1")
        self.lot_size: Decimal = Decimal(raw.get("lotSz") or "1")
        self.min_size: Decimal = Decimal(raw.get("minSz") or "1")
        self.tick_size: Decimal = Decimal(raw.get("tickSz") or "0.0001")
        try:
            self.max_lever: int = int(Decimal(raw.get("lever") or "1"))
        except Exception:  # noqa: BLE001
            self.max_lever = 1
        # 單筆 market / limit 訂單的最大張數（OKX 不同合約限制不同）
        try:
            self.max_mkt_size: Decimal = Decimal(raw.get("maxMktSz") or "0")
        except Exception:  # noqa: BLE001
            self.max_mkt_size = ZERO
        try:
            self.max_lmt_size: Decimal = Decimal(raw.get("maxLmtSz") or "0")
        except Exception:  # noqa: BLE001
            self.max_lmt_size = ZERO
        self.state: str = raw.get("state", "")


class OKXMultiBroker:
    def __init__(
        self,
        client: OKXClient,
        td_mode: str = "isolated",
        margin_ccy: str = "USDT",
        order_poll_seconds: float = 0.5,
        order_poll_max: int = 60,
        close_order_poll_seconds: float = 1.0,
        close_order_poll_max: int = 90,
        close_position_wait_seconds: float = 90.0,
    ) -> None:
        self.client = client
        self.td_mode = td_mode
        self.margin_ccy = margin_ccy
        self.order_poll_seconds = order_poll_seconds
        self.order_poll_max = order_poll_max
        self.close_order_poll_seconds = close_order_poll_seconds
        self.close_order_poll_max = close_order_poll_max
        self.close_position_wait_seconds = close_position_wait_seconds

        cfg = client.get_account_config()
        self.pos_mode: str = cfg.get("posMode", "net_mode")

        self._spec_cache: Dict[str, InstrumentSpec] = {}
        # (symbol, td_mode, pos_side) → 最近一次設過的槓桿
        self._lever_cache: Dict[tuple[str, str, str], int] = {}
        # (symbol, td_mode) → OKX public position tiers
        self._tier_cache: Dict[tuple[str, str], List[Dict[str, Any]]] = {}
        self._equity_cache: Decimal = ZERO
        self._initial_equity: Decimal = ZERO
        # USDT-SWAP 保證金來源是 USDT 可用餘額（availBal / availEq），
        # 跟 totalEq（含 BTC/ETH 等其它幣估值）是兩回事。
        self._margin_avail_cache: Dict[str, Decimal] = {}
        self._margin_detail_cache: Dict[str, Dict[str, Decimal]] = {}
        self._account_avail_eq: Decimal = ZERO
        self._position_cache: Dict[str, Position] = {}
        # symbol → 交易所端附加停損單的 algoClOrdId（供之後 amend/cancel）
        self._stop_algo_cl_ord_id: Dict[str, str] = {}
        self._trades: List[Trade] = []
        self._realized_pnl: Decimal = ZERO
        self._total_fee: Decimal = ZERO
        self.refresh_state()
        self._initial_equity = self._equity_cache

    # ------------------------------------------------------------------ #
    # 規格 / 槓桿
    # ------------------------------------------------------------------ #
    def ensure_instrument(self, symbol: str) -> InstrumentSpec:
        if symbol in self._spec_cache:
            return self._spec_cache[symbol]
        raw = self.client.get_instrument(symbol, inst_type="SWAP")
        spec = InstrumentSpec(raw)
        self._spec_cache[symbol] = spec
        return spec

    def preload_instruments(self, symbols: List[str]) -> None:
        """掃描器拿到候選列表後，一次性把 spec 拉齊（之後下單就不用打 N 次）。"""
        if not symbols:
            return
        # OKX list_instruments 一次回所有 SWAP；只取我們要的就好
        all_raw = self.client.list_instruments(inst_type="SWAP")
        wanted = set(symbols)
        for raw in all_raw:
            inst_id = raw.get("instId", "")
            if inst_id in wanted:
                self._spec_cache[inst_id] = InstrumentSpec(raw)

    def set_leverage(
        self,
        symbol: str,
        lever: int,
        td_mode: Optional[str] = None,
        pos_side: Optional[str] = None,
    ) -> int:
        """為某 symbol 設定槓桿，回傳實際生效值（被 spec.max_lever 夾住）。
        重複呼叫會跳過（本地有快取）。
        """
        mgn_mode = td_mode or self.td_mode
        spec = self.ensure_instrument(symbol)
        target = max(1, min(lever, spec.max_lever))
        cache_key = (symbol, mgn_mode, pos_side or "")
        if self._lever_cache.get(cache_key) == target:
            return target
        try:
            # net_mode 不需要 posSide；long_short_mode + cross 也可以省略；isolated + 雙向才強制
            self.client.set_leverage(
                inst_id=symbol, lever=target, mgn_mode=mgn_mode, pos_side=pos_side
            )
        except OKXAPIError:
            self._lever_cache[cache_key] = target  # 避免每次重試
            raise
        self._lever_cache[cache_key] = target
        return target

    # ------------------------------------------------------------------ #
    # 狀態同步
    # ------------------------------------------------------------------ #
    def refresh_state(self) -> None:
        bal = self.client.get_balance()
        try:
            self._equity_cache = Decimal(bal.get("totalEq") or "0")
        except Exception:  # noqa: BLE001
            self._equity_cache = ZERO

        try:
            self._account_avail_eq = Decimal(bal.get("availEq") or "0")
        except Exception:  # noqa: BLE001
            self._account_avail_eq = ZERO

        self._margin_avail_cache = {}
        self._margin_detail_cache = {}
        for d in bal.get("details", []) or []:
            ccy = d.get("ccy", "")
            if not ccy:
                continue
            detail: Dict[str, Decimal] = {}
            for key in ("availBal", "availEq", "frozenBal", "eq", "stgyEq", "disEq"):
                try:
                    detail[key] = Decimal(d.get(key) or "0")
                except Exception:  # noqa: BLE001
                    detail[key] = ZERO
            self._margin_detail_cache[ccy] = detail
            # 跨幣模式有時 availEq > availBal；取較大者作為可下單保證金。
            self._margin_avail_cache[ccy] = max(detail["availBal"], detail["availEq"])

        positions = self.client.get_positions()
        self._position_cache.clear()
        for p in positions:
            pos_qty_contract = Decimal(p.get("pos") or "0")
            if pos_qty_contract == 0:
                continue
            inst_id = p.get("instId") or ""
            if not inst_id:
                continue
            avg_px = Decimal(p.get("avgPx") or "0")

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

            spec = self._spec_cache.get(inst_id)
            ct_val = spec.ct_val if spec else Decimal("1")
            qty_coin = qty_contracts_abs * ct_val
            try:
                liq_px = Decimal(p.get("liqPx") or "0")
            except Exception:  # noqa: BLE001
                liq_px = ZERO
            self._position_cache[inst_id] = Position(
                symbol=inst_id,
                side=side,
                quantity=qty_coin,
                avg_entry_price=avg_px,
                leverage=int(Decimal(p.get("lever") or "1")),
                liq_price=liq_px,
            )

    @property
    def equity(self) -> Decimal:
        return self._equity_cache

    @property
    def initial_equity(self) -> Decimal:
        return self._initial_equity

    def margin_available(self, ccy: Optional[str] = None) -> Decimal:
        """某幣別當前可用保證金（USDT-SWAP 用 USDT；別的合約自己指定）。
        傳 None 走 self.margin_ccy（預設 USDT）。
        """
        c = ccy or self.margin_ccy
        avail = self._margin_avail_cache.get(c, ZERO)
        if avail > ZERO:
            return avail
        # 帳戶層 availEq（多幣保證金模式偶爾只在頂層有值）
        if c == self.margin_ccy and self._account_avail_eq > ZERO:
            return self._account_avail_eq
        return ZERO

    def margin_detail(self, ccy: Optional[str] = None) -> Dict[str, Decimal]:
        c = ccy or self.margin_ccy
        return dict(self._margin_detail_cache.get(c, {}))

    def margin_block_reason(self, ccy: Optional[str] = None) -> str:
        """人類可讀的「為何無法開倉」說明（供 log / UI）。"""
        c = ccy or self.margin_ccy
        d = self._margin_detail_cache.get(c, {})
        avail = self.margin_available(c)
        if avail > ZERO:
            return ""
        eq = d.get("eq", ZERO)
        frozen = d.get("frozenBal", ZERO)
        stgy = d.get("stgyEq", ZERO)
        if eq > ZERO and frozen >= eq:
            if stgy > ZERO:
                return (
                    f"{c} 權益 {eq} 全在 frozen/stgyEq（策略子帳），"
                    f"availBal=0；請至 OKX 把 {c} 轉回交易帳或 Demo 重置"
                )
            return (
                f"{c} 權益 {eq} 全被凍結（frozenBal={frozen}），"
                f"availBal=0；請檢查 OKX 帳戶或 Demo 重置"
            )
        if self._equity_cache > ZERO and eq <= ZERO:
            return (
                f"totalEq={self._equity_cache} 但 {c} 可用=0；"
                f"USDT-SWAP 需 {c} 保證金，請充值或把其它資產換成 {c}"
            )
        return f"{c} 可用保證金為 0"

    def get_position(self, symbol: str) -> Position:
        if symbol not in self._position_cache:
            return Position(symbol=symbol)
        return self._position_cache[symbol]

    def all_positions(self) -> Dict[str, Position]:
        return {sym: pos for sym, pos in self._position_cache.items() if pos.is_open}

    # ------------------------------------------------------------------ #
    # 倉位檔位（51004 max position under leverage）
    # ------------------------------------------------------------------ #
    @staticmethod
    def _inst_family(symbol: str) -> str:
        parts = symbol.split("-")
        return f"{parts[0]}-{parts[1]}" if len(parts) >= 2 else symbol

    def _get_position_tiers(self, symbol: str, td_mode: str) -> List[Dict[str, Any]]:
        key = (symbol, td_mode)
        if key not in self._tier_cache:
            try:
                self._tier_cache[key] = self.client.get_public_position_tiers(
                    inst_type="SWAP",
                    td_mode=td_mode,
                    inst_family=self._inst_family(symbol),
                )
            except OKXAPIError:
                self._tier_cache[key] = []
        return self._tier_cache[key]

    def _position_cap_contracts(
        self,
        symbol: str,
        td_mode: str,
        leverage: int,
        current_contracts: Decimal,
    ) -> Optional[Decimal]:
        """在目前槓桿下，此 symbol 最多能持有幾張（含已有倉）。"""
        tiers = self._get_position_tiers(symbol, td_mode)
        if not tiers:
            return None
        lev = Decimal(str(leverage))
        cur = current_contracts
        for t in sorted(tiers, key=lambda x: int(x.get("tier") or 0)):
            try:
                min_sz = Decimal(str(t.get("minSz") or "0"))
                max_sz = Decimal(str(t.get("maxSz") or "0"))
                max_lever = Decimal(str(t.get("maxLever") or "0"))
            except Exception:  # noqa: BLE001
                continue
            if lev <= max_lever and min_sz <= cur <= max_sz:
                return max_sz
        if cur == ZERO:
            for t in sorted(tiers, key=lambda x: int(x.get("tier") or 0)):
                try:
                    if Decimal(str(t.get("minSz") or "0")) != ZERO:
                        continue
                    max_sz = Decimal(str(t.get("maxSz") or "0"))
                    max_lever = Decimal(str(t.get("maxLever") or "0"))
                except Exception:  # noqa: BLE001
                    continue
                if lev <= max_lever:
                    return max_sz
        return None

    def _clamp_open_contracts(
        self,
        symbol: str,
        td_mode: str,
        contracts: Decimal,
        spec: InstrumentSpec,
        pos_side: Optional[str],
    ) -> Decimal:
        cache_key = (symbol, td_mode, pos_side or "")
        leverage = self._lever_cache.get(cache_key)
        if not leverage:
            return contracts
        pos = self.get_position(symbol)
        held = (
            self._coins_to_contracts(pos.quantity, spec)
            if pos.is_open
            else ZERO
        )
        cap = self._position_cap_contracts(symbol, td_mode, leverage, held)
        if cap is None:
            return contracts
        allowed = cap - held
        if allowed <= ZERO:
            raise InvalidOrderError(
                f"{symbol}: position cap {cap} contracts at {leverage}x reached "
                f"(held={held})"
            )
        if contracts > allowed:
            contracts = self._floor_to_lot(allowed, spec.lot_size)
        if contracts < spec.min_size:
            raise InvalidOrderError(
                f"{symbol}: clamped size {contracts} < minSz {spec.min_size} "
                f"(cap={cap} at {leverage}x)"
            )
        return contracts

    # ------------------------------------------------------------------ #
    # 下單
    # ------------------------------------------------------------------ #
    def _make_algo_cl_ord_id(self, symbol: str) -> str:
        raw = "sl" + symbol.replace("-", "") + str(int(time.time() * 1000))
        return raw[:32]

    def _attach_stop_algo(self, symbol: str, stop_loss_price: Optional[Decimal]) -> tuple:
        """組出 attachAlgoOrds（交易所端市價停損，跟軟體停損互為備援）。"""
        if stop_loss_price is None or stop_loss_price <= 0:
            return None, None
        algo_cl_ord_id = self._make_algo_cl_ord_id(symbol)
        attach = [{
            "attachAlgoClOrdId": algo_cl_ord_id,
            "slTriggerPx": str(stop_loss_price),
            "slOrdPx": "-1",  # 觸發後市價出場
            "slTriggerPxType": "last",
        }]
        return attach, algo_cl_ord_id

    def open_long(
        self,
        symbol: str,
        notional_usdt: Decimal,
        ref_price: Decimal,
        timestamp: Optional[datetime] = None,
        td_mode: Optional[str] = None,
        stop_loss_price: Optional[Decimal] = None,
    ) -> Trade:
        """以 USDT 名目金額開多單（market）；自動算合約張數。

        stop_loss_price 有給的話，會用 attachAlgoOrds 在同一張單附上交易所端
        市價停損（跟軟體端的停損互為備援：就算 bot 掛掉/斷線，交易所仍會自動出場）。
        """
        mgn_mode = td_mode or self.td_mode
        spec = self.ensure_instrument(symbol)
        if ref_price <= 0:
            raise InvalidOrderError(f"ref_price must be > 0, got {ref_price}")
        qty_coin = (Decimal(notional_usdt) / Decimal(ref_price))
        contracts = self._coins_to_contracts(qty_coin, spec)
        if contracts == 0:
            raise InvalidOrderError(
                f"open_long {symbol}: notional={notional_usdt} too small "
                f"(qty_coin={qty_coin}, ctVal={spec.ct_val}, minSz={spec.min_size})"
            )
        # OKX 對每個合約的 market 訂單有單筆張數上限 (maxMktSz)，超過直接 51202。
        # 這裡先 clamp，避免送出去就被拒。
        if spec.max_mkt_size and contracts > spec.max_mkt_size:
            contracts = self._floor_to_lot(spec.max_mkt_size, spec.lot_size)

        pos_side = "long" if self.pos_mode == "long_short_mode" else None
        contracts = self._clamp_open_contracts(symbol, mgn_mode, contracts, spec, pos_side)
        attach, algo_cl_ord_id = self._attach_stop_algo(symbol, stop_loss_price)
        result = self.client.place_order(
            inst_id=symbol,
            td_mode=mgn_mode,
            side="buy",
            ord_type="market",
            sz=str(contracts),
            pos_side=pos_side,
            ccy=self.margin_ccy if mgn_mode == "cross" else None,
            attach_algo_ords=attach,
        )
        if algo_cl_ord_id:
            self._stop_algo_cl_ord_id[symbol] = algo_cl_ord_id
        return self._finalize_trade(result, symbol, "buy", timestamp)

    def open_short(
        self,
        symbol: str,
        notional_usdt: Decimal,
        ref_price: Decimal,
        timestamp: Optional[datetime] = None,
        td_mode: Optional[str] = None,
        stop_loss_price: Optional[Decimal] = None,
    ) -> Trade:
        """以 USDT 名目金額開空單（market）；自動算合約張數。

        stop_loss_price 語意同 `open_long`（多單跌破觸發；空單則是漲破觸發）。
        """
        mgn_mode = td_mode or self.td_mode
        spec = self.ensure_instrument(symbol)
        if ref_price <= 0:
            raise InvalidOrderError(f"ref_price must be > 0, got {ref_price}")
        qty_coin = (Decimal(notional_usdt) / Decimal(ref_price))
        contracts = self._coins_to_contracts(qty_coin, spec)
        if contracts == 0:
            raise InvalidOrderError(
                f"open_short {symbol}: notional={notional_usdt} too small "
                f"(qty_coin={qty_coin}, ctVal={spec.ct_val}, minSz={spec.min_size})"
            )
        if spec.max_mkt_size and contracts > spec.max_mkt_size:
            contracts = self._floor_to_lot(spec.max_mkt_size, spec.lot_size)

        pos_side = "short" if self.pos_mode == "long_short_mode" else None
        contracts = self._clamp_open_contracts(symbol, mgn_mode, contracts, spec, pos_side)
        attach, algo_cl_ord_id = self._attach_stop_algo(symbol, stop_loss_price)
        result = self.client.place_order(
            inst_id=symbol,
            td_mode=mgn_mode,
            side="sell",
            ord_type="market",
            sz=str(contracts),
            pos_side=pos_side,
            ccy=self.margin_ccy if mgn_mode == "cross" else None,
            attach_algo_ords=attach,
        )
        if algo_cl_ord_id:
            self._stop_algo_cl_ord_id[symbol] = algo_cl_ord_id
        return self._finalize_trade(result, symbol, "sell", timestamp)

    def update_stop(self, symbol: str, new_stop_price: Decimal) -> bool:
        """把交易所端附加停損單的觸發價改到 new_stop_price（保本鎖利用）。

        回傳 True 代表交易所端已同步；False 代表沒有可改的 algo 單
        （例如舊倉/attach 失敗過），呼叫端應該只依賴軟體停損繼續運作，不可拋例外中斷交易迴圈。
        """
        algo_cl_ord_id = self._stop_algo_cl_ord_id.get(symbol)
        if not algo_cl_ord_id:
            return False
        self.client.amend_algo_order(
            inst_id=symbol,
            algo_cl_ord_id=algo_cl_ord_id,
            new_sl_trigger_px=str(new_stop_price),
        )
        return True

    def _cancel_stop_algo(self, symbol: str) -> None:
        algo_cl_ord_id = self._stop_algo_cl_ord_id.pop(symbol, None)
        if not algo_cl_ord_id:
            return
        try:
            self.client.cancel_algo_orders(inst_id=symbol, algo_cl_ord_id=algo_cl_ord_id)
        except OKXAPIError:
            pass  # 單可能已因觸發/持倉平掉而自動失效，忽略

    def close_position(
        self,
        symbol: str,
        timestamp: Optional[datetime] = None,
        td_mode: Optional[str] = None,
    ) -> Trade:
        pos = self.get_position(symbol)
        if not pos.is_open:
            raise InvalidOrderError(f"No open position for {symbol}")
        snapshot = (pos.side, pos.quantity, pos.avg_entry_price)
        mgn_mode = td_mode or self.td_mode
        pos_side = None
        if self.pos_mode == "long_short_mode":
            pos_side = "long" if pos.side == PositionSide.LONG else "short"

        # 手動/軟體停損觸發平倉前，先把交易所端附加停損單取消掉，
        # 避免這張倉平掉後、殘留的舊 algo 單意外對下一次重新開倉生效。
        self._cancel_stop_algo(symbol)

        # ① OKX 原生 close-position（Demo 小幣比手動 market 更可靠）
        try:
            self.client.close_positions(
                inst_id=symbol,
                mgn_mode=mgn_mode,
                pos_side=pos_side,
                auto_cxl=True,
                ccy=self.margin_ccy if mgn_mode == "cross" else None,
            )
            if self._wait_position_flat(symbol):
                trade = self._close_trade_from_fills(symbol, snapshot, timestamp)
                if trade is not None:
                    self._record_close_trade(trade)
                    return trade
        except OKXAPIError:
            pass

        self.refresh_state()
        if not self.get_position(symbol).is_open:
            trade = self._close_trade_from_fills(symbol, snapshot, timestamp)
            if trade is not None:
                self._record_close_trade(trade)
                return trade

        # ② fallback：市價 reduce 單
        return self._close_via_market_order(symbol, snapshot, timestamp, mgn_mode, pos_side)

    def _close_via_market_order(
        self,
        symbol: str,
        snapshot: tuple,
        timestamp: Optional[datetime],
        mgn_mode: str,
        pos_side: Optional[str],
    ) -> Trade:
        pos_side_enum, qty_before, _ = snapshot
        pos = self.get_position(symbol)
        if not pos.is_open:
            trade = self._close_trade_from_fills(symbol, snapshot, timestamp)
            if trade is not None:
                self._record_close_trade(trade)
                return trade
            raise InvalidOrderError(f"No open position for {symbol}")

        spec = self.ensure_instrument(symbol)
        contracts = self._coins_to_contracts(pos.quantity, spec)
        if contracts == 0:
            raise InvalidOrderError(f"Close qty {pos.quantity} below min_size for {symbol}")

        order_side = "sell" if pos.side == PositionSide.LONG else "buy"
        result = self.client.place_order(
            inst_id=symbol,
            td_mode=mgn_mode,
            side=order_side,
            ord_type="market",
            sz=str(contracts),
            pos_side=pos_side,
            reduce_only=(self.pos_mode == "net_mode"),
            ccy=self.margin_ccy if mgn_mode == "cross" else None,
        )
        try:
            return self._finalize_trade(
                result,
                symbol,
                order_side,
                timestamp,
                is_close=True,
                poll_max=self.close_order_poll_max,
                poll_seconds=self.close_order_poll_seconds,
            )
        except OKXAPIError as exc:
            if exc.code != "TIMEOUT":
                raise
            self.refresh_state()
            if not self.get_position(symbol).is_open:
                trade = self._close_trade_from_fills(symbol, snapshot, timestamp)
                if trade is not None:
                    self._record_close_trade(trade)
                    return trade
                raise OKXAPIError(
                    "CLOSED_SYNC",
                    f"{symbol} already flat on OKX after close timeout",
                    exc.data,
                ) from exc
            if self._wait_position_flat(symbol, max_wait=60.0):
                trade = self._close_trade_from_fills(symbol, snapshot, timestamp)
                if trade is not None:
                    self._record_close_trade(trade)
                    return trade
            raise

    def _wait_position_flat(
        self,
        symbol: str,
        max_wait: Optional[float] = None,
        poll_seconds: float = 1.0,
    ) -> bool:
        deadline = time.time() + (max_wait if max_wait is not None else self.close_position_wait_seconds)
        while time.time() < deadline:
            self.refresh_state()
            if not self.get_position(symbol).is_open:
                return True
            time.sleep(poll_seconds)
        self.refresh_state()
        return not self.get_position(symbol).is_open

    def _close_trade_from_fills(
        self,
        symbol: str,
        snapshot: tuple,
        timestamp: Optional[datetime],
    ) -> Optional[Trade]:
        pos_side_enum, qty_before, entry_px = snapshot
        try:
            fills = self.client.get_fills(inst_id=symbol, limit=20)
        except OKXAPIError:
            fills = []
        close_subtypes = {
            "5", "6", "208", "209", "274", "275", "328", "329",
        }
        relevant = [
            f for f in fills
            if str(f.get("subType") or "") in close_subtypes
            or str(f.get("side") or "") == (
                "sell" if pos_side_enum == PositionSide.LONG else "buy"
            )
        ]
        if not relevant:
            relevant = fills[:5]

        spec = self.ensure_instrument(symbol)
        total_contracts = ZERO
        weighted_px = ZERO
        total_fee = ZERO
        total_pnl = ZERO
        for f in relevant:
            try:
                sz = Decimal(str(f.get("fillSz") or "0"))
                px = Decimal(str(f.get("fillPx") or "0"))
                fee = Decimal(str(f.get("fee") or "0")).copy_abs()
                pnl = Decimal(str(f.get("fillPnl") or "0"))
            except Exception:  # noqa: BLE001
                continue
            if sz <= 0:
                continue
            total_contracts += sz
            weighted_px += px * sz
            total_fee += fee
            total_pnl += pnl

        if total_contracts <= 0:
            # 持倉已平但拿不到 fill：用 entry 建最小紀錄
            if qty_before <= 0:
                return None
            order_side = OrderSide.SELL if pos_side_enum == PositionSide.LONG else OrderSide.BUY
            return Trade(
                timestamp=timestamp or datetime.now(timezone.utc),
                symbol=symbol,
                side=order_side,
                price=entry_px,
                quantity=qty_before,
                fee=ZERO,
                realized_pnl=ZERO,
            )

        avg_px = weighted_px / total_contracts
        qty_coin = total_contracts * spec.ct_val
        order_side = OrderSide.SELL if pos_side_enum == PositionSide.LONG else OrderSide.BUY
        return Trade(
            timestamp=timestamp or datetime.now(timezone.utc),
            symbol=symbol,
            side=order_side,
            price=avg_px,
            quantity=qty_coin if qty_coin > 0 else qty_before,
            fee=total_fee,
            realized_pnl=total_pnl,
        )

    def _record_close_trade(self, trade: Trade) -> None:
        self._trades.append(trade)
        self._total_fee += trade.fee
        self._realized_pnl += trade.realized_pnl
        self.refresh_state()

    # ------------------------------------------------------------------ #
    # Snapshot
    # ------------------------------------------------------------------ #
    def snapshot(self, mark_prices: Optional[Dict[str, Decimal]] = None) -> dict:
        mark_prices = mark_prices or {}
        unrealized = {
            sym: pos.unrealized_pnl(mark_prices.get(sym, pos.avg_entry_price))
            for sym, pos in self._position_cache.items()
            if pos.is_open
        }
        m_ccy = self.margin_ccy
        m_detail = self.margin_detail(m_ccy)
        return {
            "demo": self.client.demo,
            "initial_balance": self._initial_equity,
            "balance": self._equity_cache,
            "equity": self._equity_cache,
            "margin_ccy": m_ccy,
            "margin_available": self.margin_available(m_ccy),
            "margin_detail": {k: str(v) for k, v in m_detail.items()},
            "margin_block_reason": self.margin_block_reason(m_ccy),
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
    def _coins_to_contracts(self, qty_coin: Decimal, spec: InstrumentSpec) -> Decimal:
        if qty_coin <= 0 or spec.ct_val <= 0:
            return ZERO
        contracts = qty_coin / spec.ct_val
        contracts = self._floor_to_lot(contracts, spec.lot_size)
        if contracts < spec.min_size:
            return ZERO
        return contracts

    @staticmethod
    def _floor_to_lot(value: Decimal, lot_size: Decimal) -> Decimal:
        """把張數無條件捨入到 lot_size 的整數倍。"""
        if lot_size <= 0:
            return value
        return (value / lot_size).quantize(Decimal("1"), rounding=ROUND_DOWN) * lot_size

    def _finalize_trade(
        self,
        place_result: dict,
        symbol: str,
        order_side: str,
        timestamp: Optional[datetime],
        is_close: bool = False,
        poll_max: Optional[int] = None,
        poll_seconds: Optional[float] = None,
    ) -> Trade:
        ord_id = place_result.get("ordId")
        if not ord_id:
            raise OKXAPIError("NO_ORD_ID", f"order missing ordId: {place_result}")

        order = self._wait_order_filled(
            symbol,
            ord_id,
            poll_max=poll_max,
            poll_seconds=poll_seconds,
        )
        spec = self.ensure_instrument(symbol)
        avg_px = Decimal(order.get("avgPx") or "0")
        sz = Decimal(order.get("accFillSz") or order.get("sz") or "0")
        filled_qty_coin = sz * spec.ct_val
        fee = (Decimal(order.get("fee") or "0")).copy_abs()
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
        self.refresh_state()
        return trade

    def _wait_order_filled(
        self,
        symbol: str,
        ord_id: str,
        poll_max: Optional[int] = None,
        poll_seconds: Optional[float] = None,
    ) -> dict:
        """Polling 直到完全成交；逾時若有部分成交則取消剩餘並接受 partial。"""
        max_polls = poll_max if poll_max is not None else self.order_poll_max
        interval = poll_seconds if poll_seconds is not None else self.order_poll_seconds
        last: Dict[str, Any] = {}
        for _ in range(max_polls):
            order = self.client.get_order(symbol, ord_id)
            last = order
            state = order.get("state")
            if state == "filled":
                return order
            if state in ("canceled", "mmp_canceled"):
                if self._acc_fill_sz(order) > ZERO:
                    return order
                raise OKXAPIError(state, f"order {ord_id} {state}", order)
            time.sleep(interval)

        # 逾時：有部分成交 → 取消剩餘、接受已成交部分
        if self._acc_fill_sz(last) > ZERO:
            self._try_cancel_order(symbol, ord_id)
            time.sleep(interval)
            last = self.client.get_order(symbol, ord_id)
            if self._acc_fill_sz(last) > ZERO:
                return last

        # 完全未成交 → 取消掛單避免 orphan live order
        self._try_cancel_order(symbol, ord_id)
        raise OKXAPIError(
            "TIMEOUT",
            f"order {ord_id} not filled after {max_polls} polls (state={last.get('state')})",
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
