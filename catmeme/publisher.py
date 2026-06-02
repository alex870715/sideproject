"""
發佈模組：將任務 JSON POST 到自訂 Webhook。

YouTube／Instagram 已另有 youtube_upload、instagram_publish；Webhook 適合接 n8n 等自訂流程。
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Any

import config

logger = logging.getLogger(__name__)


def post_task_json(webhook_url: str, payload: dict[str, Any], timeout_sec: float | None = None) -> None:
    """
    以 application/json POST 整份任務文件。

    Args:
        webhook_url: HTTPS（或 http）端點。
        payload: 與寫入 output/*.json 相同的字典。

    Raises:
        ValueError: URL 為空。
        RuntimeError: HTTP 非 2xx、連線失敗、逾時等。
    """
    url = (webhook_url or "").strip()
    if not url:
        raise ValueError("發佈失敗：Webhook URL 為空。請設定環境變數 PUBLISH_WEBHOOK_URL 或使用 --webhook。")

    timeout = timeout_sec if timeout_sec is not None else config.PUBLISH_TIMEOUT_SEC
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": "cat-asmr-pipeline/0.2",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status = getattr(resp, "status", 0) or resp.getcode()
            if status < 200 or status >= 300:
                raise RuntimeError(f"Webhook 回傳非成功狀態碼：{status}")
            logger.info("Webhook 發佈成功，HTTP %s", status)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(
            f"Webhook HTTP 錯誤：{exc.code} {exc.reason} — 內容（截斷）：{detail}"
        ) from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"無法連線至 Webhook：{exc.reason}") from exc
    except TimeoutError as exc:
        raise RuntimeError(
            f"Webhook 請求逾時（>{timeout}s）：請檢查網路或加大 PUBLISH_TIMEOUT_SEC。"
        ) from exc
