# 開發流程

本文件記錄專案的架構、資料處理流程、本地開發與部署方式，供之後接手或用 AI 工具協作開發時參考。

## 專案架構

```
src/
  app/
    page.tsx            # 主頁面：篩選狀態、資料抓取、各面板組裝
    layout.tsx           # 全站 <html>/<body>、Metadata（標題）
    globals.css           # Tailwind 匯入、Leaflet 縮放鈕樣式覆蓋
    api/
      properties/         # 依 city/district/viewMode 篩選回傳成交或預售屋清單
      zone-at/             # 依座標反查都市計畫分區＋容積率（地圖右鍵用）
      locate-parcel/        # 依「地段地號」查詢座標＋分區＋路寬（地號定位用）
  components/
    FilterPanel.tsx        # 左側篩選欄（含手機版滑出抽屜）
    MarketFilters.tsx       # 交易時間／單價／面積等次要篩選
    PropertyMap.tsx         # Leaflet 地圖、點位聚合、地籍圖疊層、右鍵反查
    MarketStatsPanel.tsx     # 角落「視野即時行情」統計面板
    DetailCard.tsx           # 點擊物件後的明細卡（手機版為底部彈出）
    LandEvalPanel.tsx         # 土地評估試算面板（手機版全螢幕分頁）
    ParcelLocator.tsx          # 地號定位輸入元件
    MonthField.tsx              # 交易時間下拉
  lib/
    price.ts               # 篩選、色階、統計、土地試算等核心邏輯（非 UI）
    capRate.ts              # 投報率估算
    zoneLookup.ts             # zone-lookup.json 查詢（依座標找分區）
    roadLookup.ts              # road-lookup.json 查詢（依座標找最近道路）
  types/property.ts         # Property 型別定義
scripts/                    # 資料處理管線（見下方「資料流程」）
data/                        # 原始資料與中繼產物（.gitignore，不進版控）
src/data/                    # 處理完成、執行期讀取的靜態 JSON（進版控）
```

前端沒有資料庫，所有「行情資料」都是建置前先跑資料腳本、輸出成 `src/data/*.json`，API Route 在請求時用 `fs.readFileSync` 讀取這些檔案並依條件篩選後回傳。地圖、地籍圖底圖、道路寬度等三方資料則即時打外部公開 API（國土測繪中心 WMTS/WMS、地籍查詢 API）。

## 資料流程

原始資料下載與正規化只需要在資料有更新時執行，平常開發不需要重跑。

```
data/raw/*.csv  ──(normalize)──▶  data/properties.json
                                        │
        geocode / geocode-parcel（門牌或地號轉座標）
                                        │
        enrich-zone（套都市計畫分區＋容積率）
        enrich-road（套道路寬度）
        enrich-business（套周邊營業商號）
                                        │
                                  build-ui-data
                                        ▼
                          src/data/properties.json  ← 前端實際讀取
```

對應指令（`package.json` scripts，也可用 `npm run data:all` 一次跑完）：

```bash
npm run data:download        # 下載內政部實價登錄 CSV
npm run data:normalize       # 正規化欄位、篩選南區/大里區/南屯區
npm run data:geocode         # 門牌地址 → 座標（需要 .env.local 的 GOOGLE_GEOCODING_API_KEY）
npm run data:geocode-parcel  # 地段地號 → 座標（土地物件用，NLSC 免金鑰 API）
npm run data:enrich-zone     # 套用都市計畫使用分區（容積率／建蔽率）
npm run data:build-zone-lookup
npm run data:enrich-road     # 套用臺中市道路寬度
npm run data:download-tax    # 下載財政部營業稅籍資料
npm run data:enrich-business # 套用周邊營業中商號
npm run data:build-ui        # 輸出最終 src/data/properties.json
npm run data:fetch-presale         # 抓取 591 預售屋建案
npm run data:build-presale-actual  # 計算預售屋實價登錄成交均價
npm run data:build-road-lookup
```

**慣例**：`data/xxx.json` 是可重新產生的原始/中繼資料（`.gitignore` 排除）；`src/data/xxx.json` 才是執行期真正讀取、需要進版控的最終產物。新增資料處理腳本時請沿用這個慣例，避免執行期需要的檔案漏進版控。

## 本地開發

```bash
npm install
npm run dev
```

開啟 http://localhost:3000。

### 手機測試

讓手機等區網裝置連線：

```bash
npm run dev -- -H 0.0.0.0
```

並在 `next.config.ts` 的 `allowedDevOrigins` 加入電腦的區網 IP（`ipconfig` 查詢），否則 Next.js 開發模式會擋掉非 localhost 來源的請求（`allowedDevOrigins` 是安全機制，正式部署不受影響）。

手機版排版重點：
- `FilterPanel`：`sm` 以下為滑出式抽屜（`mobileOpen`/`onMobileClose`），切換檢視模式才自動收合，選縣市／區域維持展開以便連續操作。
- `LandEvalPanel`：`sm` 以下改為「地圖／試算」全螢幕分頁（`mobileFullScreen`/`onMobileBack`），避免跟 `MarketStatsPanel` 疊在一起。
- `DetailCard`：`sm` 以下改為底部彈出樣式（bottom sheet）。
- 外層容器用 `h-dvh`（非 `h-screen`），避免行動瀏覽器網址列動態顯示時把頂部內容擋住。

## 部署

專案不需要任何執行期環境變數（`GOOGLE_GEOCODING_API_KEY` 只有離線資料腳本在用），可直接部署到 Vercel：

```bash
git push origin main
```

Vercel 已連接 GitHub repo，push 到 `main` 會自動觸發重新部署。正式站台：https://realty-price-valuation.vercel.app/

**部署前檢查清單**：
1. `npm run build` 本機先跑過一次，確認沒有 TypeScript／編譯錯誤。
2. 確認新增的執行期會讀取的資料檔案都放在 `src/data/`（會進版控），不是 `data/`（被 `.gitignore` 排除）。
3. 若新增外部 API 呼叫，確認是否需要額外環境變數，並在 Vercel 專案設定新增。

## 版本紀錄慣例

- 功能／修正與 UI 美化盡量分開 commit，方便之後回溯。
- 風險較高的改動前，先確認有乾淨的 commit 作為復原點。
- Commit message 用中文，說明「做了什麼」而非條列程式碼變更。
