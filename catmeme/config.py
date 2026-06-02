"""
全域設定：OpenAI、YouTube OAuth、Instagram Graph API、Webhook、輸出路徑。

敏感資訊請用環境變數或本機檔案（勿提交 client_secrets / token 至 Git）。
"""

from __future__ import annotations

import os
from pathlib import Path

# ---------------------------------------------------------------------------
# OpenAI
# ---------------------------------------------------------------------------
OPENAI_API_KEY: str = os.environ.get("OPENAI_API_KEY", "")
OPENAI_MODEL: str = "gpt-4o"

# ---------------------------------------------------------------------------
# Webhook（可選）
# ---------------------------------------------------------------------------
PUBLISH_WEBHOOK_URL: str = os.environ.get("PUBLISH_WEBHOOK_URL", "").strip()
PUBLISH_TIMEOUT_SEC: float = float(os.environ.get("PUBLISH_TIMEOUT_SEC", "60"))

# ---------------------------------------------------------------------------
# YouTube Data API v3（OAuth 2.0 桌面應用程式憑證）
# 第一次執行會開瀏覽器授權，並寫入 YOUTUBE_TOKEN_PATH。
# 取得 client_secrets：Google Cloud Console → APIs → 憑證 → OAuth 用戶端 → 桌面應用程式
# ---------------------------------------------------------------------------
PROJECT_ROOT: Path = Path(__file__).resolve().parent
YOUTUBE_CLIENT_SECRETS_PATH: Path = Path(
    os.environ.get("YOUTUBE_CLIENT_SECRETS_FILE", str(PROJECT_ROOT / "client_secrets.json")),
)
YOUTUBE_TOKEN_PATH: Path = Path(
    os.environ.get("YOUTUBE_TOKEN_FILE", str(PROJECT_ROOT / "youtube_token.json")),
)
YOUTUBE_UPLOAD_CHUNK_MB: int = int(os.environ.get("YOUTUBE_UPLOAD_CHUNK_MB", "8"))

# ---------------------------------------------------------------------------
# Instagram Graph API（Reels）
# IG 專業／創作者帳號需綁定粉絲專頁；權限需含 instagram_content_publish。
# 重要：發 Reels 時 video_url 必須是 Meta 可抓取的「公開 HTTPS 直鏈 MP4」，本機路徑無法直接使用。
# 參考：https://developers.facebook.com/docs/instagram-api/reference/ig-user/media
# ---------------------------------------------------------------------------
INSTAGRAM_GRAPH_VERSION: str = os.environ.get("INSTAGRAM_GRAPH_VERSION", "v21.0").strip().lstrip("v") or "21.0"
INSTAGRAM_ACCESS_TOKEN: str = os.environ.get("INSTAGRAM_ACCESS_TOKEN", "").strip()
INSTAGRAM_BUSINESS_ACCOUNT_ID: str = os.environ.get("INSTAGRAM_BUSINESS_ACCOUNT_ID", "").strip()
# 是否同步发到動態牆（依 Meta 文件為選用參數）
INSTAGRAM_SHARE_TO_FEED: bool = os.environ.get("INSTAGRAM_SHARE_TO_FEED", "true").lower() in (
    "1",
    "true",
    "yes",
)

# Reels 容器處理完畢前輪詢（秒）
INSTAGRAM_POLL_INTERVAL_SEC: float = float(os.environ.get("INSTAGRAM_POLL_INTERVAL_SEC", "5"))
INSTAGRAM_POLL_MAX_WAIT_SEC: float = float(os.environ.get("INSTAGRAM_POLL_MAX_WAIT_SEC", "600"))

# ---------------------------------------------------------------------------
# 輸出 JSON 任務檔
# ---------------------------------------------------------------------------
OUTPUT_DIR: Path = PROJECT_ROOT / "output"
TASK_FILENAME_PREFIX: str = "asmr_task"
