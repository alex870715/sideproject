"""OKX V5 REST 簽名工具。

按官方規範：
    prehash = timestamp + method.upper() + requestPath + body
    sign    = base64( HMAC-SHA256(prehash, secret) )

注意事項：
- timestamp 必須是 ISO8601 含毫秒、UTC、結尾 Z（例：2020-12-08T09:08:57.715Z）
- requestPath 包含 query string（？後面那段）
- body 為 JSON 字串；GET 請求請傳空字串
- 若是 demo trading，需要在請求 header 加上 `x-simulated-trading: 1`
"""

from __future__ import annotations

import base64
import hashlib
import hmac
from datetime import datetime, timezone


def iso_timestamp_ms() -> str:
    """OKX 規定的時間戳格式：2020-12-08T09:08:57.715Z"""
    now = datetime.now(timezone.utc)
    millis = now.microsecond // 1000
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{millis:03d}Z"


def sign(timestamp: str, method: str, request_path: str, body: str, secret: str) -> str:
    """產生 OK-ACCESS-SIGN。"""
    prehash = f"{timestamp}{method.upper()}{request_path}{body}"
    digest = hmac.new(secret.encode(), prehash.encode(), hashlib.sha256).digest()
    return base64.b64encode(digest).decode()
