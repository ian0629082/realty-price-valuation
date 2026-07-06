/**
 * 臨路寬/分隔島（臺中市政府開放資料「臺中市道路寬度」）
 *
 * 台灣無逐筆物件臨路寬資料，改以官方道路中線圖資（含實測「路寬」欄位）推估：
 * 找出每個物件最近的道路中線段，取其路寬與路名。分隔島無官方欄位，以路寬推估
 * （寬度 >= 30m 之主要幹道通常設有分隔島），UI 會標示資料來源。
 *
 * 輸入：
 *   data/road/taichung-road-width.csv  — 臺中市道路寬度（TWD97 TM2 座標）
 *   data/properties.json               — 正規化物件（in-place 更新）
 *   data/geocode-cache.json            — 地址/地號 → 座標（WGS84）
 *
 * 輸出（寫回 data/properties.json 每筆）：
 *   roadWidth (公尺)、hasMedian、roadName、roadWidthSource
 *
 * 資料來源：政府資料開放平臺 https://data.gov.tw/dataset/83822
 */

import fs from "node:fs";
import proj4 from "proj4";
import { OUTPUT_FILE } from "./config.mjs";

const CACHE_FILE = "data/geocode-cache.json";
const CSV_FILE = "data/road/taichung-road-width.csv";
const CSV_URL =
  "https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=c807c4ef-1942-4341-abbc-883fde09f8b2";

const TARGET_DISTRICTS = ["南區", "大里區", "南屯區"]; // 與 config.TARGET_DISTRICTS 一致
const SNAP_MAX_M = 100; // 最近道路超過此距離視為無臨路資料
const MEDIAN_WIDTH_M = 30; // 路寬 >= 此值推估有分隔島

// TWD97 TM2（EPSG:3826）；物件經緯度轉此平面座標後以公尺比對
const TWD97 =
  "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs";
const toTWD97 = (lat, lng) => proj4("WGS84", TWD97, [lng, lat]); // -> [x, y]

async function ensureCsv() {
  if (fs.existsSync(CSV_FILE)) return;
  console.log("下載臺中市道路寬度開放資料...");
  fs.mkdirSync("data/road", { recursive: true });
  const res = await fetch(CSV_URL);
  const text = await res.text();
  fs.writeFileSync(CSV_FILE, text, "utf-8");
  console.log(`已下載至 ${CSV_FILE}`);
}

// 點到線段最短距離（平面，公尺）
function pointToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

async function main() {
  await ensureCsv();

  // ── 解析道路段（僅目標行政區以縮小資料量） ──────────────────────────────
  const lines = fs.readFileSync(CSV_FILE, "utf-8").split(/\r?\n/);
  const segs = []; // { name, width, x1,y1,x2,y2 }
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    if (c.length < 14) continue;
    if (!TARGET_DISTRICTS.includes(c[3])) continue;
    const width = parseFloat(c[7]);
    const x1 = parseFloat(c[10]), y1 = parseFloat(c[11]);
    const x2 = parseFloat(c[12]), y2 = parseFloat(c[13]);
    if (!(width > 0) || Number.isNaN(x1) || Number.isNaN(y1) || Number.isNaN(x2) || Number.isNaN(y2))
      continue;
    // 路名需併入巷/弄，否則巷弄側支（通常較窄）會被誤標成主線路名，
    // 使查詢點落在巷口時顯示「主線路名＋巷弄窄路寬」而誤以為主線路寬算錯
    const lane = (c[4] || "") + (c[5] || "");
    segs.push({ name: (c[2] || "") + lane, width, x1, y1, x2, y2 });
  }
  console.log(`道路段（${TARGET_DISTRICTS.join("/")}）：${segs.length}`);

  // ── 空間網格索引（200m 格） ────────────────────────────────────────────
  const CELL = 200;
  const grid = new Map();
  const key = (gx, gy) => gx + "," + gy;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const gx0 = Math.floor(Math.min(s.x1, s.x2) / CELL);
    const gx1 = Math.floor(Math.max(s.x1, s.x2) / CELL);
    const gy0 = Math.floor(Math.min(s.y1, s.y2) / CELL);
    const gy1 = Math.floor(Math.max(s.y1, s.y2) / CELL);
    for (let gx = gx0; gx <= gx1; gx++)
      for (let gy = gy0; gy <= gy1; gy++) {
        const k = key(gx, gy);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
  }

  // ── 逐物件比對最近道路 ──────────────────────────────────────────────────
  const properties = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8"));
  const cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
  let enriched = 0, noCoord = 0, noRoad = 0;

  for (const prop of properties) {
    const geo = cache[prop.address];
    if (!geo || geo.status !== "ok" || !geo.lat || !geo.lng) {
      noCoord++;
      continue;
    }
    const [px, py] = toTWD97(geo.lat, geo.lng);
    const gx = Math.floor(px / CELL), gy = Math.floor(py / CELL);

    let best = null, bestDist = Infinity;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const cell = grid.get(key(gx + dx, gy + dy));
        if (!cell) continue;
        for (const si of cell) {
          const s = segs[si];
          const d = pointToSeg(px, py, s.x1, s.y1, s.x2, s.y2);
          if (d < bestDist) {
            bestDist = d;
            best = s;
          }
        }
      }

    if (!best || bestDist > SNAP_MAX_M) {
      noRoad++;
      continue;
    }

    prop.roadWidth = best.width;
    prop.hasMedian = best.width >= MEDIAN_WIDTH_M;
    prop.roadName = best.name || undefined;
    prop.roadWidthSource = "gov-taichung";
    enriched++;
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(properties, null, 2), "utf-8");
  console.log(
    `\n完成：推估 ${enriched} 筆，無座標 ${noCoord} 筆，附近無道路 ${noRoad} 筆。已更新 ${OUTPUT_FILE}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
