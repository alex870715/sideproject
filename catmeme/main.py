"""
貓咪 ASMR 短影音流水線 — 主程式入口。

流程：
    1. 讀取手動主題／需求。
    2. GPT-4o 產出腳本 JSON。
    3. 寫入 output/ 任務檔。
    4. 可選：Webhook POST、上傳 YouTube Shorts（本機檔）、發佈 IG Reels（公開 video URL）。

注意：
    Instagram Reels API 需要「可公開下載的 HTTPS 影片直鏈」，無法直接吃本機路徑；
    請先將同支影片放到 S3／CDN 等，再以 --ig-video-url 指定。
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import config
import generator
import instagram_publish
import publisher
import youtube_upload


def _setup_logging(verbose: bool) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )


def _utc_timestamp_slug() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def resolve_user_brief(
    topic: str | None,
    input_file: Path | None,
) -> str:
    if input_file is not None:
        if not input_file.is_file():
            raise ValueError(f"找不到輸入檔：{input_file.resolve()}")
        text = input_file.read_text(encoding="utf-8").strip()
        if not text:
            raise ValueError("輸入檔為空，請填入你的主題或需求說明。")
        return text

    if topic is not None and topic.strip():
        return topic.strip()

    if not sys.stdin.isatty():
        text = sys.stdin.read().strip()
        if text:
            return text

    raise ValueError(
        "請提供手動輸入其一：位置參數「主題文字」、-f/--input-file，或以管線餵入 stdin。"
    )


def save_task_file(payload: dict[str, Any]) -> Path:
    config.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = config.OUTPUT_DIR / f"{config.TASK_FILENAME_PREFIX}_{_utc_timestamp_slug()}.json"
    out_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return out_path


def compose_video_stub(task_json_path: Path) -> None:
    raise NotImplementedError(
        "請在此實作 MoviePy 合成：讀取 task_json_path、載入音訊／影像素材、輸出最終影片。"
    )


def _metadata_from_script(
    script: dict[str, Any],
    *,
    youtube_title_override: str | None,
    youtube_description_override: str | None,
    ig_caption_override: str | None,
) -> tuple[str, str, str]:
    """
    從 asmr_script 產出 YouTube 標題／說明與 IG 說明文字。
    """
    title = (youtube_title_override or str(script.get("hook_title") or "貓咪 ASMR 短影音"))[:100]
    if youtube_description_override:
        yt_desc = youtube_description_override[:5000]
    else:
        parts = [
            str(script.get("visual_description") or ""),
            "",
            str(script.get("notes_for_editor") or ""),
        ]
        yt_desc = "\n".join(p for p in parts if p).strip()
        extra_tags = "\n\n#Shorts #貓咪 #ASMR #療癒"
        if "#Shorts" not in yt_desc:
            yt_desc = (yt_desc + extra_tags)[:5000]
        else:
            yt_desc = (yt_desc + "\n\n#貓咪 #ASMR #療癒")[:5000]

    if ig_caption_override:
        ig_cap = ig_caption_override.strip()[:2200]
    else:
        hook = str(script.get("hook_title") or "")
        vis = str(script.get("visual_description") or "")[:800]
        ig_cap = (hook + "\n\n" + vis).strip()[:2200]
        if "#Reels" not in ig_cap:
            ig_cap = (ig_cap + "\n\n#Reels #貓咪 #ASMR")[:2200]

    return title, yt_desc, ig_cap


def persist_task(out_path: Path, task_doc: dict[str, Any]) -> None:
    """將最新 task_doc 寫回同一任務檔（同步 meta／發佈結果）。"""
    out_path.write_text(
        json.dumps(task_doc, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def run_pipeline(
    user_brief: str,
    *,
    do_publish_webhook: bool,
    webhook_url: str | None,
    publish_youtube: bool,
    video_path: Path | None,
    youtube_privacy: str,
    youtube_title: str | None,
    youtube_description: str | None,
    publish_instagram: bool,
    ig_video_url: str | None,
    ig_caption: str | None,
) -> Path:
    logging.info("已讀入手動需求（長度 %d 字元）。", len(user_brief))
    script = generator.generate_asmr_script_json(user_brief)
    yt_title, yt_desc, ig_cap = _metadata_from_script(
        script,
        youtube_title_override=youtube_title,
        youtube_description_override=youtube_description,
        ig_caption_override=ig_caption,
    )

    task_doc: dict[str, Any] = {
        "meta": {
            "created_at_utc": datetime.now(timezone.utc).isoformat(),
            "source": "manual",
            "openai_model": config.OPENAI_MODEL,
            "published_via_webhook": False,
            "youtube": None,
            "instagram": None,
        },
        "user_brief": user_brief,
        "asmr_script": script,
        "publish_targets": {
            "youtube_requested": publish_youtube,
            "instagram_requested": publish_instagram,
        },
    }
    out_path = save_task_file(task_doc)
    logging.info("任務已保存：%s", out_path.resolve())
    task_doc["meta"]["task_file"] = str(out_path.resolve())

    if publish_youtube:
        if not video_path or not video_path.is_file():
            raise ValueError("已指定 --youtube，請提供存在於本機的 --video 影片路徑。")
        vid = youtube_upload.upload_video(
            video_path=video_path,
            title=yt_title,
            description=yt_desc,
            privacy_status=youtube_privacy,
        )
        task_doc["meta"]["youtube"] = {
            "video_id": vid,
            "url": f"https://www.youtube.com/watch?v={vid}",
            "privacy": youtube_privacy,
        }
        logging.info("已上傳 YouTube：%s", task_doc["meta"]["youtube"]["url"])

    if publish_instagram:
        ig_url = (ig_video_url or "").strip()
        if not ig_url:
            raise ValueError(
                "已指定 --instagram，請提供 --ig-video-url（公開 HTTPS 影片直鏈）。"
                " 本機檔需先上傳至可匿名下載的雲端空間。"
            )
        ig_result = instagram_publish.publish_reel(video_url=ig_url, caption=ig_cap)
        task_doc["meta"]["instagram"] = ig_result
        if ig_result.get("permalink"):
            logging.info("已發佈 Instagram Reels：%s", ig_result["permalink"])
        else:
            logging.info("已發佈 Instagram Reels，media_id=%s", ig_result.get("id"))

    url = (webhook_url or "").strip() or config.PUBLISH_WEBHOOK_URL
    if do_publish_webhook:
        task_doc["meta"]["published_via_webhook"] = True
        publisher.post_task_json(url, task_doc)

    persist_task(out_path, task_doc)
    if do_publish_webhook or publish_youtube or publish_instagram:
        logging.info("任務檔已更新（含發佈結果）：%s", out_path.resolve())

    return out_path


def _validate_upload_args(args: argparse.Namespace) -> None:
    if args.youtube and not args.video:
        raise ValueError("使用 --youtube 時必須指定 --video 本機影片路徑。")
    if args.instagram and not args.ig_video_url:
        raise ValueError(
            "使用 --instagram 時必須指定 --ig-video-url（公開 HTTPS 直鏈）。"
        )
    if args.video and not args.youtube and not args.instagram:
        logging.warning("已指定 --video 但未使用 --youtube／--instagram，將僅產生腳本 JSON。")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="貓咪 ASMR：手動主題 → GPT 腳本 → 任務 JSON；可上傳 YouTube／IG Reels",
    )
    parser.add_argument(
        "topic",
        nargs="?",
        default=None,
        help="手動輸入的影片主題、梗或需求說明",
    )
    parser.add_argument("-f", "--input-file", type=Path, default=None, help="從 UTF-8 文字檔讀取需求")
    parser.add_argument("-v", "--verbose", action="store_true", help="除錯日誌")

    parser.add_argument(
        "--video",
        type=Path,
        default=None,
        help="本機影片檔（供 YouTube 上傳；IG 需另備公開 URL）",
    )
    parser.add_argument("--youtube", action="store_true", help="上傳至 YouTube（需 --video 與 OAuth 設定）")
    parser.add_argument(
        "--youtube-privacy",
        choices=("public", "unlisted", "private"),
        default="public",
        help="YouTube 可見度（預設 public）",
    )
    parser.add_argument("--youtube-title", default=None, help="覆寫 YouTube 標題（預設用腳本 hook_title）")
    parser.add_argument("--youtube-description", default=None, help="覆寫 YouTube 說明")

    parser.add_argument("--instagram", action="store_true", help="發佈 Instagram Reels（需 Graph 權杖與 --ig-video-url）")
    parser.add_argument(
        "--ig-video-url",
        default=None,
        help="IG Reels 用的公開 HTTPS 影片直鏈（Meta 會下載此 URL）",
    )
    parser.add_argument("--ig-caption", default=None, help="覆寫 IG 圖說（預設由腳本組合）")

    parser.add_argument("--publish", action="store_true", help="將任務 JSON POST 至 PUBLISH_WEBHOOK_URL 或 --webhook")
    parser.add_argument("--webhook", default=None, help="覆寫 Webhook URL")

    args = parser.parse_args(argv)
    _setup_logging(verbose=args.verbose)

    try:
        brief = resolve_user_brief(args.topic, args.input_file)
        _validate_upload_args(args)
        run_pipeline(
            brief,
            do_publish_webhook=args.publish,
            webhook_url=args.webhook,
            publish_youtube=args.youtube,
            video_path=args.video,
            youtube_privacy=args.youtube_privacy,
            youtube_title=args.youtube_title,
            youtube_description=args.youtube_description,
            publish_instagram=args.instagram,
            ig_video_url=args.ig_video_url,
            ig_caption=args.ig_caption,
        )
    except ValueError as exc:
        logging.error("設定或參數錯誤：%s", exc)
        return 2
    except RuntimeError as exc:
        logging.error("執行失敗：%s", exc)
        return 3
    except OSError as exc:
        logging.error("檔案系統錯誤：%s", exc)
        return 4
    except KeyboardInterrupt:
        logging.warning("使用者中斷。")
        return 130
    except Exception:
        logging.exception("未預期的錯誤")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
