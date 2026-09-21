"""起漲策略型態示意 SVG（供 Web UI 策略卡片顯示）。"""

from __future__ import annotations

from typing import Dict


def _svg(body: str, viewbox: str = "0 0 64 40") -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" '
        f'role="img" aria-hidden="true">'
        f'<rect width="64" height="40" rx="4" fill="#0d1117"/>'
        f"{body}</svg>"
    )


PATTERN_ICONS: Dict[str, str] = {
    "volume_breakout": _svg(
        '<polyline points="4,34 12,30 20,28 28,22 36,18 44,12 52,8 60,4" '
        'fill="none" stroke="#3fb950" stroke-width="1.5"/>'
        '<rect x="50" y="6" width="4" height="28" fill="#58a6ff" opacity="0.85"/>'
        '<line x1="48" y1="10" x2="60" y2="10" stroke="#f85149" stroke-width="1" stroke-dasharray="2 2"/>'
        '<text x="4" y="10" fill="#8b949e" font-size="5">量爆+突破</text>'
    ),
    "volume_surge": _svg(
        '<polyline points="4,32 14,30 24,28 34,26 44,24 54,20" '
        'fill="none" stroke="#3fb950" stroke-width="1.2"/>'
        '<rect x="8" y="26" width="3" height="8" fill="#484f58"/>'
        '<rect x="14" y="24" width="3" height="10" fill="#484f58"/>'
        '<rect x="20" y="22" width="3" height="12" fill="#484f58"/>'
        '<rect x="26" y="20" width="3" height="14" fill="#484f58"/>'
        '<rect x="32" y="18" width="3" height="16" fill="#484f58"/>'
        '<rect x="38" y="16" width="3" height="18" fill="#484f58"/>'
        '<rect x="44" y="12" width="3" height="22" fill="#484f58"/>'
        '<rect x="50" y="6" width="5" height="28" fill="#58a6ff"/>'
        '<rect x="57" y="8" width="5" height="26" fill="#1f6feb"/>'
        '<text x="4" y="10" fill="#8b949e" font-size="5">量能放大</text>'
    ),
    "momentum_ignition": _svg(
        '<polyline points="4,34 10,32 16,28 22,22 28,16 34,12 40,10 46,8 52,6 60,4" '
        'fill="none" stroke="#3fb950" stroke-width="1.5"/>'
        '<polyline points="4,34 10,30 16,26 22,20 28,14 34,10 40,8 46,6 52,5 60,4" '
        'fill="none" stroke="#58a6ff" stroke-width="1" opacity="0.6"/>'
        '<circle cx="28" cy="16" r="2" fill="#d29922"/>'
        '<text x="4" y="10" fill="#8b949e" font-size="5">動能加速</text>'
    ),
    "rising_flag": _svg(
        '<polyline points="4,34 8,28 12,18 16,10 20,6" '
        'fill="none" stroke="#3fb950" stroke-width="2"/>'
        '<polyline points="20,6 24,8 28,10 32,9 36,11 40,10 44,12 48,11" '
        'fill="none" stroke="#58a6ff" stroke-width="1.2"/>'
        '<polyline points="48,11 52,8 56,6 60,4" '
        'fill="none" stroke="#3fb950" stroke-width="2"/>'
        '<line x1="20" y1="6" x2="48" y2="11" stroke="#484f58" stroke-width="0.8" stroke-dasharray="2 1"/>'
        '<text x="4" y="38" fill="#8b949e" font-size="5">上升旗形</text>'
    ),
    "higher_low": _svg(
        '<polyline points="4,32 12,24 20,26 28,18 36,20 44,12 52,14 60,6" '
        'fill="none" stroke="#3fb950" stroke-width="1.5"/>'
        '<circle cx="12" cy="24" r="1.5" fill="#58a6ff"/>'
        '<circle cx="28" cy="18" r="1.5" fill="#58a6ff"/>'
        '<circle cx="44" cy="12" r="1.5" fill="#58a6ff"/>'
        '<line x1="4" y1="32" x2="60" y2="32" stroke="#30363d" stroke-width="0.8"/>'
        '<text x="4" y="10" fill="#8b949e" font-size="5">高點抬高</text>'
    ),
}


def get_pattern_icon(key: str) -> str:
    return PATTERN_ICONS.get(key, PATTERN_ICONS["volume_breakout"])
