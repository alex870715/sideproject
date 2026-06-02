export type AppLocale = "zh-TW" | "en" | "ja" | "ko";

export type MockVariant = { title: string; body: string };

export type MessageBundle = {
  brand: string;
  popupTitle: string;
  languageLabel: string;
  tickerLabel: string;
  saveHint: string;
  openSeparateWindow: string;
  openSeparateWindowHint: string;
  itemDefault: string;
  breakdownYears: string;
  breakdownCagr: string;
  breakdownFv: string;
  breakdownPrice: string;
  mockHighVariants: MockVariant[];
  mockBagVariants: MockVariant[];
  mockNeutralVariants: MockVariant[];
  footnote: string;
};

export const bundles: Record<AppLocale, MessageBundle> = {
  "zh-TW": {
    brand: "綁手手神器",
    popupTitle: "綁手手神器",
    languageLabel: "介面與吐槽語言",
    tickerLabel: "假投資標的（內建 CAGR）",
    saveHint: "已自動儲存。重新整理購物頁，讓綁手手再次掛回所有價格旁。",
    openSeparateWindow: "用獨立視窗開啟設定",
    openSeparateWindowHint:
      "工具列 Popup 容易被其它視窗遮住；獨立小視窗比較好留在前景調整。",
    itemDefault: "這筆消費",
    breakdownYears: "年數",
    breakdownCagr: "年化報酬（假設）",
    breakdownFv: "10 年後名目累積",
    breakdownPrice: "今日標價",
    mockHighVariants: [
      {
        title: "錢沒有不見（經典款）",
        body:
          "大家都知道錢只是變成你喜歡的樣子——那 {price} 如果先丟給 {ticker} 躺十年，帳面上有機會膨成 {fv} 這種劇情。但你現在比較想摸 {item}，對吧，傲嬌消費獸。",
      },
      {
        title: "母湯喔，這複利會咬人",
        body:
          "認真講，{price} 丟進 {ticker} 當段子複利滾十年，帳面可以長得像 {fv}。不是威脅，是試算表在旁邊冷笑：『欸，你又手滑？』",
      },
      {
        title: "蝦皮腦 vs 存款腦",
        body:
          "一鍵下單 {item} 很療癒，這是眾生皆懂的補血包；另一條世界線是 {ticker} 安安靜靜長到 {fv}。今天要幫購物車補魔，還是給未來的自己留魔量？",
      },
      {
        title: "長輩圖（偽）語音包",
        body:
          "孩子啊，今天忍住 {price} ，十年後 {ticker} 可能用 {fv} 的臉跟你打招呼。當然你買 {item} 也沒罪——至少包裹到了，心態比盤面穩。",
      },
      {
        title: "社畜小劇場 · 加薪靠想像力",
        body:
          "老闆沒幫你加薪沒關係，複利很會演：{price} 當 {ticker} 十年段子大概變 {fv} 這齣。{item} ？那是你剛領的情緒勞健保啦。",
      },
    ],
    mockBagVariants: [
      {
        title: "韭味認證 · 落地注意",
        body:
          "這支 {ticker} 走勢像在跑酷一直摔——你敢開局已經很有種。先買 {item} 換點開箱多巴胺；那邊比較像在蒐集『心態健檢報告』。",
      },
      {
        title: "自我解嘲 · 行為藝術組",
        body:
          "沒事，選股跟選晚餐一樣需要勇氣（誤）。{item} 先買下去暖胃；{ticker} 貼備忘錄，當行為藝術學分。",
      },
      {
        title: "反向算命攤",
        body:
          "老師沒說你會發，但 {item} 會準時達陣。{ticker} 那邊像水逆精選：『啊不就再等等』無限播放。",
      },
      {
        title: "誠實模式下單",
        body:
          "你買 {item} 是花錢買『確定會寄來』；押 {ticker} 是花錢買劇情。今晚要看懸疑片還是療癒片，自己選。",
      },
      {
        title: "兄弟暫停一下",
        body:
          "{ticker} 讓你深呼吸很正常，人類要休息。至少 {item} 還會在外箱印『謝謝惠顧』戳你一下（善意的）。",
      },
    ],
    mockNeutralVariants: [
      {
        title: "吐槽力度：微糖去冰",
        body:
          "{item} 這價位會戳一下但不會戳穿。{ticker} 十年粗算約 {fv}，當購物車旁的良心便利貼——不爽就撕，符合人性化設計。",
      },
      {
        title: "人生分配學分",
        body:
          "{price} 現在消失，換成摸得到的 {item}；另一個你在腦裡用 {ticker} 偷築 {fv} 的發財夢。沒標準答案，只有限時加價購在旁邊吶喊。",
      },
      {
        title: "幽靈帳號已讀",
        body:
          "你滑到手痠還是想買 {item} ，這很人性。只是 {ticker} 那邊還漂著十年後 {fv} 的幽靈限動在看你。",
      },
      {
        title: "佛系備忘錄",
        body:
          "買沒問題，心裡留一格：{item} 借走一點點『{ticker}→{fv}』的大夢額度。夢會長回來，胃先顧好。",
      },
    ],
    footnote: "誇飾玩笑性質，非投資建議；過去報酬不代表未來。",
  },
  en: {
    brand: "Impulse Cuffs",
    popupTitle: "Impulse Handcuffs",
    languageLabel: "Language for UI & roasts",
    tickerLabel: "Mock investment ticker",
    saveHint:
      "Saved automatically. Refresh shopping pages so the cuffs can latch onto every price again.",
    openSeparateWindow: "Open settings in a new window",
    openSeparateWindowHint:
      "The toolbar popup can sit under other windows; a separate window is easier to keep on top.",
    itemDefault: "this purchase",
    breakdownYears: "Years",
    breakdownCagr: "Assumed CAGR",
    breakdownFv: "Notional value in 10y",
    breakdownPrice: "List price",
    mockHighVariants: [
      {
        title: "Opportunity-cost klaxon",
        body:
          "That {price} parked in {ticker} for a decade could read like {fv} on a spreadsheet—Rolex vibes for your inner accountant.",
      },
      {
        title: "Compounding shade",
        body:
          "{item} spends now, but the parallel-universe you stacks {ticker} paper toward about {fv}. Choose your plot twist.",
      },
      {
        title: "Math is judging you",
        body:
          "{price} feels fine until you spell it {fv} with ten years of {ticker} fan-fiction. Not advice—just arithmetic with attitude.",
      },
      {
        title: "Brain teams draft",
        body:
          "Team Instant Dopamine ({item}) vs Team Lazy Millionaire ({ticker} ~ {fv}). Pick a jersey; both come with regrets.",
      },
      {
        title: "Mail from future-you",
        body:
          "Future-you slides into DMs: ‘You traded a shot at {fv} in {ticker} for {item}. Cool story.’",
      },
    ],
    mockBagVariants: [
      {
        title: "Sarcastic green light",
        body:
          "Your ticker pick moonwalks downhill—cool choreography. Buy {item}; it’s physical joy. {ticker} mostly trains wallpaper collecting.",
      },
      {
        title: "Toxic encouragement",
        body:
          "If portfolios were art, yours is avant-garde. Splash on {item}; at least shipping notifications still love you more than {ticker}.",
      },
      {
        title: "Backhanded peace treaty",
        body:
          "Call {ticker} ‘tuition.’ Then buy {item} like you passed the class: tangible, hug-gable, refund-unavailable.",
      },
      {
        title: "Real talk",
        body:
          "Sometimes the universe says diversify into sneakers, not {ticker}. Your closet gains inventory; your broker gains memes.",
      },
      {
        title: "Gentle treason",
        body:
          "{ticker} might be your villain arc, but {item} is the loot drop you can unbox today. We all need a win.",
      },
    ],
    mockNeutralVariants: [
      {
        title: "Mild roast",
        body:
          "{item} sits in the ‘meh-but-not-free’ zone. Rough decade sketch with {ticker}: about {fv}. Budget fairy tale, not prophecy.",
      },
      {
        title: "Feelings vs ledgers",
        body:
          "You’re not optimizing cashflow—you’re scheduling joy. {price} now vs ~{fv} later in {ticker}: pick your flavor of FOMO.",
      },
      {
        title: "Lukewarm honesty",
        body:
          "No angel, no demon—just a quiet {price} whispering that {item} quietly borrows space from a {fv}-{ticker} daydream.",
      },
      {
        title: "Tiny conscience ping",
        body:
          "Buy if it sparks joy—just know {item} rents brain RAM that could’ve simulated {ticker} marching toward {fv}.",
      },
    ],
    footnote: "Satire / illustration only—not financial advice.",
  },
  ja: {
    brand: "カート手錠",
    popupTitle: "衝動お預け神器",
    languageLabel: "UIとツッコミの言語",
    tickerLabel: "モック投資ティッカー",
    saveHint:
      "自動保存済み。価格の横に手錠を掛け直すには、ページの更新が確実です。",
    openSeparateWindow: "設定を別ウィンドウで開く",
    openSeparateWindowHint:
      "ツールバーのポップアップは他ウィンドウに隠れやすいです。別ウィンドウなら手元に置けます。",
    itemDefault: "この買い物",
    breakdownYears: "年数",
    breakdownCagr: "想定CAGR",
    breakdownFv: "10年後の名目額",
    breakdownPrice: "表示価格",
    mockHighVariants: [
      {
        title: "財布の紐、今天也在哭泣",
        body:
          "{price} を {ticker} に十年放置した妄想世界線だと、表層だけ見ると {fv} まで育つカモしれない。でも今は {item} の推しに貢ぎたい気分、わかる。",
      },
      {
        title: "は？計算機が煽ってきた",
        body:
          "淡い言い方するとね、{price} を {ticker} 前提でガチ十年やると {fv} みたいな顔になる。魔法じゃなくて、地味な複利のグーパン。",
      },
      {
        title: "草。今スッキリ vs 未来ドヤ",
        body:
          "今 {item} を押すのは『脳内すっきり派』。一方 {ticker} は十年後 {fv} って言い訳できる未来ガチャ。引くか引かないかは自由。",
      },
      {
        title: "給料日前の良心テロ",
        body:
          "給料日前でも心は強く。{price} は {ticker} という名の地獄チュートリアルに放り込むと {fv} っぽく見える日が来る……かも。今は {item} でいいよ、生きてるし。",
      },
      {
        title: "推し活（金）バランス理論",
        body:
          "推しは {item} 、数字の推しは {ticker} 。十年シミュで {fv} が頭をよぎったなら、それはExcelからの布教。崇拝か消費か、今日のテーマ。",
      },
    ],
    mockBagVariants: [
      {
        title: "オワコン席どうぞ（逆ギレしないで）",
        body:
          "{ticker} は下降も個性。現物の {item} はちゃんと届く系ヒーロー。壁紙フォルダが増えるのはどっち？って話、察して。",
      },
      {
        title: "勉強代ってやつ（慰め）",
        body:
          "銘柄センスが尖りすぎても人生は続く。まず {item} でリアル回復して。{ticker} はたまに『社会見学費』って呼ぼう。",
      },
      {
        title: "買いは理性、推しは衝動",
        body:
          "今日の幸福は在庫管理しやすい形が正義。{item} は物理。{ticker} はたまに心のノイズ……でもそれも含めて趣味。",
      },
      {
        title: "ポートフォリオ抽象画ユーザーへ",
        body:
          "抽象画でもいいんだよポートフォリオ。{item} は具象の勝ち。{ticker} への想いは脚注くらいで十分、物語は短く。",
      },
      {
        title: "おつまみ買いだけは許す",
        body:
          "{ticker} がエンタメ枠なら {item} は豪華おつまみ。酔いどれよう人生、でも水分は取れ。",
      },
    ],
    mockNeutralVariants: [
      {
        title: "弱めツッコミ（チル）",
        body:
          "{item} は中くらいの痛さ。{ticker} 十年ざっくり {fv} は精神会計メモ用、未来保証は無い。はい終わり。",
      },
      {
        title: "欲望の段取り狂い",
        body:
          "{price} は『今の快楽』と『{fv} の未来妄想（{ticker}）』の間で転がる石ころ。拾うのは自由行。",
      },
      {
        title: "白湯モード",
        body:
          "{price} は天使でも悪魔でもない。{item} が {ticker} の {fv} 夢をそっと借りてるだけ。返すのはあとででいい。",
      },
      {
        title: "ささやきログ",
        body:
          "買うなら買うで堂々と。{item} が脳内の {ticker}→{fv} シミュの席をちょい奪うだけ。席取りは日常茶飯事。",
      },
    ],
    footnote: "誇張ジョークで、投資助言ではありません。",
  },
  ko: {
    brand: "손묶기",
    popupTitle: "손 묶는 신기",
    languageLabel: "UI·드립 언어",
    tickerLabel: "모의 투자 티커",
    saveHint:
      "자동 저장됩니다. 가격 옆에 족쇄를 다시 채우려면 페이지를 새로고침하세요.",
    openSeparateWindow: "설정을 새 창에서 열기",
    openSeparateWindowHint:
      "툴바 팝업은 다른 창에 가려지기 쉽습니다. 별도 창이면 위에 두고 보기 편합니다.",
    itemDefault: "이 지출",
    breakdownYears: "년수",
    breakdownCagr: "가정 CAGR",
    breakdownFv: "10년 후 명목 금액",
    breakdownPrice: "표시 가격",
    mockHighVariants: [
      {
        title: "텅장 방지위원회（코믹）",
        body:
          "{price} 를 {ticker} 에 묵혀 10년 치면 껍데기만 봐도 {fv} 같은 ‘상상 시세’가 뜰 수도 있음. 근데 지금은 {item} 이 손에 잡히잖아요. 인간이니까.",
      },
      {
        title: "현실 억까 vs 미래 뇌피셜",
        body:
          "{item} 은 오늘의 피지컬 보상이고, {ticker} 는 10년 뒤 {fv} 를 그리는 뇌피셜 썰. 둘 중 뭐로 스트레스를 탈출할지 골라요, 편한 쪽으로.",
      },
      {
        title: "엑셀이 술 취해서 그럼",
        body:
          "{price} 가 약해 보여도 {ticker} 로 10년만 곱하면 {fv} 같은 말이 튀어나옴. 점쟁이 아니라 그냥 복리가 술기운 내는 중.",
      },
      {
        title: "편의점 야식급 고민",
        body:
          "지금 먹는 야식({item}) vs 미래의 나한테 떠넘길 상상({ticker}→{fv}). 후회는 ㄹㅇ 배송비 포함이에요, 마음에 넣어두고.",
      },
      {
        title: "주식은 죄가 없다（아마도）",
        body:
          "장이 원망스럽다면 일단 {item} 에서 긍정 파동 채우고 가요. {ticker} 는 그냥… 인생 난이도 보정 패치라고 믿읍시다.",
      },
    ],
    mockBagVariants: [
      {
        title: "역주행 레전드 등장（?）",
        body:
          "{ticker} 는 차트가 추억 여행 중일 수 있어요. 대신 {item} 은 택배가 증명해줌. 배경화면 폴더만 불어나는 건 보통 종목 쪽이 잘함.",
      },
      {
        title: "위로 반, 트롤 반",
        body:
          "종목 고르는 안목이 현대미술 같아도 괜찮아요. 오늘은 {item} 으로 ‘나 살아있음’부터 채우고, {ticker} 는 그냥 흑역사 학점.",
      },
      {
        title: "현질은 이미 했잖아（생활비）",
        body:
          "현질 각이면 차라리 {item} : 확률표가 아니라 송장이 옴. {ticker} 는 가끔 마음만 풀옵션 업데이트함.",
      },
      {
        title: "텅장 연막술",
        body:
          "포트폴리오가 추세미안이면 {item} 은 사실주의. {ticker} 얘기는 작은 글씨 각주로 접어두자.",
      },
      {
        title: "편하게 사, 그게 멘탈 관리",
        body:
          "{ticker} 가 멘탈 체조면 {item} 은 맛있는 간식. 둘 다 있어야 인간 유지비가 맞아요. 물은 챙겨 마시고.",
      },
    ],
    mockNeutralVariants: [
      {
        title: "맛없는 복숭아 톤",
        body:
          "{item} 은 ‘아프진 않은데 찔림’ 구간. {ticker} 로 10년 흔적만 {fv} 정도로 남기기, 가계부 영수증 붙이듯.",
      },
      {
        title: "욕망 스케줄 표 엉킴",
        body:
          "{price} 는 ‘지금 입맛’이랑 ‘{ticker} 로 상상하는 {fv}’ 사이에 굴러다니는 자갈. 밟을지 말지는 오늘의 기분값.",
      },
      {
        title: "미지근한 진실",
        body:
          "{price} 가 천사도 악마도 아님. {item} 이 {ticker} 의 {fv} 백일몽 뇌 용량을 살짝 빌려 가는 정도, 반납은 천천히.",
      },
      {
        title: "작은 알림（돈X 멘탈O）",
        body:
          "살 거면 시원하게. {item} 이 머릿속 {ticker}→{fv} 시뮬 창을 조금 덮을 뿐, 창 닫는 건 니 손가락.",
      },
    ],
    footnote: "과장 유머이며 투자 권유가 아닙니다.",
  },
};
