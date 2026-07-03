import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import AdmZip from "adm-zip";
import { CITY_FILE_PREFIX, TARGET_DISTRICTS, RAW_DIR } from "./config.mjs";

// 由實價登錄「預售屋買賣」(b_lvr_land_b.csv) 依建案名稱彙整實際成交均價。
// 輸出 data/presale-actual.json：normalizedName -> { name, avgUnitPrice(萬/坪), count }
// 供 API 以 591 建案名對應，於資料卡「推估單價」下方顯示實價登錄成交均價。

const SQM_PER_PING = 3.30579; // 1 坪 = 3.30579 m²
const B_FILE = `${CITY_FILE_PREFIX}_lvr_land_b.csv`;
const OUT_FILE = "data/presale-actual.json";

// 建案名稱正規化：全形轉半形、去空白與常見分隔符，供 591／實價登錄配對
export function normalizeName(raw) {
  return (raw || "")
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[\s‧・·．.\-‐‑–—・･]/g, "")
    .trim();
}

// 確保該季 _b 檔存在，否則下載該季 zip 並解出 _b
async function ensureSeasonFile(season) {
  const dest = path.join(RAW_DIR, season, B_FILE);
  if (fs.existsSync(dest)) return dest;
  const url = `https://plvr.land.moi.gov.tw/DownloadSeason?season=${season}&type=zip&fileName=lvr_landcsv.zip`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下載失敗（${season}）：HTTP ${res.status}`);
  const zip = new AdmZip(Buffer.from(await res.arrayBuffer()));
  const entry = zip.getEntry(B_FILE);
  if (!entry) throw new Error(`zip 內找不到 ${B_FILE}（${season}）`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, entry.getData());
  return dest;
}

function parseCsv(filePath) {
  const text = fs.readFileSync(filePath, "utf-8").replace(/^﻿/, "");
  return text
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .slice(2) // 跳過中英文兩列表頭
    .map((line) => line.split(","));
}

async function main() {
  const seasons = fs
    .readdirSync(RAW_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d+S\d$/.test(d.name))
    .map((d) => d.name)
    .sort();

  // 建案名稱 -> 成交單價陣列（萬/坪）
  const byName = new Map(); // normalized -> { name, prices: [] }

  for (const season of seasons) {
    const file = await ensureSeasonFile(season);
    const rows = parseCsv(file);
    for (const c of rows) {
      const district = c[0]; // 鄉鎮市區
      const target = c[1]; // 交易標的
      const unitRaw = c[22]; // 單價元平方公尺
      const name = c[28]; // 建案名稱
      if (!TARGET_DISTRICTS.includes(district)) continue;
      if (!name || !name.trim()) continue;
      if (target === "車位") continue; // 純車位交易單價不具參考性
      const unit = Number(unitRaw);
      if (!Number.isFinite(unit) || unit <= 0) continue;
      const perPing = (unit * SQM_PER_PING) / 10000; // 元/m² → 萬/坪
      const key = normalizeName(name);
      if (!key) continue;
      if (!byName.has(key)) byName.set(key, { name: name.trim(), prices: [] });
      byName.get(key).prices.push(perPing);
    }
  }

  const out = {};
  for (const [key, { name, prices }] of byName) {
    const avg = prices.reduce((s, v) => s + v, 0) / prices.length;
    out[key] = {
      name,
      avgUnitPrice: Math.round(avg * 10) / 10, // 萬/坪，1 位小數
      count: prices.length,
    };
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf-8");
  console.log(`建案數：${Object.keys(out).length}，來源季別：${seasons.length}`);
  console.log(`已輸出 ${OUT_FILE}`);
}

// 僅在直接執行時跑（供其他檔案 import normalizeName 而不觸發下載）
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
