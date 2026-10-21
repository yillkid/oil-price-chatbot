# 油價小幫手（oil-price-chatbot）

課程範例 3：網頁是入口，背後是你電腦上的 Harness。

- 網頁：<https://yillkid.github.io/oil-price-chatbot/>（GitHub Pages 靜態網頁，沒有放任何 API key）
- 回答：瀏覽器連到你自己電腦上的 `opencode serve`，由它呼叫 OpenCode 的免費模型 Big Pickle
- 資料：[`data/oil_prices.csv`](data/oil_prices.csv)，由範例 2 的 OpenCode 產生，並已與[台灣中油汽、柴油歷史價格](https://www.cpc.com.tw/historyprice.aspx?n=2890)逐筆核對（2026/10/21）

## 使用方式

```bash
OPENCODE_SERVER_PASSWORD=自己取一個密碼 \
  opencode serve --port 4096 --cors https://yillkid.github.io
```

打開網頁，輸入同一組密碼，按「連線」就能問油價。第一次連線時 Chrome／Edge 會詢問是否允許這個網站存取區域網路上的裝置，請按「允許」。

## 安全設計

- `opencode serve` 只聽 `127.0.0.1`，有密碼，CORS 只允許這個網站。
- 網頁建立的對話設定成「所有工具都要先問」，網頁會一律拒絕，所以模型只能聊天，不能讀檔或執行指令。
- 建議在一個空資料夾裡啟動 `opencode serve`。
