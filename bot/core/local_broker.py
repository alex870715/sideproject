"""本地模擬 broker：直接以 Account 作為實作。

之所以做這個薄包裝層而不是 `LocalBroker = Account`，是為了：
1. 與 `OKXBroker` 命名對稱，呼叫端讀起來語意更清楚。
2. 之後若要在本地模擬上加東西（如撮合延遲、滑點模擬），這裡是合適的擴充點。
"""

from __future__ import annotations

from core.account import Account


class LocalBroker(Account):
    """模擬模式 broker。所有行為與 `Account` 完全一致。"""

    pass
