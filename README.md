# AI 種子計畫｜學習看板

**線上**：https://eason0728.github.io/ai-seed/

16 位學員各自填自己那一張，Eason 審核。學員**不需要任何帳號**——
選名字＋四位數通行碼就能填。

## 架構

```
index.html      前端（GitHub Pages）
js/board.js     看板邏輯
js/config.js    ← 後端網址寫在這裡
css/board.css
assets/         三品牌方塊
apps-script/    後端（Google Apps Script → Google 試算表）
  Code.gs       doGet / doPost、讀寫、審核
  Roster.gs     名冊匯入、發通行碼（只在編輯器裡跑）
```

前端打 `doPost`（`Content-Type: text/plain` 避開 CORS preflight），
後端寫進 Google 試算表。跟 mala-audit／mala-eval／mala-clock-in 同一套做法。

## 試算表三張表

| 表 | 內容 |
|---|---|
| 學員 | 一列一人：代號｜姓名｜通行碼｜四堂＋10/07 |
| 件 | 一列一件事，欄位全部攤平，直接看得懂 |
| **交件紀錄** | append-only：誰、什麼時候、做了什麼 ← **10/07 判準①的憑據** |

## 第一次上線要做的四件事

1. `clasp push` 把 `apps-script/` 推上去（`.clasp.json` 的 scriptId 要先填）
2. 編輯器裡跑 `setup()` → 建試算表、設審核通行碼
3. 編輯器裡跑 `importRoster()` → 匯入 16 人；再跑 `issuePasscodes()` → 發個人通行碼
4. 「部署／新增部署作業 → 網頁應用程式」，**存取權限選「任何人」**，
   把網址貼進 `js/config.js` 的 `AI_SEED_API`，push 到 GitHub

⚠ 之後改後端要用「管理部署作業／編輯」重新部署，**網址才不會變**。

維護走 `mala-ai-seed` skill。前端正本在 `~/Desktop/Claude/專案/AI種子群組`。
