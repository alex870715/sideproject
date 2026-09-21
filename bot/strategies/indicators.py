"""共用技術指標。

設計原則：
- 對外接受 `Sequence[Decimal]`（與 Bar/Account 對齊），內部以 float 計算（速度 + numpy 向量化）。
- 所有函式都是「純函式」：給定相同序列回傳相同結果，方便單元測試。
- 不足週期時統一回傳 `None`（而非 NaN），由策略決定是否略過該根 K 線。
"""

from __future__ import annotations

from decimal import Decimal
from typing import List, Optional, Sequence, Tuple

import numpy as np


def _to_float_array(values: Sequence[Decimal]) -> np.ndarray:
    return np.fromiter((float(v) for v in values), dtype=float, count=len(values))


def sma(values: Sequence[Decimal], period: int) -> Optional[float]:
    """單純移動平均（Simple Moving Average）。"""
    if period <= 0 or len(values) < period:
        return None
    arr = _to_float_array(values[-period:])
    return float(arr.mean())


def stddev(values: Sequence[Decimal], period: int) -> Optional[float]:
    """母體標準差（與 Bollinger Bands 慣例一致）。"""
    if period <= 0 or len(values) < period:
        return None
    arr = _to_float_array(values[-period:])
    return float(arr.std(ddof=0))


def rsi(values: Sequence[Decimal], period: int = 14) -> Optional[float]:
    """Wilder's RSI（指數平滑版）。"""
    if period <= 0 or len(values) < period + 1:
        return None
    arr = _to_float_array(values)
    deltas = np.diff(arr)
    gains = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)

    # 第一段用 SMA 起始，之後用 Wilder's smoothing
    avg_gain = gains[:period].mean()
    avg_loss = losses[:period].mean()
    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return float(100.0 - 100.0 / (1.0 + rs))


def true_range_series(
    highs: Sequence[Decimal],
    lows: Sequence[Decimal],
    closes: Sequence[Decimal],
) -> np.ndarray:
    """返回 TR 序列（長度 = len(closes) - 1）。"""
    h = _to_float_array(highs)
    l = _to_float_array(lows)
    c = _to_float_array(closes)
    prev_c = c[:-1]
    cur_h, cur_l = h[1:], l[1:]
    tr = np.maximum.reduce([cur_h - cur_l, np.abs(cur_h - prev_c), np.abs(cur_l - prev_c)])
    return tr


def atr(
    highs: Sequence[Decimal],
    lows: Sequence[Decimal],
    closes: Sequence[Decimal],
    period: int = 14,
) -> Optional[float]:
    """Wilder's ATR。"""
    if len(closes) < period + 1:
        return None
    tr = true_range_series(highs, lows, closes)
    if len(tr) < period:
        return None
    atr_val = tr[:period].mean()
    for i in range(period, len(tr)):
        atr_val = (atr_val * (period - 1) + tr[i]) / period
    return float(atr_val)


def adx(
    highs: Sequence[Decimal],
    lows: Sequence[Decimal],
    closes: Sequence[Decimal],
    period: int = 14,
) -> Optional[float]:
    """Wilder's ADX；至少需要 2*period 根 bar 才能穩定。"""
    if len(closes) < 2 * period + 1:
        return None
    h = _to_float_array(highs)
    l = _to_float_array(lows)
    c = _to_float_array(closes)

    up_move = h[1:] - h[:-1]
    down_move = l[:-1] - l[1:]
    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)

    tr = true_range_series(highs, lows, closes)

    # Wilder smoothing
    def wilder_smooth(arr: np.ndarray, p: int) -> np.ndarray:
        out = np.zeros_like(arr)
        out[p - 1] = arr[:p].sum()
        for i in range(p, len(arr)):
            out[i] = out[i - 1] - out[i - 1] / p + arr[i]
        return out

    atr_smooth = wilder_smooth(tr, period)
    plus_smooth = wilder_smooth(plus_dm, period)
    minus_smooth = wilder_smooth(minus_dm, period)

    with np.errstate(divide="ignore", invalid="ignore"):
        plus_di = 100.0 * np.where(atr_smooth > 0, plus_smooth / atr_smooth, 0.0)
        minus_di = 100.0 * np.where(atr_smooth > 0, minus_smooth / atr_smooth, 0.0)
        di_sum = plus_di + minus_di
        dx = 100.0 * np.where(di_sum > 0, np.abs(plus_di - minus_di) / di_sum, 0.0)

    # ADX = Wilder smoothed DX
    adx_val = dx[period - 1 : 2 * period - 1].mean()
    for i in range(2 * period - 1, len(dx)):
        adx_val = (adx_val * (period - 1) + dx[i]) / period
    return float(adx_val)


def percentile_rank(values: Sequence[float], target: float) -> float:
    """target 在 values 中的百分位（0~1）。values 為空時回傳 0.5。"""
    if not values:
        return 0.5
    arr = np.asarray(values, dtype=float)
    return float((arr <= target).sum() / len(arr))
