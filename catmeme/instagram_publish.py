"""
Instagram Reels 發佈模組（Instagram Graph API）。

流程摘要：
    1) POST /{ig-user-id}/media 建立 Reels 容器（media_type=REELS + 公開 video_url）。
    2) 輪詢容器 status_code 直到 FINISHED（或 ERROR）。
    3) POST /{ig-user-id}/media_publish 正式發佈。

限制（Meta 平台規定）：
    video_url 必須為 Instagram 伺服器可直接下載的公開 HTTPS 連結（通常為 .mp4 直鏈）。
    本機檔案請先上傳至 S3、GCS、或其他可匿名下載的 HTTPS URL，再傳入 --ig-video-url。

錯誤處理：
    網路、Graph API 錯誤訊息、逾時皆會轉成 RuntimeError／ValueError。
"""

from __future__ import annotations

import logging
import time
from typing import Any

import requests

import config

logger = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.facebook.com"


def _graph_version_path() -> str:
    v = config.INSTAGRAM_GRAPH_VERSION.strip()
    if not v.startswith("v"):
        v = f"v{v}"
    return v


def _require_ig_config() -> None:
    if not config.INSTAGRAM_ACCESS_TOKEN:
        raise ValueError(
            "Instagram 發佈需要環境變數 INSTAGRAM_ACCESS_TOKEN（建議使用長效權杖，"
            "且具 instagram_content_publish）。"
        )
    if not config.INSTAGRAM_BUSINESS_ACCOUNT_ID:
        raise ValueError(
            "請設定 INSTAGRAM_BUSINESS_ACCOUNT_ID（Graph Explorer 或 API 可查 IG 用戶編號）。"
        )


def _get_json(url: str, params: dict[str, Any]) -> dict[str, Any]:
    try:
        r = requests.get(url, params=params, timeout=60)
    except requests.RequestException as exc:
        raise RuntimeError(f"Instagram Graph 請求失敗：{exc}") from exc
    try:
        data = r.json()
    except ValueError as exc:
        raise RuntimeError(f"Instagram Graph 回傳非 JSON：HTTP {r.status_code}") from exc
    if r.status_code >= 400 or "error" in data:
        err = data.get("error", data)
        raise RuntimeError(f"Instagram Graph 錯誤（HTTP {r.status_code}）：{err}")
    return data


def _post_form(url: str, form: dict[str, Any]) -> dict[str, Any]:
    try:
        r = requests.post(url, data=form, timeout=120)
    except requests.RequestException as exc:
        raise RuntimeError(f"Instagram Graph 請求失敗：{exc}") from exc
    try:
        data = r.json()
    except ValueError as exc:
        raise RuntimeError(f"Instagram Graph 回傳非 JSON：HTTP {r.status_code}") from exc
    if r.status_code >= 400 or "error" in data:
        err = data.get("error", data)
        raise RuntimeError(f"Instagram Graph 錯誤（HTTP {r.status_code}）：{err}")
    return data


def _wait_container_ready(container_id: str) -> None:
    """輪詢 /{creation-id}?fields=status_code 直到 FINISHED 或失敗。"""
    ver = _graph_version_path()
    url = f"{GRAPH_BASE}/{ver}/{container_id}"
    token = config.INSTAGRAM_ACCESS_TOKEN
    deadline = time.monotonic() + config.INSTAGRAM_POLL_MAX_WAIT_SEC
    while True:
        if time.monotonic() > deadline:
            raise RuntimeError(
                f"Instagram Reels 容器逾時（>{config.INSTAGRAM_POLL_MAX_WAIT_SEC}s）仍未就緒：{container_id}"
            )
        data = _get_json(url, {"fields": "status_code", "access_token": token})
        code = (data.get("status_code") or "").upper()
        if code in {"FINISHED", ""}:
            # 有時短暫無 status_code，繼續等
            if code == "FINISHED":
                return
        elif code == "IN_PROGRESS":
            pass
        elif code in {"ERROR", "EXPIRED"}:
            raise RuntimeError(f"Instagram 容器處理失敗：status_code={code} id={container_id}")
        time.sleep(config.INSTAGRAM_POLL_INTERVAL_SEC)


def publish_reel(
    *,
    video_url: str,
    caption: str,
    share_to_feed: bool | None = None,
) -> dict[str, Any]:
    """
    建立 Reels 容器並發佈；回傳含 media_id、permalink（若可取得）等資訊的 dict。
    """
    _require_ig_config()
    raw_url = (video_url or "").strip()
    if not raw_url.startswith("https://"):
        raise ValueError(
            "ig-video-url 必須為 https:// 開頭的公開影片直鏈（Meta 會下載此 URL）。"
        )

    ver = _graph_version_path()
    ig_user = config.INSTAGRAM_BUSINESS_ACCOUNT_ID.strip()
    token = config.INSTAGRAM_ACCESS_TOKEN

    share = config.INSTAGRAM_SHARE_TO_FEED if share_to_feed is None else share_to_feed

    # 建立容器
    create_url = f"{GRAPH_BASE}/{ver}/{ig_user}/media"
    form: dict[str, Any] = {
        "media_type": "REELS",
        "video_url": raw_url,
        "access_token": token,
    }
    if caption.strip():
        form["caption"] = caption.strip()[:2200]
    if share:
        form["share_to_feed"] = "true"

    logger.info("正在建立 Instagram Reels 容器…")
    created = _post_form(create_url, form)
    container_id = created.get("id")
    if not container_id:
        raise RuntimeError(f"建立容器失敗，未回傳 id：{created}")

    _wait_container_ready(str(container_id))

    pub_url = f"{GRAPH_BASE}/{ver}/{ig_user}/media_publish"
    logger.info("正在發佈 Reels（media_publish）…")
    published = _post_form(
        pub_url,
        {"creation_id": str(container_id), "access_token": token},
    )
    media_id = published.get("id")
    if not media_id:
        raise RuntimeError(f"media_publish 未回傳 id：{published}")

    # 取得 permalink
    permalink = None
    try:
        info = _get_json(
            f"{GRAPH_BASE}/{ver}/{media_id}",
            {"fields": "permalink,shortcode", "access_token": token},
        )
        permalink = info.get("permalink")
    except RuntimeError as exc:
        logger.warning("無法取得 permalink：%s", exc)

    return {
        "id": str(media_id),
        "permalink": permalink,
        "container_id": str(container_id),
    }
