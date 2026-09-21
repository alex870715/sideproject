"""PumpEngine — 投資組合 + 多 symbol 掃描的「抓小幣起漲」交易引擎。

跟 TradingEngine 的差異：
- TradingEngine：固定一個 symbol，靠 regime 切策略，雙向交易。
- PumpEngine：       多 symbol 掃描 + 排序，用同一支「pump 策略」實例化到每個候選；
                     由 RiskMode 決定槓桿 / 倉位 / 止損 / 止盈；最多同時 N 個倉。

核心邏輯（每 tick 執行一次，由外部 loop 控速）：
  1. （N tick 一次）refresh_universe：從 OKX tickers 拉 top-N USDT-SWAP。
  2. 對每個候選 symbol：fetch_new_bars → 餵給該 symbol 的策略實例 → 取 BUY 訊號。
  3. Scanner.rank_candidates：用近 N 根 bar 計算 pump_score 重新排序。
  4. 進場：若 BUY 訊號 + 還有空倉位 + symbol 不在持倉中 → 開多單（套用 RiskMode）。
  5. 持倉管理：對每個既有持倉算 ATR 止損 / 移動止損 / max_hold_bars，觸發就平倉。

線程安全：
- self._lock = threading.RLock()
- 主 tick loop（async task → asyncio.to_thread）與 Web API 共用此 lock。

對外 API（Web UI 會呼叫）：
- snapshot(): 給 UI 渲染用的整體狀態
- list_strategies(): pump 策略清單（含當前 active）
- list_risk_modes(): 風險模式清單（含當前 active）
- set_active_strategy(name)
- set_risk_mode(key)
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Callable, Dict, List, Optional

import re

from core import risk_mode as risk_mode_mod
from core import trading_profiles as trading_profiles_mod
from core.account import Position, PositionSide, Trade
from core.engine import Event, EventLevel
from core.okx_client import OKXAPIError
from core.okx_market import OKXMultiMarket
from core.okx_multi_broker import OKXMultiBroker
from core.scanner import MAJOR_BASES, Scanner, UniverseItem
from strategies.base_strategy import Bar, BaseStrategy, Signal, SignalAction
from strategies.indicators import atr
from strategies.pump import PUMP_STRATEGY_REGISTRY, strategy_catalog


ZERO = Decimal("0")
EventListener = Callable[[Event], None]
_STRATEGY_KEY_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_]{1,31}$")


@dataclass
class PositionState:
    """每個持倉的衍生狀態（PumpEngine 自己維護的，不是 broker 的權威狀態）。"""

    entry_price: Decimal
    entry_atr: Decimal
    entry_bar_idx: int        # 進場時 self._global_bar_count 的值
    leverage: int
    initial_stop: Decimal
    take_profit: Decimal
    risk_per_unit: Decimal = ZERO  # |進場價 − 初始停損|，用來算 R 倍數（保本/續抱）
    max_close_seen: Decimal = ZERO   # 多單移動止盈：追蹤最高收盤
    min_close_seen: Decimal = ZERO  # 空單移動止盈：追蹤最低收盤
    td_mode: str = "isolated"    # 開倉時使用的保證金模式（平倉需一致）
    extra: Dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------- #
class PumpEngine:
    def __init__(
        self,
        broker: OKXMultiBroker,
        market: OKXMultiMarket,
        scanner: Scanner,
        active_strategy: str = "VolumeBreakout",
        risk_mode_key: str = risk_mode_mod.DEFAULT_MODE_KEY,
        bar_interval: str = "1m",
        atr_period: int = 14,
        universe_refresh_seconds: int = 300,
        candidates_top_k: int = 10,
        scan_interval_seconds: float = 10.0,
    ) -> None:
        if active_strategy not in PUMP_STRATEGY_REGISTRY:
            raise ValueError(
                f"unknown pump strategy: {active_strategy}; "
                f"available: {list(PUMP_STRATEGY_REGISTRY)}"
            )
        risk_mode_mod.get(risk_mode_key)  # 驗證 key

        self.broker = broker
        self.market = market
        self.scanner = scanner
        self.bar_interval = bar_interval
        self.atr_period = atr_period
        self.universe_refresh_seconds = universe_refresh_seconds
        self.candidates_top_k = candidates_top_k
        self.scan_interval_seconds = scan_interval_seconds

        # 可同時啟用多個策略（有序：排前面的優先；同 symbol 同 tick 只取第一個觸發的訊號）。
        self._active_strategies: List[str] = [active_strategy]
        self._risk_mode_key: str = risk_mode_key

        # 使用者自訂策略：{name → {"base": preset_name, "params": {...}, "description": str}}
        # 預設策略列在 PUMP_STRATEGY_REGISTRY；使用者新增的進這裡，is_preset=False。
        self._user_strategies: Dict[str, Dict[str, Any]] = {}

        # per-(strategy, symbol) 狀態：同一個 symbol 每個 active 策略各有一份獨立實例
        self._strategies: Dict[tuple[str, str], BaseStrategy] = {}
        self._position_states: Dict[str, PositionState] = {}      # symbol → 倉位附屬狀態
        self._close_backoff: Dict[str, float] = {}                # symbol → 平倉失敗後暫停重試
        self._closed_at_bar: Dict[str, int] = {}                  # symbol → 上次平倉時的 global bar
        self._last_signal_ts: Dict[str, datetime] = {}            # 訊號去重
        self._session_day: Optional[date] = None               # UTC 日切
        self._session_start_equity: Decimal = Decimal("0")
        self._opens_today: int = 0
        self._halt_new_entries: bool = False
        self._last_margin_warn_ts: float = 0.0
        self._margin_warn_interval: float = 300.0  # 5 分鐘內不重複洗版

        # 全域
        self._candidates: List[Dict[str, Any]] = []               # 上一輪 rank 結果
        self._universe: List[UniverseItem] = []
        self._last_universe_refresh_ts: float = 0.0
        self._global_bar_count: int = 0                           # 用於 max_hold_bars

        # 資金費率（FundingReversion 用）：symbol → 當期 funding rate；每 N 秒刷新
        self._funding: Dict[str, float] = {}
        self._last_funding_refresh_ts: float = 0.0
        self.funding_refresh_seconds: int = 180

        self.events: List[Event] = []
        self._listeners: List[EventListener] = []

        self.live: bool = True
        self._lock = threading.RLock()

    @property
    def _strategy_name(self) -> str:
        """主策略（active 列表第一個）；保留給舊程式路徑與 snapshot 用。"""
        return self._active_strategies[0] if self._active_strategies else ""

    # ------------------------------------------------------------------ #
    # Event API
    # ------------------------------------------------------------------ #
    def subscribe(self, listener: EventListener) -> None:
        self._listeners.append(listener)

    def _emit(self, level: EventLevel, message: str, **payload: Any) -> None:
        evt = Event(
            timestamp=datetime.now(timezone.utc),
            level=level,
            message=message,
            payload=payload,
        )
        self.events.append(evt)
        if len(self.events) > 500:
            self.events = self.events[-500:]
        for fn in self._listeners:
            try:
                fn(evt)
            except Exception:  # noqa: BLE001
                pass

    # ------------------------------------------------------------------ #
    # Public 控制 API（thread-safe）
    # ------------------------------------------------------------------ #
    def list_strategies(self) -> Dict[str, Any]:
        with self._lock:
            active_set = set(self._active_strategies)
            entries: List[Dict[str, Any]] = []
            # 預設策略
            for name, cls in PUMP_STRATEGY_REGISTRY.items():
                cat = strategy_catalog(name)
                entries.append({
                    "name": name,
                    "base": name,
                    "is_preset": True,
                    "default_params": cls.default_params(),
                    "current_params": cls.default_params(),
                    "param_meta": cls.param_meta() if hasattr(cls, "param_meta") else {},
                    "description": (cls.__doc__ or "").split("\n")[0],
                    "pattern_icon": cls.pattern_icon() if hasattr(cls, "pattern_icon") else "",
                    "pattern_key": getattr(cls, "pattern_key", name),
                    "is_active": (name in active_set),
                    **cat,
                })
            # 使用者自訂策略
            for name, info in self._user_strategies.items():
                base_cls = PUMP_STRATEGY_REGISTRY[info["base"]]
                cat = strategy_catalog(info["base"])
                entries.append({
                    "name": name,
                    "base": info["base"],
                    "is_preset": False,
                    "default_params": base_cls.default_params(),
                    "current_params": dict(info["params"]),
                    "param_meta": base_cls.param_meta() if hasattr(base_cls, "param_meta") else {},
                    "description": info.get("description") or f"based on {info['base']}",
                    "pattern_icon": base_cls.pattern_icon() if hasattr(base_cls, "pattern_icon") else "",
                    "pattern_key": getattr(base_cls, "pattern_key", info["base"]),
                    "is_active": (name in active_set),
                    **cat,
                })
            return {
                "active": self._strategy_name,          # 主策略（向下相容）
                "active_list": list(self._active_strategies),
                "presets": list(PUMP_STRATEGY_REGISTRY.keys()),
                "strategies": entries,
            }

    def list_risk_modes(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "active": self._risk_mode_key,
                "presets": list(risk_mode_mod.PRESET_KEYS),
                "modes": risk_mode_mod.list_all(),
                "editable_fields": risk_mode_mod.editable_fields_meta(),
                "max_allowed_leverage": risk_mode_mod.MAX_ALLOWED_LEVERAGE,
                "max_cross_leverage": risk_mode_mod.MAX_CROSS_LEVERAGE,
            }

    def _resolve_strategy(self, name: str) -> tuple[type[BaseStrategy], Dict[str, Any]]:
        """根據 name 找到 (base_class, params)。若不存在 raise KeyError。"""
        if name in PUMP_STRATEGY_REGISTRY:
            cls = PUMP_STRATEGY_REGISTRY[name]
            return cls, dict(cls.default_params())
        if name in self._user_strategies:
            info = self._user_strategies[name]
            cls = PUMP_STRATEGY_REGISTRY[info["base"]]
            return cls, dict(info["params"])
        raise KeyError(f"unknown pump strategy: {name}")

    def set_active_strategies(self, names: List[str]) -> Dict[str, Any]:
        """設定「同時啟用」的策略集合（取代整個 active 列表）。

        - 去重並保留傳入順序；順序代表優先權（同 symbol 同 tick 多個策略觸發時取最前者）。
        - 每個 name 必須是預設或既有自訂策略，否則 raise KeyError。
        """
        if not isinstance(names, (list, tuple)):
            raise ValueError("names must be a list")
        seen: set[str] = set()
        ordered: List[str] = []
        for n in names:
            if n in seen:
                continue
            self._resolve_strategy(n)  # raise if invalid
            seen.add(n)
            ordered.append(n)
        if not ordered:
            raise ValueError("至少需要啟用一個策略")
        with self._lock:
            old = list(self._active_strategies)
            self._active_strategies = ordered
            # 丟掉不再啟用的策略實例，釋放記憶體；仍啟用的沿用既有實例
            for key in [k for k in self._strategies if k[0] not in seen]:
                del self._strategies[key]
            self._emit(
                EventLevel.REGIME,
                f"[PumpStrategy] active: {', '.join(old) or '∅'} → {', '.join(ordered)}",
            )
            return self.list_strategies()

    def set_active_strategy(self, name: str) -> Dict[str, Any]:
        """向下相容：把 active 集合設為單一策略。"""
        return self.set_active_strategies([name])

    def set_strategy_active(self, name: str, active: bool) -> Dict[str, Any]:
        """切換單一策略的啟用狀態，其餘維持不變。"""
        self._resolve_strategy(name)  # raise if invalid
        current = list(self._active_strategies)
        if active:
            if name not in current:
                current.append(name)
        else:
            current = [n for n in current if n != name]
            if not current:
                raise ValueError("至少需要啟用一個策略；無法停用最後一個")
        return self.set_active_strategies(current)

    def set_risk_mode(self, key: str) -> Dict[str, Any]:
        risk_mode_mod.get(key)  # raise if invalid
        with self._lock:
            old = self._risk_mode_key
            self._risk_mode_key = key
            self._emit(
                EventLevel.REGIME,
                f"[RiskMode] {old} → {key}（即刻生效於下一筆開倉）",
            )
            return self.list_risk_modes()

    def set_trading_profile(self, profile_id: str) -> Dict[str, Any]:
        """一鍵套用交易方案（風險模式 + 單一策略）。"""
        profile = trading_profiles_mod.get(profile_id)
        if profile.get("bar") and profile["bar"] != self.bar_interval:
            raise ValueError(f"此方案需要 {profile['bar']} K 線，目前為 {self.bar_interval}。請設定 OKX_BAR={profile['bar']} 後重新啟動。")
        risk_mode_mod.get(profile["risk_mode"])
        self._resolve_strategy(profile["strategy"])
        with self._lock:
            old_rm = self._risk_mode_key
            old_strats = list(self._active_strategies)
            self._risk_mode_key = profile["risk_mode"]
            self._active_strategies = [profile["strategy"]]
            for key in [k for k in self._strategies if k[0] != profile["strategy"]]:
                del self._strategies[key]
            self._emit(
                EventLevel.REGIME,
                f"[方案] {profile['name_zh']} · {profile['strategy']}",
            )
            if old_rm != profile["risk_mode"]:
                self._emit(
                    EventLevel.REGIME,
                    f"[RiskMode] {old_rm} → {profile['risk_mode']}",
                )
            if old_strats != self._active_strategies:
                self._emit(
                    EventLevel.REGIME,
                    f"[策略] {', '.join(old_strats) or '∅'} → {profile['strategy']}",
                )
            return {"profile": profile, "ui": self._ui_snapshot_unlocked()}

    def list_trading_profiles(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "active": trading_profiles_mod.detect(
                    self._risk_mode_key, list(self._active_strategies)
                ),
                "profiles": trading_profiles_mod.list_all(),
            }

    def force_close(self, symbol: str) -> Dict[str, Any]:
        """手動平指定 symbol。"""
        with self._lock:
            pos = self.broker.get_position(symbol)
            if not pos.is_open:
                raise KeyError(f"{symbol} has no open position")
            self._close_position(symbol, reason="manual close")
            return self.snapshot()

    def close_all(self) -> Dict[str, Any]:
        """一鍵平掉所有持倉（含 PumpEngine 沒記錄但 broker 上的倉）。"""
        with self._lock:
            symbols = list(self.broker.all_positions().keys())
            if not symbols:
                self._emit(EventLevel.INFO, "[CloseAll] no open positions")
                return self.snapshot()
            self._emit(
                EventLevel.PANIC,
                f"[CloseAll] flattening {len(symbols)} positions: {', '.join(symbols)}",
            )
            for sym in symbols:
                try:
                    self._close_position(sym, reason="manual close-all")
                except Exception as exc:  # noqa: BLE001
                    self._emit(EventLevel.ERROR, f"close-all {sym} failed: {exc}")
            return self.snapshot()

    def update_strategy_params(self, name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """partial update 使用者自訂策略的 params。預設策略不可改。

        驗證：用 merged 參數試 instantiate 一次（策略 __init__ 內含參數驗證）。
        若該策略當前是 active，會清掉 per-symbol 實例下個 tick 重建。
        """
        if not isinstance(params, dict) or not params:
            raise ValueError("params must be a non-empty dict")
        if name in PUMP_STRATEGY_REGISTRY:
            raise PermissionError(
                f"strategy '{name}' is a preset and cannot be modified; "
                f"use POST /api/pump/strategies to create a custom one based on it."
            )
        if name not in self._user_strategies:
            raise KeyError(f"unknown pump strategy: {name}")

        info = self._user_strategies[name]
        cls = PUMP_STRATEGY_REGISTRY[info["base"]]
        new_params = dict(info["params"])
        new_params.update(params)

        # 驗證
        cls(symbol="__VALIDATE__", params=dict(new_params))

        with self._lock:
            info["params"] = new_params
            # 若該策略正在啟用，清掉它的 per-symbol 實例下個 tick 用新參數重建
            if name in self._active_strategies:
                for key in [k for k in self._strategies if k[0] == name]:
                    del self._strategies[key]
            self._emit(
                EventLevel.INFO,
                f"[StrategyParams] {name} 已更新：{', '.join(f'{k}={v}' for k, v in params.items())}",
            )
            return self.list_strategies()

    def add_user_strategy(
        self,
        name: str,
        base: str,
        params: Optional[Dict[str, Any]] = None,
        description: str = "",
    ) -> Dict[str, Any]:
        """以某個預設策略為基底建立使用者策略；可立即帶 partial overrides。"""
        if not _STRATEGY_KEY_PATTERN.match(name or ""):
            raise ValueError("name must match ^[A-Za-z][A-Za-z0-9_]{1,31}$")
        if name in PUMP_STRATEGY_REGISTRY or name in self._user_strategies:
            raise ValueError(f"strategy name already exists: {name}")
        if base not in PUMP_STRATEGY_REGISTRY:
            raise KeyError(f"base must be a preset: {list(PUMP_STRATEGY_REGISTRY)}")

        cls = PUMP_STRATEGY_REGISTRY[base]
        merged = dict(cls.default_params())
        merged.update(params or {})
        cls(symbol="__VALIDATE__", params=dict(merged))  # 早 fail

        with self._lock:
            self._user_strategies[name] = {
                "base": base,
                "params": merged,
                "description": str(description or "").strip(),
            }
            self._emit(
                EventLevel.INFO,
                f"[StrategyAdd] {name} (based on {base}) created",
            )
            return self.list_strategies()

    def delete_user_strategy(self, name: str) -> Dict[str, Any]:
        if name in PUMP_STRATEGY_REGISTRY:
            raise PermissionError(f"strategy '{name}' is a preset and cannot be deleted")
        if name not in self._user_strategies:
            raise KeyError(f"unknown pump strategy: {name}")
        if name in self._active_strategies:
            raise ValueError(f"cannot delete active strategy '{name}'; switch first")
        with self._lock:
            del self._user_strategies[name]
            self._emit(EventLevel.INFO, f"[StrategyDelete] {name} removed")
            return self.list_strategies()

    def update_risk_mode_params(self, key: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """partial update 使用者自訂 risk mode 的可編輯欄位。預設不可改。"""
        if not isinstance(params, dict) or not params:
            raise ValueError("params must be a non-empty dict")
        # risk_mode_mod.update 會自己擋 preset
        risk_mode_mod.update(key, params)
        with self._lock:
            self._emit(
                EventLevel.REGIME,
                f"[RiskModeParams] {key} 已更新：{', '.join(f'{k}={v}' for k, v in params.items())}",
            )
            return self.list_risk_modes()

    def add_user_risk_mode(
        self,
        key: str,
        name: str,
        base_key: str,
        description: str = "",
        overrides: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        risk_mode_mod.add(
            key=key, name=name, base_key=base_key,
            description=description, overrides=overrides or {},
        )
        with self._lock:
            self._emit(
                EventLevel.REGIME,
                f"[RiskModeAdd] {key} (based on {base_key}) created",
            )
            return self.list_risk_modes()

    def delete_user_risk_mode(self, key: str) -> Dict[str, Any]:
        # 先擋 preset（403），再擋 active（400），最後才實際刪
        rm = risk_mode_mod.get(key)
        if rm.is_preset:
            raise PermissionError(f"risk mode '{key}' is a preset and cannot be deleted")
        if key == self._risk_mode_key:
            raise ValueError(f"cannot delete active risk mode '{key}'; switch first")
        risk_mode_mod.delete(key)
        with self._lock:
            self._emit(EventLevel.REGIME, f"[RiskModeDelete] {key} removed")
            return self.list_risk_modes()

    # ------------------------------------------------------------------ #
    # 主 tick：給外部 loop 呼叫（每 N 秒一次）
    # ------------------------------------------------------------------ #
    def tick(self) -> None:
        with self._lock:
            self._maybe_refresh_universe()
            self._maybe_refresh_funding()

            # 如果 universe 變了，新增的 symbol 需要 warmup
            for item in self._universe:
                if item.inst_id not in self.market._bars:  # noqa: SLF001 - intentional
                    self.market.warmup(item.inst_id)

            # 對每個 universe symbol：fetch new bars 一次，餵給每個 active 策略各自的實例。
            # 值為 (strategy_name, signal)；同 symbol 多策略觸發時，取 active 列表中最前面者。
            new_long_signals: Dict[str, tuple[str, Signal]] = {}
            new_short_signals: Dict[str, tuple[str, Signal]] = {}
            active_strats = list(self._active_strategies)
            for item in self._universe:
                sym = item.inst_id
                # Initialize only from history preceding this fetch; do not feed new bars twice.
                instances = {name: self._ensure_strategy(name, sym) for name in active_strats}
                new_bars = self.market.fetch_new_bars(sym)
                if not new_bars:
                    continue
                funding = self._funding.get(sym)
                for strat_name in active_strats:
                    strat = instances[strat_name]
                    # 餵入即時資金費率（FundingReversion 會用；其他策略忽略）
                    strat.funding_rate = funding
                    last_buy: Optional[Signal] = None
                    last_sell: Optional[Signal] = None
                    for bar in new_bars:
                        sig = strat.push_bar(bar)
                        if sig is None:
                            continue
                        if sig.action == SignalAction.BUY:
                            last_buy = sig
                        elif sig.action == SignalAction.SELL:
                            last_sell = sig
                    if last_buy is not None and sym not in new_long_signals:
                        new_long_signals[sym] = (strat_name, last_buy)
                    if last_sell is not None and sym not in new_short_signals:
                        new_short_signals[sym] = (strat_name, last_sell)
                # bar 計數只算一次（與策略數無關）
                self._global_bar_count += len(new_bars)

            # 重新排序候選（給 UI 看；同時用於決定 pump score 高的優先進場）
            self._candidates = Scanner.rank_candidates(
                {it.inst_id: self.market.bars_of(it.inst_id) for it in self._universe},
                top_k=self.candidates_top_k,
            )

            if not self.live:
                return

            rm = risk_mode_mod.get(self._risk_mode_key)
            score_map = {c["symbol"]: c["score"] for c in self._candidates}

            wants_entry = bool(new_long_signals) or (
                not rm.long_only and bool(new_short_signals)
            )
            margin_avail = ZERO
            if wants_entry and not self._is_trading_halted():
                margin_avail = self._refresh_margin_if_needed()
                if margin_avail <= 0:
                    self._emit_margin_unavailable()

            # 進場：BUY → 開多（按 pump_score 排序）
            ordered_long = sorted(
                new_long_signals.items(),
                key=lambda kv: score_map.get(kv[0], 0.0),
                reverse=True,
            )
            for sym, (strat_name, sig) in ordered_long:
                if self._is_trading_halted() or margin_avail <= 0:
                    break
                self._try_open_long(
                    sym, sig, strat_name, pump_score=score_map.get(sym, 0.0),
                )

            # 進場：SELL → 開空（僅 long_only=False）
            if not rm.long_only and not self._is_trading_halted() and margin_avail > 0:
                ordered_short = sorted(
                    new_short_signals.items(),
                    key=lambda kv: score_map.get(kv[0], 0.0),
                    reverse=True,
                )
                for sym, (strat_name, sig) in ordered_short:
                    if rm.short_exclude_majors and self._is_major(sym):
                        continue
                    self._try_open_short(
                        sym, sig, strat_name, pump_score=score_map.get(sym, 0.0),
                    )

            # 出場管理：對既有持倉檢查止損 / 止盈 / 時間
            self._manage_open_positions()

    # ------------------------------------------------------------------ #
    # Universe 刷新
    # ------------------------------------------------------------------ #
    def _maybe_refresh_universe(self) -> None:
        if (time.time() - self._last_universe_refresh_ts) < self.universe_refresh_seconds and self._universe:
            return
        try:
            new_universe = self.scanner.refresh_universe()
        except Exception as exc:  # noqa: BLE001
            # 失敗後 60 秒再試，避免每 tick 狂打 API
            self._last_universe_refresh_ts = (
                time.time() - self.universe_refresh_seconds + 60.0
            )
            if self._universe:
                self._emit(
                    EventLevel.INFO,
                    f"refresh_universe 網路異常（沿用 {len(self._universe)} 幣）: {exc}",
                )
            else:
                self._emit(EventLevel.ERROR, f"refresh_universe failed: {exc}")
            return
        old_set = {it.inst_id for it in self._universe}
        new_set = {it.inst_id for it in new_universe}
        self._universe = new_universe
        self._last_universe_refresh_ts = time.time()

        # 新進的 symbol：preload spec
        added = list(new_set - old_set)
        if added:
            try:
                self.broker.preload_instruments(added)
            except Exception:  # noqa: BLE001
                pass

        # 被踢出 universe 的 symbol：若無持倉 → drop bars 釋放記憶體；
        # 有持倉的繼續保留（持倉管理還需要用到 bars）
        removed = old_set - new_set
        for sym in removed:
            if not self.broker.get_position(sym).is_open:
                self.market.drop(sym)
                for key in [k for k in self._strategies if k[1] == sym]:
                    del self._strategies[key]

        self._emit(
            EventLevel.INFO,
            f"[Universe] refreshed: total={len(new_set)} +{len(added)} -{len(removed)}",
        )

    def _maybe_refresh_funding(self) -> None:
        """刷新 universe 各 symbol 的資金費率（FundingReversion 用）。

        只有在有策略需要 funding 時才打 API；無 client（回測）或失敗則靜默跳過，
        funding 留空 → FundingReversion 不會觸發（其他策略不受影響）。
        """
        needs_funding = "FundingReversion" in self._active_strategies
        if not needs_funding:
            return
        if (time.time() - self._last_funding_refresh_ts) < self.funding_refresh_seconds and self._funding:
            return
        client = getattr(self.scanner, "client", None)
        if client is None or not hasattr(client, "get_funding_rate"):
            return
        self._last_funding_refresh_ts = time.time()
        updated: Dict[str, float] = {}
        for item in self._universe:
            try:
                row = client.get_funding_rate(item.inst_id)
                rate = row.get("fundingRate")
                if rate is not None and rate != "":
                    updated[item.inst_id] = float(rate)
            except Exception:  # noqa: BLE001
                continue
        if updated:
            self._funding = updated

    # ------------------------------------------------------------------ #
    # 進場
    # ------------------------------------------------------------------ #
    def _ensure_strategy(self, strategy_name: str, symbol: str) -> BaseStrategy:
        cls, params = self._resolve_strategy(strategy_name)
        key = (strategy_name, symbol)
        s = self._strategies.get(key)
        if s is not None and type(s) is cls:
            # 預設策略：cls 比對通過就沿用既有 instance；
            # 自訂策略：set/update 都會清掉對應 key，所以也安全
            return s
        s = cls(symbol=symbol, params=dict(params))
        existing_bars = self.market.bars_of(symbol)
        for b in existing_bars:
            s.bars.append(b)
        s.init()
        self._strategies[key] = s
        return s

    def _reset_daily_session_if_needed(self) -> None:
        today = datetime.now(timezone.utc).date()
        if self._session_day != today:
            self._session_day = today
            self._opens_today = 0
            self._halt_new_entries = False
            if hasattr(self.broker, "refresh_state"):
                self.broker.refresh_state()
            self._session_start_equity = self.broker.equity

    def _is_trading_halted(self) -> bool:
        """日虧熔斷：達上限後停止開新倉（仍會管理既有倉）。"""
        self._reset_daily_session_if_needed()
        if self._halt_new_entries:
            return True
        rm = risk_mode_mod.get(self._risk_mode_key)
        if rm.max_daily_loss_pct > 0 and self._session_start_equity > 0:
            if hasattr(self.broker, "refresh_state"):
                self.broker.refresh_state()
            eq = self.broker.equity
            loss_pct = float(
                (self._session_start_equity - eq) / self._session_start_equity
            )
            if loss_pct >= rm.max_daily_loss_pct:
                self._halt_new_entries = True
                self._emit(
                    EventLevel.PANIC,
                    f"日虧熔斷 {loss_pct * 100:.1f}% ≥ "
                    f"{rm.max_daily_loss_pct * 100:.0f}%，停止開新倉",
                )
                return True
        return False

    @staticmethod
    def _is_major(symbol: str) -> bool:
        base = symbol.split("-")[0].upper()
        return base in MAJOR_BASES

    @staticmethod
    def _short(symbol: str) -> str:
        """BTC-USDT-SWAP → BTC，給事件訊息用。"""
        return symbol.split("-")[0].upper()

    def _entry_allowed(
        self,
        symbol: str,
        sig: Signal,
        pump_score: float = 0.0,
    ) -> bool:
        rm = risk_mode_mod.get(self._risk_mode_key)
        if rm.min_signal_confidence > 0 and sig.confidence < rm.min_signal_confidence:
            return False
        if rm.min_pump_score > 0 and pump_score < rm.min_pump_score:
            return False
        closed_at = self._closed_at_bar.get(symbol)
        if (
            closed_at is not None
            and rm.reentry_cooldown_bars > 0
            and (self._bar_clock(symbol) - closed_at) < rm.reentry_cooldown_bars
        ):
            return False
        return True

    def _emit_margin_unavailable(self) -> None:
        """保證金不足時節流 log（策略有訊號但帳戶 USDT 不可用）。"""
        now = time.time()
        if (now - self._last_margin_warn_ts) < self._margin_warn_interval:
            return
        self._last_margin_warn_ts = now
        ccy = self.broker.margin_ccy
        reason = self.broker.margin_block_reason(ccy)
        self._emit(
            EventLevel.INFO,
            f"skip open: margin_available({ccy})=0"
            + (f" — {reason}" if reason else ""),
        )

    def _refresh_margin_if_needed(self) -> Decimal:
        """開倉前刷新保證金；回傳可用 USDT。"""
        try:
            self.broker.refresh_state()
        except Exception:  # noqa: BLE001
            pass
        return self.broker.margin_available()

    def _bar_clock(self, symbol: str) -> int:
        """Instrument-local candle clock; independent of universe size and polling."""
        from core.okx_market import _BAR_INTERVAL_SECONDS
        bars = self.market.bars_of(symbol)
        return int(bars[-1].timestamp.timestamp()) // _BAR_INTERVAL_SECONDS[self.bar_interval] if bars else 0

    def _mark_closed(self, symbol: str) -> None:
        self._closed_at_bar[symbol] = self._bar_clock(symbol)

    def _try_open_long(
        self,
        symbol: str,
        sig: Signal,
        strategy_name: Optional[str] = None,
        pump_score: float = 0.0,
    ) -> None:
        strat_name = strategy_name or self._strategy_name
        if self._is_trading_halted():
            return
        rm = risk_mode_mod.get(self._risk_mode_key)
        if rm.max_opens_per_day > 0 and self._opens_today >= rm.max_opens_per_day:
            return
        if rm.alts_only and self._is_major(symbol):
            return
        if not self._entry_allowed(symbol, sig, pump_score):
            return
        # 已有倉就不再加倉（簡化：每個 symbol 同時最多 1 個倉）
        if self.broker.get_position(symbol).is_open:
            return

        # 同 symbol 短時間重複訊號去重
        last_ts = self._last_signal_ts.get(symbol)
        if last_ts is not None and sig.timestamp == last_ts:
            return
        self._last_signal_ts[symbol] = sig.timestamp

        rm = risk_mode_mod.get(self._risk_mode_key)

        # 倉位數量檢查
        open_count = sum(1 for p in self.broker.all_positions().values())
        if open_count >= rm.max_concurrent:
            return

        margin_avail = self.broker.margin_available()
        if margin_avail <= 0:
            return

        # 槓桿：min(rm.leverage, spec.max_lever)；保證金模式由 risk mode 決定
        pos_side = "long" if self.broker.pos_mode == "long_short_mode" else None
        try:
            spec = self.broker.ensure_instrument(symbol)
            target_lev = rm.clamp_leverage(spec.max_lever)
            self.broker.set_leverage(
                symbol, target_lev, td_mode=rm.td_mode, pos_side=pos_side
            )
        except Exception as exc:  # noqa: BLE001
            self._emit(
                EventLevel.ERROR,
                f"set_leverage failed for {symbol}: {exc}",
            )
            return

        # 名目開倉金額 = available_margin × position_fraction × leverage
        notional = margin_avail * rm.position_fraction * Decimal(target_lev)

        # 計算 ATR 用於止損
        bars = self.market.bars_of(symbol)
        atr_v = atr(
            [b.high for b in bars],
            [b.low for b in bars],
            [b.close for b in bars],
            self.atr_period,
        )
        if atr_v is None or atr_v <= 0:
            self._emit(
                EventLevel.ERROR,
                f"{symbol}: ATR unavailable (bars={len(bars)}); skip open",
            )
            return
        atr_dec = Decimal(str(atr_v))
        entry_price_ref = sig.price
        stop_price = entry_price_ref - atr_dec * Decimal(str(rm.stop_atr_mult))
        risk_per_unit = entry_price_ref - stop_price
        tp_price = entry_price_ref + risk_per_unit * Decimal(str(rm.take_profit_r))

        try:
            trade = self.broker.open_long(
                symbol=symbol,
                notional_usdt=notional,
                ref_price=entry_price_ref,
                timestamp=sig.timestamp,
                td_mode=rm.td_mode,
                stop_loss_price=stop_price,
            )
        except Exception as exc:  # noqa: BLE001
            self._emit(EventLevel.ERROR, f"open_long {symbol} failed: {exc}")
            return

        confirmed = self._confirm_exchange_position(symbol, PositionSide.LONG)
        if confirmed is None:
            self._emit(
                EventLevel.INFO,
                f"open_long {symbol}: 訂單已送出但 OKX 無持倉，不記錄 TRADE",
            )
            return
        trade = self._sync_trade_with_position(trade, confirmed)

        self._position_states[symbol] = PositionState(
            entry_price=trade.price if trade.price > 0 else entry_price_ref,
            entry_atr=atr_dec,
            entry_bar_idx=self._bar_clock(symbol),
            leverage=target_lev,
            td_mode=rm.td_mode,
            initial_stop=stop_price,
            take_profit=tp_price,
            risk_per_unit=risk_per_unit,
            max_close_seen=trade.price if trade.price > 0 else entry_price_ref,
            extra={
                "signal_reason": sig.reason,
                "risk_mode": self._risk_mode_key,
                "strategy": strat_name,
            },
        )
        self._emit_trade(
            trade, kind="OPEN LONG",
            note=f"{strat_name}/{self._risk_mode_key} {rm.td_mode} {target_lev}x — {sig.reason}",
        )
        self._opens_today += 1

    def _try_open_short(
        self,
        symbol: str,
        sig: Signal,
        strategy_name: Optional[str] = None,
        pump_score: float = 0.0,
    ) -> None:
        strat_name = strategy_name or self._strategy_name
        if self._is_trading_halted():
            return
        rm = risk_mode_mod.get(self._risk_mode_key)
        if rm.max_opens_per_day > 0 and self._opens_today >= rm.max_opens_per_day:
            return
        if not self._entry_allowed(symbol, sig, pump_score):
            return
        if self.broker.get_position(symbol).is_open:
            return

        last_ts = self._last_signal_ts.get(f"{symbol}:short")
        if last_ts is not None and sig.timestamp == last_ts:
            return
        self._last_signal_ts[f"{symbol}:short"] = sig.timestamp

        rm = risk_mode_mod.get(self._risk_mode_key)
        if rm.long_only:
            return

        open_count = sum(1 for p in self.broker.all_positions().values())
        if open_count >= rm.max_concurrent:
            return

        margin_avail = self.broker.margin_available()
        if margin_avail <= 0:
            return

        pos_side = "short" if self.broker.pos_mode == "long_short_mode" else None
        try:
            spec = self.broker.ensure_instrument(symbol)
            target_lev = rm.clamp_leverage(spec.max_lever)
            self.broker.set_leverage(
                symbol, target_lev, td_mode=rm.td_mode, pos_side=pos_side
            )
        except Exception as exc:  # noqa: BLE001
            self._emit(EventLevel.ERROR, f"set_leverage failed for {symbol}: {exc}")
            return

        notional = margin_avail * rm.position_fraction * Decimal(target_lev)

        bars = self.market.bars_of(symbol)
        atr_v = atr(
            [b.high for b in bars],
            [b.low for b in bars],
            [b.close for b in bars],
            self.atr_period,
        )
        if atr_v is None or atr_v <= 0:
            self._emit(EventLevel.ERROR, f"{symbol}: ATR unavailable; skip short")
            return
        atr_dec = Decimal(str(atr_v))
        entry_price_ref = sig.price
        stop_mult = rm.short_stop_mult()
        tp_r = rm.short_tp_r()
        stop_price = entry_price_ref + atr_dec * Decimal(str(stop_mult))
        risk_per_unit = stop_price - entry_price_ref
        tp_price = entry_price_ref - risk_per_unit * Decimal(str(tp_r))

        try:
            trade = self.broker.open_short(
                symbol=symbol,
                notional_usdt=notional,
                ref_price=entry_price_ref,
                timestamp=sig.timestamp,
                td_mode=rm.td_mode,
                stop_loss_price=stop_price,
            )
        except Exception as exc:  # noqa: BLE001
            self._emit(EventLevel.ERROR, f"open_short {symbol} failed: {exc}")
            return

        confirmed = self._confirm_exchange_position(symbol, PositionSide.SHORT)
        if confirmed is None:
            self._emit(
                EventLevel.INFO,
                f"open_short {symbol}: 訂單已送出但 OKX 無持倉，不記錄 TRADE",
            )
            return
        trade = self._sync_trade_with_position(trade, confirmed)

        fill = trade.price if trade.price > 0 else entry_price_ref
        self._position_states[symbol] = PositionState(
            entry_price=fill,
            entry_atr=atr_dec,
            entry_bar_idx=self._bar_clock(symbol),
            leverage=target_lev,
            td_mode=rm.td_mode,
            initial_stop=stop_price,
            take_profit=tp_price,
            risk_per_unit=risk_per_unit,
            max_close_seen=fill,
            min_close_seen=fill,
            extra={
                "signal_reason": sig.reason,
                "risk_mode": self._risk_mode_key,
                "strategy": strat_name,
                "side": "SHORT",
            },
        )
        self._emit_trade(
            trade, kind="OPEN SHORT",
            note=f"{strat_name}/{self._risk_mode_key} {rm.td_mode} {target_lev}x — {sig.reason}",
        )
        self._opens_today += 1

    # ------------------------------------------------------------------ #
    # 持倉管理
    # ------------------------------------------------------------------ #
    def _manage_open_positions(self) -> None:
        rm = risk_mode_mod.get(self._risk_mode_key)
        now = time.time()
        for sym, pos in list(self.broker.all_positions().items()):
            if now < self._close_backoff.get(sym, 0.0):
                continue
            state = self._position_states.get(sym)
            if state is None:
                # 倉位不是這個 engine 開的（之前進場、重啟後找回）；建一個保守 state
                bars = self.market.bars_of(sym) or self.market.warmup(sym)
                if not bars:
                    continue
                last_close = bars[-1].close
                state = PositionState(
                    entry_price=pos.avg_entry_price,
                    entry_atr=Decimal("0"),
                    entry_bar_idx=self._bar_clock(sym),
                    leverage=pos.leverage,
                    initial_stop=Decimal("0"),
                    take_profit=Decimal("0"),
                    max_close_seen=last_close,
                )
                self._position_states[sym] = state

            bars = self.market.bars_of(sym)
            if not bars:
                continue
            last_close = bars[-1].close

            be_r = Decimal(str(rm.breakeven_at_r)) if rm.breakeven_at_r > 0 else ZERO
            has_trail = rm.trail_atr_mult > 0 and state.entry_atr > 0

            if pos.side == PositionSide.LONG:
                if last_close > state.max_close_seen:
                    state.max_close_seen = last_close

                # ① 保本階梯：浮盈達 breakeven_at_r×R 後把停損抬到進場價（只升不降）
                if be_r > 0 and state.risk_per_unit > 0 and state.initial_stop < state.entry_price:
                    if (last_close - state.entry_price) / state.risk_per_unit >= be_r:
                        state.initial_stop = state.entry_price
                        self._emit(EventLevel.INFO, f"{self._short(sym)} 停損移到保本價 @ {state.entry_price}")
                        self._sync_exchange_stop(sym, state.initial_stop)

                # ② 停損（含已抬高的保本 / 鎖利價）
                if state.initial_stop > 0 and last_close <= state.initial_stop:
                    self._close_position(sym, reason=f"stop @ {state.initial_stop}")
                    continue

                # ③ 止盈：runner_after_tp 時不全平，改鎖利續抱（停損抬到止盈價、關閉硬止盈）
                if state.take_profit > 0 and last_close >= state.take_profit:
                    if rm.runner_after_tp and has_trail:
                        if state.take_profit > state.initial_stop:
                            state.initial_stop = state.take_profit
                        state.take_profit = ZERO
                        self._emit(EventLevel.INFO, f"{self._short(sym)} 達止盈轉續抱，鎖利停損 @ {state.initial_stop}")
                        self._sync_exchange_stop(sym, state.initial_stop)
                    else:
                        self._close_position(sym, reason=f"take profit @ {state.take_profit}")
                        continue

                # ④ 移動停損
                if has_trail:
                    trail_stop = state.max_close_seen - state.entry_atr * Decimal(str(rm.trail_atr_mult))
                    if last_close <= trail_stop and last_close > state.entry_price:
                        self._close_position(sym, reason=f"trailing stop @ {trail_stop:.6f}")
                        continue

            elif pos.side == PositionSide.SHORT:
                if state.min_close_seen <= 0 or last_close < state.min_close_seen:
                    state.min_close_seen = last_close

                if be_r > 0 and state.risk_per_unit > 0 and state.initial_stop > state.entry_price:
                    if (state.entry_price - last_close) / state.risk_per_unit >= be_r:
                        state.initial_stop = state.entry_price
                        self._emit(EventLevel.INFO, f"{self._short(sym)} 停損移到保本價 @ {state.entry_price}")
                        self._sync_exchange_stop(sym, state.initial_stop)

                if state.initial_stop > 0 and last_close >= state.initial_stop:
                    self._close_position(sym, reason=f"stop @ {state.initial_stop}")
                    continue

                if state.take_profit > 0 and last_close <= state.take_profit:
                    if rm.runner_after_tp and has_trail:
                        if state.initial_stop == 0 or state.take_profit < state.initial_stop:
                            state.initial_stop = state.take_profit
                        state.take_profit = ZERO
                        self._emit(EventLevel.INFO, f"{self._short(sym)} 達止盈轉續抱，鎖利停損 @ {state.initial_stop}")
                        self._sync_exchange_stop(sym, state.initial_stop)
                    else:
                        self._close_position(sym, reason=f"take profit @ {state.take_profit}")
                        continue

                if has_trail:
                    trail_stop = state.min_close_seen + state.entry_atr * Decimal(str(rm.trail_atr_mult))
                    if last_close >= trail_stop and last_close < state.entry_price:
                        self._close_position(sym, reason=f"trailing stop @ {trail_stop:.6f}")
                        continue

            else:
                continue

            # ④ 持倉時間（多空可不同上限）
            max_hold = rm.short_hold_bars() if pos.side == PositionSide.SHORT else rm.max_hold_bars
            if max_hold > 0:
                held = self._bar_clock(sym) - state.entry_bar_idx
                if held >= max_hold:
                    self._close_position(sym, reason=f"max hold {max_hold} bars")
                    continue

    def _sync_exchange_stop(self, symbol: str, new_stop: Decimal) -> None:
        """把交易所端附加停損單同步到軟體端剛移動的停損價（保本/鎖利時呼叫）。

        失敗只記 log、不拋例外 — 軟體停損仍是主要出場邏輯，交易所端只是備援，
        不能因為 amend 失敗就打斷整個管倉迴圈。
        """
        if not hasattr(self.broker, "update_stop"):
            return
        try:
            synced = self.broker.update_stop(symbol, new_stop)
            if not synced:
                self._emit(
                    EventLevel.INFO,
                    f"{self._short(symbol)} 交易所端無附加停損單可同步（僅軟體停損生效）",
                )
        except Exception as exc:  # noqa: BLE001
            self._emit(
                EventLevel.ERROR,
                f"{self._short(symbol)} 同步交易所端停損失敗（軟體停損仍在）: {exc}",
            )

    def _close_position(self, symbol: str, reason: str = "") -> None:
        if time.time() < self._close_backoff.get(symbol, 0.0):
            return
        state = self._position_states.get(symbol)
        td_mode = state.td_mode if state else None
        try:
            trade = self.broker.close_position(symbol=symbol, td_mode=td_mode)
        except Exception as exc:  # noqa: BLE001
            if isinstance(exc, OKXAPIError) and exc.code == "CLOSED_SYNC":
                self._position_states.pop(symbol, None)
                self._close_backoff.pop(symbol, None)
                self._mark_closed(symbol)
                self._emit(
                    EventLevel.INFO,
                    f"close {symbol} OKX 已平倉（逾時後同步） — {reason}",
                )
                return
            if hasattr(self.broker, "refresh_state"):
                self.broker.refresh_state()
            if not self.broker.get_position(symbol).is_open:
                self._position_states.pop(symbol, None)
                self._close_backoff.pop(symbol, None)
                self._mark_closed(symbol)
                self._emit(
                    EventLevel.INFO,
                    f"close {symbol} OKX 已平倉（同步） — {reason}",
                )
                return
            self._close_backoff[symbol] = time.time() + 45.0
            self._emit(
                EventLevel.INFO,
                f"close {symbol} 待重試（OKX Demo 平倉較慢）: {exc}",
            )
            return
        self._close_backoff.pop(symbol, None)
        self._mark_closed(symbol)
        self._emit_trade(trade, kind="CLOSE", note=reason)
        self._position_states.pop(symbol, None)

    def _confirm_exchange_position(
        self,
        symbol: str,
        expected_side: PositionSide,
    ) -> Optional[Position]:
        """向 OKX 同步持倉；只有確認有倉才在後台顯示 TRADE。"""
        if hasattr(self.broker, "refresh_state"):
            self.broker.refresh_state()
        pos = self.broker.get_position(symbol)
        if not pos.is_open:
            time.sleep(0.5)
            if hasattr(self.broker, "refresh_state"):
                self.broker.refresh_state()
            pos = self.broker.get_position(symbol)
        if not pos.is_open or pos.side != expected_side:
            return None
        return pos

    @staticmethod
    def _sync_trade_with_position(trade: Trade, pos: Position) -> Trade:
        price = pos.avg_entry_price if pos.avg_entry_price > 0 else trade.price
        if price == trade.price and pos.quantity == trade.quantity:
            return trade
        return Trade(
            timestamp=trade.timestamp,
            symbol=trade.symbol,
            side=trade.side,
            price=price,
            quantity=pos.quantity,
            fee=trade.fee,
            realized_pnl=trade.realized_pnl,
        )

    def _emit_trade(self, trade: Trade, kind: str, note: str = "") -> None:
        msg = (
            f"{kind} {trade.side.value} {trade.quantity} {trade.symbol} @ {trade.price} "
            f"(fee={trade.fee:.4f}"
        )
        if trade.realized_pnl != 0:
            msg += f", PnL={trade.realized_pnl:.2f}"
        msg += ")"
        if note:
            msg += f" — {note}"
        self._emit(
            EventLevel.TRADE, msg,
            symbol=trade.symbol, side=trade.side.value,
            price=str(trade.price), quantity=str(trade.quantity),
            realized_pnl=str(trade.realized_pnl),
        )

    # ------------------------------------------------------------------ #
    # Snapshot（給 UI）
    # ------------------------------------------------------------------ #
    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return self._snapshot_unlocked()

    def _ui_snapshot_unlocked(self) -> Dict[str, Any]:
        """給前端的人性化狀態（非量化術語）。"""
        rm = risk_mode_mod.get(self._risk_mode_key)
        positions = self.broker.all_positions()
        profile_id = trading_profiles_mod.detect(
            self._risk_mode_key, list(self._active_strategies)
        )
        strat_key = self._strategy_name
        cat = strategy_catalog(strat_key)

        try:
            margin_avail = float(self.broker.margin_available())
        except Exception:  # noqa: BLE001
            margin_avail = 0.0
        margin_reason = ""
        if hasattr(self.broker, "margin_block_reason"):
            margin_reason = self.broker.margin_block_reason() or ""

        self._reset_daily_session_if_needed()
        halted = self._is_trading_halted()

        if halted:
            status_code = "halted"
            status_zh = "今日風控熔斷，暫停開新倉"
            status_en = "Daily risk halt — no new entries"
        elif margin_avail <= 0 and not positions:
            status_code = "margin_blocked"
            status_zh = margin_reason or "USDT 保證金不足，無法開倉"
            status_en = margin_reason or "Insufficient USDT margin"
        elif positions:
            n = len(positions)
            status_code = "holding"
            status_zh = f"持倉中 · {n} 筆"
            status_en = f"Holding {n} position(s)"
        else:
            status_code = "scanning"
            status_zh = "掃描小幣 · 等待型態確認"
            status_en = "Scanning alts · waiting for setup"

        opens_left: Optional[int] = None
        if rm.max_opens_per_day > 0:
            opens_left = max(0, rm.max_opens_per_day - self._opens_today)

        # 今日損益（相對當日起始權益）— 給 UI 顯示「今天賺/賠多少」
        day_pnl = 0.0
        day_pnl_pct = 0.0
        try:
            if self._session_start_equity > 0:
                eq_now = self.broker.equity
                day_pnl = float(eq_now - self._session_start_equity)
                day_pnl_pct = float(
                    (eq_now - self._session_start_equity) / self._session_start_equity
                )
        except Exception:  # noqa: BLE001
            pass

        return {
            "profile_id": profile_id,
            "profiles": trading_profiles_mod.list_all(),
            "day_pnl": day_pnl,
            "day_pnl_pct": day_pnl_pct,
            "status": {
                "code": status_code,
                "message_zh": status_zh,
                "message_en": status_en,
            },
            "plan": {
                "strategy_key": strat_key,
                "strategy_name_zh": cat.get("name_zh", strat_key),
                "strategy_name_en": cat.get("name_en", strat_key),
                "strategy_tagline_zh": cat.get("tagline_zh", ""),
                "strategy_tagline_en": cat.get("tagline_en", ""),
                "risk_mode_key": self._risk_mode_key,
                "risk_mode_name": rm.name,
                "leverage": rm.leverage,
                "td_mode": rm.td_mode,
                "position_fraction": float(rm.position_fraction),
                "stop_atr_mult": rm.stop_atr_mult,
                "take_profit_r": rm.take_profit_r,
                "trail_atr_mult": rm.trail_atr_mult,
                "breakeven_at_r": rm.breakeven_at_r,
                "runner_after_tp": rm.runner_after_tp,
                "max_hold_bars": rm.max_hold_bars,
                "max_opens_per_day": rm.max_opens_per_day,
                "opens_today": self._opens_today,
                "opens_left": opens_left,
                "max_concurrent": rm.max_concurrent,
                "long_only": rm.long_only,
            },
            "margin_available": margin_avail,
        }

    def _snapshot_unlocked(self) -> Dict[str, Any]:
        # 用每個 symbol 的最新收盤當 mark price
        marks: Dict[str, Decimal] = {}
        for sym, pos in self.broker.all_positions().items():
            last = self.market.last_close(sym)
            marks[sym] = last if last is not None else pos.avg_entry_price

        broker_snap = self.broker.snapshot(marks)
        positions_with_state: List[Dict[str, Any]] = []
        for sym, pos in self.broker.all_positions().items():
            state = self._position_states.get(sym)
            last = self.market.last_close(sym)
            upnl = pos.unrealized_pnl(last) if last is not None else ZERO
            entry = state.entry_price if state else pos.avg_entry_price
            ret_pct = float((last - entry) / entry) if (last is not None and entry > 0) else 0.0
            positions_with_state.append({
                "symbol": sym,
                "side": pos.side.value,
                "quantity": str(pos.quantity),
                "avg_entry_price": str(pos.avg_entry_price),
                "leverage": pos.leverage,
                "liq_price": str(pos.liq_price) if pos.liq_price else None,
                "td_mode": state.td_mode if state else None,
                "last_close": str(last) if last is not None else None,
                "unrealized_pnl": str(upnl),
                "return_pct": ret_pct,
                "initial_stop": str(state.initial_stop) if state else None,
                "take_profit": str(state.take_profit) if state else None,
                "max_close_seen": str(state.max_close_seen) if state else None,
                "strategy": (state.extra or {}).get("strategy") if state else None,
                "risk_mode": (state.extra or {}).get("risk_mode") if state else None,
            })

        return {
            "mode": "pump",
            "bar_interval": self.bar_interval,
            "ui": self._ui_snapshot_unlocked(),
            "active_strategy": self._strategy_name,
            "active_strategies": list(self._active_strategies),
            "active_risk_mode": self._risk_mode_key,
            "universe_count": len(self._universe),
            "candidates": self._candidates,
            "positions": positions_with_state,
            "account": broker_snap,
            "global_bar_count": self._global_bar_count,
            "strategies": self.list_strategies(),
            "risk_modes": self.list_risk_modes(),
        }
