"""
YouTube 上傳模組：使用 Google OAuth 與 YouTube Data API v3 上傳本機影片。

Shorts 說明：
    YouTube 沒有獨立「Shorts 上傳 API」；直式、60 秒內短影片上傳後平台會自動歸類為 Shorts。
    說明欄建議含 #Shorts 以利發現（於 main 組字時處理）。

錯誤處理：
    憑證缺失、HttpError、檔案問題等會轉成 ValueError／RuntimeError。
"""

from __future__ import annotations

import logging
import mimetypes
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

import config

logger = logging.getLogger(__name__)

# 僅要求上傳權限；若需讀寫播放清單可另加 scope
SCOPES = ("https://www.googleapis.com/auth/youtube.upload",)


def _load_youtube_credentials() -> Credentials:
    """
    從 token 檔載入憑證；若無效則 refresh；仍不成則走本機 OAuth 授權流程。
    """
    token_path = config.YOUTUBE_TOKEN_PATH
    if not config.YOUTUBE_CLIENT_SECRETS_PATH.is_file():
        raise ValueError(
            "找不到 YouTube OAuth client 設定檔："
            f"{config.YOUTUBE_CLIENT_SECRETS_PATH}。\n"
            "請自 Google Cloud Console 下載「桌面應用程式」client_secret JSON，"
            "存成此路徑或設定環境變數 YOUTUBE_CLIENT_SECRETS_FILE。"
        )

    creds: Credentials | None = None
    if token_path.is_file():
        creds = Credentials.from_authorized_user_file(str(token_path), list(SCOPES))

    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
        except Exception as exc:  # noqa: BLE001
            logger.warning("Token refresh 失敗，將重新授權：%s", exc)
            creds = None

    if not creds or not creds.valid:
        flow = InstalledAppFlow.from_client_secrets_file(
            str(config.YOUTUBE_CLIENT_SECRETS_PATH),
            list(SCOPES),
        )
        creds = flow.run_local_server(port=0, prompt="consent")
        token_path.parent.mkdir(parents=True, exist_ok=True)
        token_path.write_text(creds.to_json(), encoding="utf-8")
        logger.info("已寫入新 token：%s", token_path)

    return creds


def upload_video(
    *,
    video_path: Path,
    title: str,
    description: str,
    privacy_status: str = "public",
    category_id: str = "15",
) -> str:
    """
    上傳本機影片至頻道；回傳 YouTube videoId。

    Args:
        video_path: 本機 MP4 等路徑。
        title: 標題（API 上限約 100 字，會截斷）。
        description: 說明（含 #Shorts 等標籤）。
        privacy_status: public | unlisted | private。
        category_id: 15 = 寵物與動物（可依需求改 22 等）。

    Raises:
        ValueError: 路徑或參數不合法。
        RuntimeError: API 錯誤或上傳失敗。
    """
    path = video_path.expanduser().resolve()
    if not path.is_file():
        raise ValueError(f"找不到影片檔：{path}")

    priv = privacy_status.strip().lower()
    if priv not in {"public", "unlisted", "private"}:
        raise ValueError("privacy_status 必須為 public、unlisted 或 private。")

    creds = _load_youtube_credentials()
    try:
        youtube = build("youtube", "v3", credentials=creds, cache_discovery=False)
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"無法建立 YouTube API 服務：{exc}") from exc

    chunk_bytes = max(1, config.YOUTUBE_UPLOAD_CHUNK_MB) * 1024 * 1024
    mime, _ = mimetypes.guess_type(str(path))
    media = MediaFileUpload(
        str(path),
        mimetype=mime or "application/octet-stream",
        chunksize=chunk_bytes,
        resumable=True,
    )
    body = {
        "snippet": {
            "title": (title or "Untitled")[:100],
            "description": (description or "")[:5000],
            "categoryId": str(category_id),
        },
        "status": {
            "privacyStatus": priv,
            "selfDeclaredMadeForKids": False,
        },
    }

    try:
        request = youtube.videos().insert(part="snippet,status", body=body, media_body=media)
        response = None
        while response is None:
            status, response = request.next_chunk()
            if status and logger.isEnabledFor(logging.DEBUG):
                logger.debug("上傳進度：%s", status)
        if not response or "id" not in response:
            raise RuntimeError(f"YouTube 回傳異常：{response!r}")
        vid = str(response["id"])
        logger.info("YouTube 上傳完成，video_id=%s", vid)
        return vid
    except HttpError as exc:
        try:
            http_status = int(exc.resp.status)
        except Exception:  # noqa: BLE001
            http_status = -1
        raise RuntimeError(f"YouTube API 錯誤（HTTP {http_status}）：{exc}") from exc
