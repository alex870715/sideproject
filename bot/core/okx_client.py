"""OKX V5 REST API 客戶端（同步版本，用 httpx）。

只覆蓋我們的 broker / market 需要的端點：
- public:  /api/v5/public/instruments
- market:  /api/v5/market/candles
- account: /api/v5/account/balance, /api/v5/account/positions, /api/v5/account/config
- trade:   /api/v5/trade/order (place + query)

Demo trading：建構時傳 `demo=True`（預設），所有請求自動帶上
`x-simulated-trading: 1` header。

錯誤處理：
- HTTP 4xx/5xx → 直接 raise httpx.HTTPStatusError
- OKX 業務錯誤 (code != "0") → raise OKXAPIError，訊息含 code + msg
"""

from __future__ import annotations

import errno
import json as _json
import time
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import httpx

from core.okx_auth import iso_timestamp_ms, sign


OKX_BASE_URL = "https://www.okx.com"

# 可重試的 HTTP 狀態碼（限流 / 閘道錯誤）
_RETRYABLE_HTTP_CODES = frozenset({429, 502, 503, 504})

# 可重試的 socket errno（macOS 54=ECONNRESET, 104=ECONNRESET on Linux）
_RETRYABLE_ERRNOS = frozenset({errno.ECONNRESET, errno.EPIPE, errno.ECONNREFUSED, errno.ETIMEDOUT})


class OKXAPIError(RuntimeError):
    def __init__(self, code: str, message: str, data: Any = None) -> None:
        self.code = code
        self.message = message
        self.data = data
        # OKX 批次端點（如 /trade/order）：外層 code=1 代表「批次內某筆失敗」，
        # 真正的原因在 data[0].sMsg。把它撈出來做為更有用的訊息。
        detail = ""
        if isinstance(data, list) and data:
            first = data[0] if isinstance(data[0], dict) else {}
            s_code = first.get("sCode")
            s_msg = first.get("sMsg")
            if s_msg:
                detail = f" | sCode={s_code} sMsg={s_msg}"
        super().__init__(f"OKX[{code}] {message}{detail}")


class OKXClient:
    def __init__(
        self,
        api_key: str,
        api_secret: str,
        passphrase: str,
        demo: bool = True,
        base_url: str = OKX_BASE_URL,
        timeout: float = 10.0,
        max_retries: int = 3,
    ) -> None:
        if not api_key or not api_secret or not passphrase:
            raise ValueError("api_key / api_secret / passphrase 不可為空")
        self.api_key = api_key
        self.api_secret = api_secret
        self.passphrase = passphrase
        self.demo = demo
        self.base_url = base_url
        self.max_retries = max(1, max_retries)
        self._client = httpx.Client(base_url=base_url, timeout=timeout)

    # ------------------------------------------------------------------ #
    # 內部 helpers
    # ------------------------------------------------------------------ #
    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "OKXClient":
        return self

    def __exit__(self, *exc_info) -> None:
        self.close()

    def _build_headers(self, method: str, request_path: str, body_str: str) -> Dict[str, str]:
        ts = iso_timestamp_ms()
        s = sign(ts, method, request_path, body_str, self.api_secret)
        h = {
            "OK-ACCESS-KEY": self.api_key,
            "OK-ACCESS-SIGN": s,
            "OK-ACCESS-TIMESTAMP": ts,
            "OK-ACCESS-PASSPHRASE": self.passphrase,
            "Content-Type": "application/json",
        }
        if self.demo:
            h["x-simulated-trading"] = "1"
        return h

    @staticmethod
    def _is_retryable(exc: Exception) -> bool:
        if isinstance(exc, httpx.HTTPStatusError):
            return exc.response.status_code in _RETRYABLE_HTTP_CODES
        if isinstance(
            exc,
            (
                httpx.ConnectError,
                httpx.ReadTimeout,
                httpx.WriteTimeout,
                httpx.ConnectTimeout,
                httpx.RemoteProtocolError,
                httpx.PoolTimeout,
                ConnectionResetError,
                BrokenPipeError,
            ),
        ):
            return True
        if isinstance(exc, OSError) and getattr(exc, "errno", None) in _RETRYABLE_ERRNOS:
            return True
        return False

    def _request(
        self,
        method: str,
        path: str,
        params: Optional[dict] = None,
        body: Optional[dict] = None,
    ) -> Dict[str, Any]:
        request_path = path
        if params:
            request_path = f"{path}?{urlencode(params)}"
        body_str = _json.dumps(body) if body else ""
        headers = self._build_headers(method, request_path, body_str)

        last_exc: Optional[Exception] = None
        for attempt in range(self.max_retries):
            try:
                resp = self._client.request(
                    method,
                    request_path,
                    headers=headers,
                    content=body_str.encode() if body_str else None,
                )
                resp.raise_for_status()
                data = resp.json()
                if data.get("code") != "0":
                    raise OKXAPIError(
                        data.get("code", "?"),
                        data.get("msg", "unknown"),
                        data.get("data"),
                    )
                return data
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                if not self._is_retryable(exc) or attempt >= self.max_retries - 1:
                    raise
                time.sleep(0.5 * (2 ** attempt))

        assert last_exc is not None
        raise last_exc

    # ------------------------------------------------------------------ #
    # Public (instrument / candle)
    # ------------------------------------------------------------------ #
    def get_instrument(self, inst_id: str, inst_type: str = "SWAP") -> Dict[str, Any]:
        d = self._request(
            "GET",
            "/api/v5/public/instruments",
            params={"instType": inst_type, "instId": inst_id},
        )
        rows = d.get("data") or []
        if not rows:
            raise OKXAPIError("NOT_FOUND", f"instrument {inst_id} not found")
        return rows[0]

    def list_instruments(
        self, inst_type: str = "SWAP", uly: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """列出指定類型下所有 instrument。回傳每筆含 ctVal/lotSz/minSz/lever/state 等。"""
        params: Dict[str, str] = {"instType": inst_type}
        if uly:
            params["uly"] = uly
        d = self._request("GET", "/api/v5/public/instruments", params=params)
        return d.get("data") or []

    def get_tickers(self, inst_type: str = "SWAP") -> List[Dict[str, Any]]:
        """取得某類型下所有 instrument 的 24h 行情；
        關鍵欄位：instId、last、vol24h（合約張數）、volCcy24h（幣量）、volCcyQuote24h（USDT 量）。
        """
        d = self._request("GET", "/api/v5/market/tickers", params={"instType": inst_type})
        return d.get("data") or []

    def get_funding_rate(self, inst_id: str) -> Dict[str, Any]:
        """當前 + 預測資金費率（每 8h 結算）。關鍵欄位：
        - fundingRate：當期費率（正=多單付空單；負=空單付多單）
        - nextFundingRate：預測下期費率
        正費率越極端＝多單越擁擠；負費率越極端＝空單越擁擠（反轉做多的訊號）。
        """
        d = self._request(
            "GET", "/api/v5/public/funding-rate", params={"instId": inst_id}
        )
        rows = d.get("data") or []
        return rows[0] if rows else {}

    def get_funding_rate_history(
        self, inst_id: str, limit: int = 100, after: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """歷史資金費率（每 8h 一筆）；分頁用 after（毫秒 timestamp，取更舊）。"""
        params: Dict[str, Any] = {"instId": inst_id, "limit": str(min(limit, 100))}
        if after is not None:
            params["after"] = str(after)
        d = self._request(
            "GET", "/api/v5/public/funding-rate-history", params=params
        )
        return d.get("data") or []

    def get_candles(self, inst_id: str, bar: str = "1m", limit: int = 100) -> List[List[str]]:
        """回傳格式（每根）：
            [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
        OKX 回傳「新的在前面（reverse chronological）」；confirm='1' 表示已收盤。
        """
        d = self._request(
            "GET",
            "/api/v5/market/candles",
            params={"instId": inst_id, "bar": bar, "limit": str(limit)},
        )
        return d.get("data") or []

    def get_candles_history(
        self,
        inst_id: str,
        bar: str = "1m",
        limit: int = 100,
        before: Optional[int] = None,
        after: Optional[int] = None,
    ) -> List[List[str]]:
        """歷史 K 線（較舊資料）；分頁用 before / after（毫秒 timestamp）。"""
        params: Dict[str, Any] = {
            "instId": inst_id,
            "bar": bar,
            "limit": str(min(limit, 100)),
        }
        if before is not None:
            params["before"] = str(before)
        if after is not None:
            params["after"] = str(after)
        d = self._request("GET", "/api/v5/market/history-candles", params=params)
        return d.get("data") or []

    def fetch_candles_range(
        self,
        inst_id: str,
        bar: str = "1m",
        total_bars: int = 1000,
    ) -> List[List[str]]:
        """往回拉 N 根已收盤 K 線，回傳舊→新排序。

        OKX 分頁語意（反直覺）：
        - `after`  = 取得 timestamp **更舊** 的 K 線（往歷史翻頁用這個）
        - `before` = 取得 timestamp **更新** 的 K 線
        """
        import time as _time

        collected: Dict[int, List[str]] = {}
        for row in self.get_candles(inst_id, bar, limit=min(300, total_bars)):
            if row[8] == "1":
                collected[int(row[0])] = row

        while len(collected) < total_bars:
            oldest = min(collected)
            batch = self.get_candles_history(inst_id, bar, limit=100, after=oldest)
            if not batch:
                break
            confirmed = [r for r in batch if r[8] == "1"]
            if not confirmed:
                break
            new_oldest = min(int(r[0]) for r in confirmed)
            if new_oldest >= oldest:
                break
            for r in confirmed:
                collected[int(r[0])] = r
            if len(confirmed) < 100:
                break
            _time.sleep(0.05)

        return [collected[ts] for ts in sorted(collected)][-total_bars:]

    # ------------------------------------------------------------------ #
    # Account
    # ------------------------------------------------------------------ #
    def get_account_config(self) -> Dict[str, Any]:
        """取得帳戶設定，最重要的欄位：
        - posMode: 'net_mode'  (單向) | 'long_short_mode' (雙向)
        - acctLv:  '1'=現貨 / '2'=現貨+期權保證金 / '3'=多幣種保證金 / '4'=組合保證金
        """
        d = self._request("GET", "/api/v5/account/config")
        rows = d.get("data") or []
        return rows[0] if rows else {}

    def get_balance(self, ccy: Optional[str] = None) -> Dict[str, Any]:
        params = {"ccy": ccy} if ccy else None
        d = self._request("GET", "/api/v5/account/balance", params=params)
        rows = d.get("data") or []
        return rows[0] if rows else {}

    def get_positions(self, inst_id: Optional[str] = None) -> List[Dict[str, Any]]:
        params = {"instId": inst_id} if inst_id else None
        d = self._request("GET", "/api/v5/account/positions", params=params)
        return d.get("data") or []

    # ------------------------------------------------------------------ #
    # Trade
    # ------------------------------------------------------------------ #
    def place_order(
        self,
        inst_id: str,
        td_mode: str,
        side: str,
        ord_type: str,
        sz: str,
        pos_side: Optional[str] = None,
        px: Optional[str] = None,
        reduce_only: Optional[bool] = None,
        ccy: Optional[str] = None,
        cl_ord_id: Optional[str] = None,
        attach_algo_ords: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {
            "instId": inst_id,
            "tdMode": td_mode,
            "side": side,
            "ordType": ord_type,
            "sz": sz,
        }
        if pos_side:
            body["posSide"] = pos_side
        if px is not None:
            body["px"] = px
        if reduce_only is not None:
            body["reduceOnly"] = "true" if reduce_only else "false"
        if ccy:
            body["ccy"] = ccy
        if cl_ord_id:
            body["clOrdId"] = cl_ord_id
        if attach_algo_ords:
            body["attachAlgoOrds"] = attach_algo_ords

        d = self._request("POST", "/api/v5/trade/order", body=body)
        rows = d.get("data") or []
        if not rows:
            raise OKXAPIError("EMPTY", "no data in place_order response")
        first = rows[0]
        if first.get("sCode") not in (None, "0"):
            raise OKXAPIError(first.get("sCode"), first.get("sMsg", "place_order failed"), first)
        return first

    def amend_algo_order(
        self,
        inst_id: str,
        algo_id: Optional[str] = None,
        algo_cl_ord_id: Optional[str] = None,
        new_sl_trigger_px: Optional[str] = None,
        new_sl_ord_px: Optional[str] = None,
    ) -> Dict[str, Any]:
        """修改已掛的（附加）停損條件單觸發價 — POST /api/v5/trade/amend-algos。

        必須帶 algoId 或 algoClOrdId 其中之一；沒有兩者都給就找不到單。
        """
        if not algo_id and not algo_cl_ord_id:
            raise ValueError("amend_algo_order requires algo_id or algo_cl_ord_id")
        body: Dict[str, Any] = {"instId": inst_id}
        if algo_id:
            body["algoId"] = algo_id
        if algo_cl_ord_id:
            body["algoClOrdId"] = algo_cl_ord_id
        if new_sl_trigger_px is not None:
            body["newSlTriggerPx"] = new_sl_trigger_px
        if new_sl_ord_px is not None:
            body["newSlOrdPx"] = new_sl_ord_px
        d = self._request("POST", "/api/v5/trade/amend-algos", body=body)
        rows = d.get("data") or []
        if not rows:
            raise OKXAPIError("EMPTY", "no data in amend_algo_order response")
        first = rows[0]
        if first.get("sCode") not in (None, "0"):
            raise OKXAPIError(first.get("sCode"), first.get("sMsg", "amend_algo_order failed"), first)
        return first

    def cancel_algo_orders(
        self,
        inst_id: str,
        algo_id: Optional[str] = None,
        algo_cl_ord_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """取消附加的停損條件單 — POST /api/v5/trade/cancel-algos。"""
        if not algo_id and not algo_cl_ord_id:
            raise ValueError("cancel_algo_orders requires algo_id or algo_cl_ord_id")
        item: Dict[str, Any] = {"instId": inst_id}
        if algo_id:
            item["algoId"] = algo_id
        if algo_cl_ord_id:
            item["algoClOrdId"] = algo_cl_ord_id
        d = self._request("POST", "/api/v5/trade/cancel-algos", body=[item])
        rows = d.get("data") or []
        if not rows:
            raise OKXAPIError("EMPTY", "no data in cancel_algo_orders response")
        first = rows[0]
        if first.get("sCode") not in (None, "0"):
            raise OKXAPIError(first.get("sCode"), first.get("sMsg", "cancel_algo_orders failed"), first)
        return first

    def close_positions(
        self,
        inst_id: str,
        mgn_mode: str,
        pos_side: Optional[str] = None,
        auto_cxl: bool = True,
        ccy: Optional[str] = None,
    ) -> Dict[str, Any]:
        """市價全平指定合約倉位（OKX 原生 close-position）。"""
        body: Dict[str, Any] = {
            "instId": inst_id,
            "mgnMode": mgn_mode,
            "autoCxl": auto_cxl,
        }
        if pos_side:
            body["posSide"] = pos_side
        if ccy:
            body["ccy"] = ccy
        d = self._request("POST", "/api/v5/trade/close-position", body=body)
        rows = d.get("data") or []
        if not rows:
            raise OKXAPIError("EMPTY", "no data in close_positions response")
        first = rows[0]
        if first.get("sCode") not in (None, "0"):
            raise OKXAPIError(first.get("sCode"), first.get("sMsg", "close_positions failed"), first)
        return first

    def get_fills(
        self,
        inst_id: Optional[str] = None,
        ord_id: Optional[str] = None,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        params: Dict[str, Any] = {"limit": str(min(limit, 100))}
        if inst_id:
            params["instId"] = inst_id
        if ord_id:
            params["ordId"] = ord_id
        d = self._request("GET", "/api/v5/trade/fills", params=params)
        return d.get("data") or []

    def get_order(self, inst_id: str, ord_id: str) -> Dict[str, Any]:
        d = self._request(
            "GET",
            "/api/v5/trade/order",
            params={"instId": inst_id, "ordId": ord_id},
        )
        rows = d.get("data") or []
        return rows[0] if rows else {}

    def cancel_order(self, inst_id: str, ord_id: str) -> Dict[str, Any]:
        """取消未完全成交的訂單（市價單 partial / live 時用）。"""
        body = {"instId": inst_id, "ordId": ord_id}
        d = self._request("POST", "/api/v5/trade/cancel-order", body=body)
        rows = d.get("data") or []
        if not rows:
            raise OKXAPIError("EMPTY", "no data in cancel_order response")
        first = rows[0]
        if first.get("sCode") not in (None, "0"):
            raise OKXAPIError(first.get("sCode"), first.get("sMsg", "cancel_order failed"), first)
        return first

    def get_public_position_tiers(
        self,
        inst_type: str,
        td_mode: str,
        inst_family: str,
    ) -> List[Dict[str, Any]]:
        """倉位檔位（公開）：各 tier 的 maxLever / maxSz / minSz。"""
        d = self._request(
            "GET",
            "/api/v5/public/position-tiers",
            params={
                "instType": inst_type,
                "tdMode": td_mode,
                "instFamily": inst_family,
            },
        )
        return d.get("data") or []

    def set_leverage(
        self,
        inst_id: str,
        lever: int,
        mgn_mode: str = "cross",
        pos_side: Optional[str] = None,
    ) -> Dict[str, Any]:
        """為單一 symbol 設定槓桿。
        - mgn_mode: 'cross' 或 'isolated'。
        - pos_side: 雙向持倉 (long_short_mode) + isolated 時必填 'long'/'short'；
          其他情況可省略。
        """
        body: Dict[str, Any] = {
            "instId": inst_id,
            "lever": str(lever),
            "mgnMode": mgn_mode,
        }
        if pos_side:
            body["posSide"] = pos_side
        d = self._request("POST", "/api/v5/account/set-leverage", body=body)
        rows = d.get("data") or []
        return rows[0] if rows else {}

    # ------------------------------------------------------------------ #
    # 工具
    # ------------------------------------------------------------------ #
    def ping(self) -> bool:
        """快速驗證簽名是否有效。回傳 True 代表認證成功。"""
        try:
            self.get_account_config()
            return True
        except (OKXAPIError, httpx.HTTPError):
            return False
