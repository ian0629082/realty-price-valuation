# 行情與土地評估

**LIVE DEMO：[https://realty-price-valuation.vercel.app/](https://realty-price-valuation.vercel.app/)**

台中市南區、大里區、南屯區的店面／住宅／土地實價登錄行情地圖，並整合「土地評估試算」功能，可依土地坪數、買價、容積率快速估算興建與預計售價。

## 資料範圍

本專案以**台中市南屯區、南區、大里區**三個行政區作為 prototype，驗證多源資料整合（實價登錄、預售建案、都市計畫分區、地籍、道路寬度）與土地開發評估流程，目前共收錄 10,349 筆物件。

資料管線已模組化，擴展成本分為兩個等級：

- **同縣市新增行政區**：只需擴充設定檔（目標區域、地政事務所區碼對照）後重跑管線。已實際驗證 — 後期加入南屯區 3,546 筆資料，一日內完成，座標命中率 100%。
- **擴展至其他縣市**：需對接該縣市的都市計畫圖資與道路寬度開放資料（各縣市開放資料格式與涵蓋度不一），列為後續工作。

## 功能

- **行情地圖**：店面／住宅買賣與租賃成交、土地買賣成交、買賣投報率、預售屋等多種檢視模式，地圖上以色階呈現行情高低，並可依縣市／區域篩選。政府備註為親友／持分／畸零地等特殊關係交易時，改以紫色標示且不列入統計，避免誤導行情判斷。
- **視野即時行情**：畫面角落面板統計目前地圖可視範圍內的中位數、常見區間、區域比較（土地買賣成交模式改為依使用分區比較）。
- **土地評估試算**：輸入土地坪數、買價、容積率（可由地號定位或地圖右鍵反查自動帶入），自動計算總容積、土地倍數、土地單坪價、營造成本與預計售價；可切換地圖只顯示預售屋或土地成交，並比較鄰近建案售價（預售屋 1km／土地 2km）。
  > ⚠️ 本試算僅供基本土地評估判斷參考，**未考慮獎勵容積、容積移轉等增額容積因素**，實際可建容積請以建築師或地政機關規劃資料為準。
- **地籍圖疊層**：土地評估模式下疊加國土測繪中心地籍圖，方便對照地號範圍。
- **手機版**：篩選條件改為滑出式抽屜，土地評估模式改用「地圖／試算」分頁切換，避免小螢幕面板互相遮擋。

## 技術棧

- [Next.js](https://nextjs.org)（App Router）+ TypeScript
- [Leaflet](https://leafletjs.com) / react-leaflet + leaflet.markercluster（地圖與點位聚合）
- Tailwind CSS 4
- 資料處理：Node.js 腳本（`scripts/`），輸出成靜態 JSON 供 API Route 讀取

## 本地開發

```bash
npm install
npm run dev
```

開啟 [http://localhost:3000](http://localhost:3000)。

若要讓手機等區網裝置連線測試，改用：

```bash
npm run dev -- -H 0.0.0.0
```

並在 `next.config.ts` 的 `allowedDevOrigins` 加入你電腦的區網 IP。

## 資料來源與更新

執行期實際讀取的資料（已產生好、隨專案版控）都在 `src/data/`：

| 檔案 | 內容 |
| --- | --- |
| `properties.json` | 實價登錄成交案件（店面／住宅／土地買賣租賃） |
| `road-lookup.json` | 臺中市道路寬度對照 |
| `zone-lookup.json` | 都市計畫使用分區（容積率／建蔽率） |
| `sections.json` | 地號地段下拉選單資料 |
| `land-sections.json` | 地段代碼對照（供地號定位查詢座標） |
| `presale.json` | 591 預售屋建案清單 |
| `presale-actual.json` | 預售屋實價登錄成交均價 |

這些檔案由 `data/`（原始資料，未進版控，可重新下載）經 `scripts/` 處理產生：

```bash
npm run data:all          # 依序執行下方所有步驟
npm run data:download     # 下載內政部實價登錄資料
npm run data:normalize    # 正規化欄位
npm run data:geocode      # 門牌地址地理編碼（需 GOOGLE_GEOCODING_API_KEY，見 .env.local）
npm run data:geocode-parcel  # 地號地段地理編碼
npm run data:enrich-zone     # 套用都市計畫使用分區
npm run data:build-zone-lookup
npm run data:enrich-road     # 套用道路寬度
npm run data:download-tax    # 下載營業稅籍（周邊商號）
npm run data:enrich-business
npm run data:build-ui        # 輸出最終 src/data/properties.json
npm run data:fetch-presale          # 抓取 591 預售屋
npm run data:build-presale-actual   # 計算預售屋實價登錄均價
npm run data:build-road-lookup
```

## 部署

專案為標準 Next.js App Router 專案，不需要任何執行期環境變數（`GOOGLE_GEOCODING_API_KEY` 僅用於離線資料處理腳本），可直接部署到 [Vercel](https://vercel.com)：

1. 將專案 push 到 GitHub。
2. 於 Vercel 匯入該 repository，設定保持預設值即可。
3. Deploy 後即可取得公開網址。
