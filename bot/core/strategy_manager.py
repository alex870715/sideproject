"""策略管理器：偵測市場狀態並路由到對應策略。

職責拆分：
- `MarketStateDetector`：純粹的指標計算 + 狀態判定（無副作用、易測試）。
- `StrategyManager`：持有策略池，根據偵測結果切換 active 策略，
  並將 bar 推送給「全部策略」（讓被休眠的策略也保持指標熱機，
  下一次被叫醒時不會冷啟動）。

對外契約：
    StrategyManager.process(bar) -> ManagerOutput
        ├─ regime           # 當前判定的市場狀態
        ├─ active_strategy  # 啟用中的策略名稱
        ├─ regime_changed   # 與上一根 bar 比是否改變
        ├─ signal           # 當根 bar 從 active 策略產出的訊號（可為 None）
        └─ force_flatten    # 是否要求 Engine 強制平倉（黑天鵝）
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Dict, List, Optional

from strategies.base_strategy import (
    Bar,
    BaseStrategy,
    MarketRegime,
    Signal,
)
from strategies.indicators import (
    adx,
    atr,
    percentile_rank,
    rsi,
)


# ---------------------------------------------------------------------- #
# 狀態偵測器
# ---------------------------------------------------------------------- #
@dataclass
class RegimeSnapshot:
    """每根 bar 的偵測結果，可用於 Dashboard 顯示。"""

    regime: MarketRegime
    adx: Optional[float]
    atr: Optional[float]
    atr_percentile: Optional[float]
    rsi: Optional[float]
    note: str = ""


class MarketStateDetector:
    """以 ADX / ATR / RSI 三指標判斷市場狀態。

    判斷規則（依優先順序）：
      1. ATR 飆到歷史 95 百分位以上 → HIGH_VOLATILITY（黑天鵝）
      2. RSI 極端值 (<25 或 >75)   → BREAKOUT（短暫由 RSI 策略接管）
      3. ADX > 25 且非極端波動     → TRENDING_UP / TRENDING_DOWN
      4. ADX <= 25 且 ATR 偏低     → LOW_VOLATILITY
      5. ADX <= 25 一般情況        → RANGING
      6. 數據不足                  → UNKNOWN
    """

    def __init__(
        self,
        adx_period: int = 14,
        atr_period: int = 14,
        rsi_period: int = 14,
        adx_trend_threshold: float = 25.0,
        atr_panic_percentile: float = 0.95,
        atr_low_percentile: float = 0.30,
        rsi_extreme_low: float = 25.0,
        rsi_extreme_high: float = 75.0,
        atr_history_max: int = 300,
    ) -> None:
        self.adx_period = adx_period
        self.atr_period = atr_period
        self.rsi_period = rsi_period
        self.adx_trend_threshold = adx_trend_threshold
        self.atr_panic_percentile = atr_panic_percentile
        self.atr_low_percentile = atr_low_percentile
        self.rsi_extreme_low = rsi_extreme_low
        self.rsi_extreme_high = rsi_extreme_high
        self.atr_history_max = atr_history_max

        self._atr_history: List[float] = []

    def _record_atr(self, value: float) -> None:
        self._atr_history.append(value)
        if len(self._atr_history) > self.atr_history_max:
            self._atr_history = self._atr_history[-self.atr_history_max :]

    def detect(self, bars: List[Bar]) -> RegimeSnapshot:
        if len(bars) < max(self.adx_period * 2 + 1, self.rsi_period + 2):
            return RegimeSnapshot(
                regime=MarketRegime.UNKNOWN,
                adx=None,
                atr=None,
                atr_percentile=None,
                rsi=None,
                note="warming up",
            )

        highs = [b.high for b in bars]
        lows = [b.low for b in bars]
        closes = [b.close for b in bars]

        adx_v = adx(highs, lows, closes, self.adx_period)
        atr_v = atr(highs, lows, closes, self.atr_period)
        rsi_v = rsi(closes, self.rsi_period)

        atr_pct: Optional[float] = None
        if atr_v is not None:
            # 用「過去」歷史去評估目前 ATR 的位置（避免把當前值算進歷史）
            atr_pct = percentile_rank(self._atr_history, atr_v) if self._atr_history else 0.5
            self._record_atr(atr_v)

        # 1. 黑天鵝
        if atr_pct is not None and atr_pct >= self.atr_panic_percentile:
            return RegimeSnapshot(
                regime=MarketRegime.HIGH_VOLATILITY,
                adx=adx_v, atr=atr_v, atr_percentile=atr_pct, rsi=rsi_v,
                note=f"ATR percentile {atr_pct:.0%} >= panic threshold",
            )

        # 2. RSI 極端值
        if rsi_v is not None and (rsi_v <= self.rsi_extreme_low or rsi_v >= self.rsi_extreme_high):
            return RegimeSnapshot(
                regime=MarketRegime.BREAKOUT,
                adx=adx_v, atr=atr_v, atr_percentile=atr_pct, rsi=rsi_v,
                note=f"Extreme RSI={rsi_v:.1f}",
            )

        # 3. 趨勢
        if adx_v is not None and adx_v > self.adx_trend_threshold:
            # 用最近 N 根的方向決定漲/跌趨勢
            recent = closes[-self.adx_period :]
            up = float(recent[-1]) > float(recent[0])
            return RegimeSnapshot(
                regime=MarketRegime.TRENDING_UP if up else MarketRegime.TRENDING_DOWN,
                adx=adx_v, atr=atr_v, atr_percentile=atr_pct, rsi=rsi_v,
                note=f"ADX={adx_v:.1f} > {self.adx_trend_threshold}",
            )

        # 4. 低波動橫盤
        if atr_pct is not None and atr_pct <= self.atr_low_percentile:
            return RegimeSnapshot(
                regime=MarketRegime.LOW_VOLATILITY,
                adx=adx_v, atr=atr_v, atr_percentile=atr_pct, rsi=rsi_v,
                note=f"ATR percentile {atr_pct:.0%} <= {self.atr_low_percentile:.0%}",
            )

        # 5. 預設：震盪
        adx_str = f"{adx_v:.1f}" if adx_v is not None else "n/a"
        return RegimeSnapshot(
            regime=MarketRegime.RANGING,
            adx=adx_v, atr=atr_v, atr_percentile=atr_pct, rsi=rsi_v,
            note=f"ADX={adx_str}",
        )


# ---------------------------------------------------------------------- #
# 策略管理器
# ---------------------------------------------------------------------- #
@dataclass
class ManagerOutput:
    regime: MarketRegime
    active_strategy: str
    regime_changed: bool
    signal: Optional[Signal]
    force_flatten: bool
    snapshot: RegimeSnapshot


class StrategyManager:
    """根據市場狀態切換 active 策略。

    Args:
        strategies:  {regime: BaseStrategy} 的對應表。一個策略可服務多個 regime
                     （但每個 regime 只能有一個 active 策略）。
        default_regime: 在偵測器回傳 UNKNOWN 時使用的預設 regime（通常是 RANGING）。
    """

    def __init__(
        self,
        strategies: Dict[MarketRegime, BaseStrategy],
        detector: Optional[MarketStateDetector] = None,
        default_regime: MarketRegime = MarketRegime.RANGING,
    ) -> None:
        if not strategies:
            raise ValueError("strategies cannot be empty")
        self._strategies_by_regime: Dict[MarketRegime, BaseStrategy] = strategies
        # 用 id 去重，得到所有獨立策略實例
        seen_ids: set[int] = set()
        self._all_strategies: List[BaseStrategy] = []
        for strat in strategies.values():
            if id(strat) not in seen_ids:
                seen_ids.add(id(strat))
                self._all_strategies.append(strat)

        # name → strategy 對照表（讓 set_override / update_params 可以按名字找）
        self._name_to_strategy: Dict[str, BaseStrategy] = {
            s.name: s for s in self._all_strategies
        }
        if len(self._name_to_strategy) != len(self._all_strategies):
            raise ValueError("strategy names must be unique")

        self.detector = detector or MarketStateDetector()
        self.default_regime = default_regime
        self._bars: List[Bar] = []
        self._current_regime: MarketRegime = MarketRegime.UNKNOWN
        self._active: BaseStrategy = strategies.get(
            default_regime, next(iter(strategies.values()))
        )
        # 手動 override：非 None 時不再依 regime 切換策略
        self._override_name: Optional[str] = None

        # 初始化所有策略
        for strat in self._all_strategies:
            strat.init()

    # ------------------ 查詢 ------------------
    @property
    def current_regime(self) -> MarketRegime:
        return self._current_regime

    @property
    def active_strategy(self) -> BaseStrategy:
        return self._active

    @property
    def all_strategies(self) -> List[BaseStrategy]:
        return list(self._all_strategies)

    @property
    def override_name(self) -> Optional[str]:
        return self._override_name

    @property
    def is_overridden(self) -> bool:
        return self._override_name is not None

    def describe(self) -> Dict[str, Any]:
        return self.list_describe()

    def list_describe(self) -> Dict[str, Any]:
        """完整快照：給 Web UI 渲染策略卡片用。"""
        return {
            "current_regime": self._current_regime.value,
            "active_strategy": self._active.name,
            "override": self._override_name,
            "regime_to_strategy": {
                r.value: s.name for r, s in self._strategies_by_regime.items()
            },
            "strategies": [
                {
                    **s.describe(),
                    "is_active": s is self._active,
                    "regimes": [
                        r.value for r, st in self._strategies_by_regime.items()
                        if st is s
                    ],
                }
                for s in self._all_strategies
            ],
        }

    # ------------------ 手動 override ------------------
    def set_override(self, name: Optional[str]) -> Dict[str, Any]:
        """指定 name 強制啟用某策略；name=None 釋放 override 回到 regime 自動切換。"""
        if name is None:
            self._override_name = None
            return self.list_describe()

        if name not in self._name_to_strategy:
            raise KeyError(f"unknown strategy: {name}")
        target = self._name_to_strategy[name]
        self._override_name = name

        # 立即切換 active；不等下一根 bar
        if target is not self._active:
            for s in self._all_strategies:
                s.disable()
            target.enable()
            if hasattr(target, "set_center") and self._bars:
                recent = self._bars[-20:] if len(self._bars) >= 20 else self._bars
                median = sorted(float(b.close) for b in recent)[len(recent) // 2]
                target.set_center(Decimal(str(median)))
            self._active = target
        return self.list_describe()

    # ------------------ 動態調整參數 ------------------
    def update_params(self, name: str, new_params: Dict[str, Any]) -> Dict[str, Any]:
        """重建指定策略以套用新參數；保留 bar 歷史避免冷啟動。

        - 對 new_params 內的 key，若該 key 已存在於 strategy.params，依當前型別 coerce。
        - 重建後新 instance 會替換掉所有 references（_active / regime map / name map）。
        """
        if name not in self._name_to_strategy:
            raise KeyError(f"unknown strategy: {name}")
        old = self._name_to_strategy[name]

        merged = dict(old.params)
        for k, v in new_params.items():
            if k in old.params:
                current = old.params[k]
                if isinstance(current, bool):
                    merged[k] = (
                        v if isinstance(v, bool)
                        else (str(v).strip().lower() in ("true", "1", "yes"))
                    )
                elif isinstance(current, int) and not isinstance(current, bool):
                    merged[k] = int(v)
                elif isinstance(current, float):
                    merged[k] = float(v)
                else:
                    merged[k] = v
            else:
                merged[k] = v

        # 重建策略；__init__ 內的參數驗證（如 short_period < long_period）會在這裡 raise
        new_strat = type(old)(symbol=old.symbol, params=merged)
        new_strat.bars = list(old.bars)
        new_strat._initialized = old._initialized  # noqa: SLF001
        if not old.enabled:
            new_strat.disable()
        new_strat.init()

        # 更新所有 references
        self._name_to_strategy[name] = new_strat
        for i, s in enumerate(self._all_strategies):
            if s is old:
                self._all_strategies[i] = new_strat
        for r, s in list(self._strategies_by_regime.items()):
            if s is old:
                self._strategies_by_regime[r] = new_strat
        if self._active is old:
            self._active = new_strat

        return {
            **new_strat.describe(),
            "is_active": new_strat is self._active,
            "regimes": [
                r.value for r, st in self._strategies_by_regime.items()
                if st is new_strat
            ],
        }

    # ------------------ 主流程 ------------------
    def process(self, bar: Bar) -> ManagerOutput:
        # 維護管理器自身的 bar 歷史（用於 detector）
        self._bars.append(bar)
        if len(self._bars) > 500:
            self._bars = self._bars[-500:]

        # 1) 偵測 regime
        snap = self.detector.detect(self._bars)
        regime = snap.regime if snap.regime != MarketRegime.UNKNOWN else self.default_regime

        # 2) 路由策略：override 優先；否則依 regime 對應表
        if self._override_name and self._override_name in self._name_to_strategy:
            target = self._name_to_strategy[self._override_name]
        else:
            target = self._strategies_by_regime.get(regime, self._active)
        regime_changed = regime != self._current_regime
        switched = target is not self._active

        if switched:
            # 把舊策略停用，新策略啟用
            for s in self._all_strategies:
                s.disable()
            target.enable()
            # 切換到 Grid 時，重新校準中心價（避免拿趨勢段的舊價當中心）
            if hasattr(target, "set_center"):
                recent = self._bars[-20:] if len(self._bars) >= 20 else self._bars
                if recent:
                    median = sorted(float(b.close) for b in recent)[len(recent) // 2]
                    target.set_center(Decimal(str(median)))
            self._active = target

        self._current_regime = regime

        # 3) 把 bar 推給「所有」策略：
        #    - 全部都會更新 self.bars（指標熱機），
        #    - 只有 active 策略會真正呼叫 check_signal 產生訊號（內建於 push_bar）。
        active_signal: Optional[Signal] = None
        for strat in self._all_strategies:
            sig = strat.push_bar(bar)
            if strat is self._active:
                active_signal = sig

        force_flatten = regime == MarketRegime.HIGH_VOLATILITY

        return ManagerOutput(
            regime=regime,
            active_strategy=self._active.name,
            regime_changed=regime_changed,
            signal=active_signal,
            force_flatten=force_flatten,
            snapshot=snap,
        )
