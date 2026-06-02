"""
GPT-4o 腳本生成模組：依你手動輸入的主題／需求，產出貓咪 ASMR 短影音結構化腳本（JSON）。

輸出設計：
    - hook_title: 短影片開場／縮圖用的吸睛標題
    - visual_description: 連續畫面敘事（可分鏡描述）
    - sound_keywords: 擬音、環境音或音效設計關鍵字列表
    - segments: 分段節奏（對齊剪輯時間軸）
    - notes_for_editor: 給剪輯／後製的備註

錯誤處理：
    金鑰錯誤、模型拒絕、超時、回傳非 JSON 等皆轉成清楚訊息拋出。
"""

from __future__ import annotations

import json
import logging
from typing import Any

from openai import APIConnectionError, APIStatusError, APITimeoutError, AuthenticationError, OpenAI, RateLimitError

import config

logger = logging.getLogger(__name__)


def _require_openai_config() -> None:
    if not config.OPENAI_API_KEY.strip():
        raise ValueError(
            "OpenAI API 金鑰未設定：請設定環境變數 OPENAI_API_KEY（見 config.py 說明）"
        )


def _build_prompt(user_brief: str) -> tuple[str, str]:
    """
    產生 system / user 提示詞。
    user_brief 為使用者親自輸入的一段說明（主題、氛圍、禁忌、長度等）。
    """
    system = (
        "你是專精 YouTube Shorts／TikTok／Reels 的貓咪 ASMR 頻道編劇。"
        "你會根據使用者提供的一段文字需求，撰寫一支約 30～60 秒的放鬆向短影音腳本。"
        "語氣需溫和、具 ASMR 感，避免誇大不實或人身攻擊；若需求過簡請合理延伸，並在 notes_for_editor 註記假設。"
        "你必須只輸出合法 JSON 物件，勿加入 Markdown 围栏或額外說明。"
        "JSON 鍵名固定為：hook_title, visual_description, sound_keywords, segments, notes_for_editor。"
        "sound_keywords 為字串陣列；segments 為物件陣列，每個元素含：title, visual_beat, sound_beat, mood（皆為字串）。"
        "全文請使用繁體中文（台灣用語優先）。"
    )
    user_payload = {
        "instruction": "請根據下列使用者需求產出單一短片腳本；尊重使用者指定的氛圍與動物相關設定。",
        "user_brief": user_brief.strip(),
    }
    user = json.dumps(user_payload, ensure_ascii=False, indent=2)
    return system, user


def generate_asmr_script_json(user_brief: str) -> dict[str, Any]:
    """
    呼叫 OpenAI Chat Completions（gpt-4o），回傳已解析的 Python dict。

    Raises:
        ValueError: 設定或輸入資料異常。
        RuntimeError: API／網路／格式等執行期錯誤。
    """
    _require_openai_config()
    if not user_brief or not user_brief.strip():
        raise ValueError("手動輸入不可為空：請用參數、檔案或 stdin 提供主題／需求說明。")

    system, user = _build_prompt(user_brief)

    try:
        client = OpenAI(api_key=config.OPENAI_API_KEY.strip())
        completion = client.chat.completions.create(
            model=config.OPENAI_MODEL,
            temperature=0.85,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
    except AuthenticationError as exc:
        raise RuntimeError(
            "OpenAI 驗證失敗：請確認 OPENAI_API_KEY 是否正確或未過期。"
        ) from exc
    except RateLimitError as exc:
        raise RuntimeError(
            "OpenAI 觸發速率限制（429）：請稍後再試或檢查帳號方案與用量。"
        ) from exc
    except APITimeoutError as exc:
        raise RuntimeError("OpenAI 請求逾時：請檢查網路後重試。") from exc
    except APIConnectionError as exc:
        raise RuntimeError(f"無法連線至 OpenAI：{exc}") from exc
    except APIStatusError as exc:
        raise RuntimeError(
            f"OpenAI 回傳非預期狀態碼：{getattr(exc, 'status_code', 'unknown')} — {exc}"
        ) from exc

    try:
        choice0 = completion.choices[0]
        content = choice0.message.content or ""
    except (IndexError, AttributeError) as exc:
        logger.error("OpenAI 回傳結構異常：%s", completion)
        raise RuntimeError("OpenAI 回傳內容異常：沒有可用的 choices 訊息。") from exc

    raw = content.strip()
    if not raw:
        raise RuntimeError("OpenAI 回傳空白內容：請重試或降低 temperature。")

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.error("模型未產出合法 JSON，原始內容（截斷）：%s", raw[:2000])
        raise RuntimeError("無法將模型輸出解析為 JSON：請重試或調整提示詞。") from exc

    required_keys = ("hook_title", "visual_description", "sound_keywords")
    missing = [k for k in required_keys if k not in data]
    if missing:
        raise RuntimeError(
            "模型 JSON 缺少必要欄位："
            + ", ".join(missing)
            + "。請重試；若持續發生可略為縮短輸入內容。"
        )
    if not isinstance(data.get("sound_keywords"), list):
        raise RuntimeError('sound_keywords 必須為陣列。模型輸出格式異常。')

    return data
