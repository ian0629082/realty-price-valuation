/**
 * 產生「臨路寬即時查詢」精簡檔 src/data/road-lookup.json
 *
 * 從臺中市道路寬度開放資料（TWD97 TM2 座標）抽出目標行政區的道路段（路名/路寬/線段座標），
 * 供 /api/locate-parcel、/api/zone-at 對任一座標做最近道路比對，即時得到臨路寬（僅供參考）。
 * 邏輯與 scripts/enrich-road.mjs（既有物件的臨路寬 enrich）一致，唯此處輸出通用查詢用檔案。
 *
 * 輸出格式（精簡鍵，座標為 TWD97 平面公尺）：
 *   [{ n:路名, w:路寬(m), x1,y1,x2,y2 }]
 */

import fs from "node:fs";
import path from "node:path";
import { TARGET_DISTRICTS } from "./config.mjs";

const CSV_FILE = "data/road/taichung-road-width.csv";
const CSV_URL =
  "https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=c807c4ef-1942-4341-abbc-883fde09f8b2";
const OUT_FILE = "src/data/road-lookup.json";

async function ensureCsv() {
  if (fs.existsSync(CSV_FILE)) return;
  console.log("下載臺中市道路寬度開放資料...");
  fs.mkdirSync("data/road", { recursive: true });
  const res = await fetch(CSV_URL);
  const text = await res.text();
  fs.writeFileSync(CSV_FILE, text, "utf-8");
  console.log(`已下載至 ${CSV_FILE}`);
}

async function main() {
  await ensureCsv();

  const lines = fs.readFileSync(CSV_FILE, "utf-8").split(/\r?\n/);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    if (c.length < 14) continue;
    if (!TARGET_DISTRICTS.includes(c[3])) continue;
    const width = parseFloat(c[7]);
    const x1 = parseFloat(c[10]), y1 = parseFloat(c[11]);
    const x2 = parseFloat(c[12]), y2 = parseFloat(c[13]);
    if (!(width > 0) || [x1, y1, x2, y2].some(Number.isNaN)) continue;
    out.push({
      n: c[2] || "",
      w: Math.round(width * 10) / 10,
      x1: Math.round(x1 * 100) / 100,
      y1: Math.round(y1 * 100) / 100,
      x2: Math.round(x2 * 100) / 100,
      y2: Math.round(y2 * 100) / 100,
    });
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out), "utf-8");
  const kb = Math.round(fs.statSync(OUT_FILE).size / 1024);
  console.log(`目標區道路段（${TARGET_DISTRICTS.join("/")}）：${out.length} 個 → ${OUT_FILE}（${kb} KB）`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
