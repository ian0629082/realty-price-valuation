/**
 * 地號座標定位（地籍圖資）
 *
 * 實價登錄的「土地」物件門牌為地段地號（例：大里段670-22地號），
 * Google Geocoding 無法定位，故 geocode.mjs 會跳過。本腳本改用
 * 國土測繪中心（NLSC）地籍 API，將「地段+地號」轉為 WGS84 經緯度。
 *
 * 資料流程：
 *   1. 建立地段代碼對照（data/land-sections.json）
 *      GET https://api.nlsc.gov.tw/other/ListLandSection/B/{towncode}
 *      → sectstr(段名) 對應 {sectcode, office, town}；跨區同名時優先南區/大里
 *   2. 逐筆解析地號 → 8 碼地號（母號4+子號4）
 *   3. GET https://api.nlsc.gov.tw/S_Maps_WebService/qryLand/
 *          GetLandPositionLongitudeLatitude/B/{sectcode}/{No}
 *      需帶 Referer: https://maps.nlsc.gov.tw/ 才會回傳資料
 *
 * 輸出：寫入共用的 data/geocode-cache.json（status:"ok" 者 build-ui 會自動採用），
 *       故完成後只需重跑 data:build-ui 即可讓地圖使用真實座標。
 */

import fs from "node:fs";
import { OUTPUT_FILE } from "./config.mjs";

const CACHE_FILE = "data/geocode-cache.json";
const SECTION_FILE = "data/land-sections.json";
const COUNTY = "B"; // 臺中市
const TARGET_TOWNS = ["B03", "B28", "B07"]; // 南區、大里區、南屯區（跨區同名段優先此三區）
const DELAY_MS = 150;
const NLSC_REFERER = "https://maps.nlsc.gov.tw/";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

// ── 建立/載入地段代碼對照表 ────────────────────────────────────────────────
// 回傳 { 段名: [{ town, sectcode, office }] }
async function loadSectionMap() {
  if (fs.existsSync(SECTION_FILE)) return loadJson(SECTION_FILE, {});

  console.log("首次執行，下載臺中市各區地段代碼...");
  const map = {};
  const parseRe =
    /<sectItem>\s*<office>(.*?)<\/office>\s*<officestr>(.*?)<\/officestr>\s*<sectcode>(.*?)<\/sectcode>\s*<sectstr>(.*?)<\/sectstr>/g;

  // 臺中市 29 區：B01 ~ B29
  for (let i = 1; i <= 29; i++) {
    const town = COUNTY + String(i).padStart(2, "0");
    const res = await fetch(
      `https://api.nlsc.gov.tw/other/ListLandSection/${COUNTY}/${town}`
    );
    const xml = await res.text();
    let m, n = 0;
    while ((m = parseRe.exec(xml))) {
      (map[m[4]] ||= []).push({ town, sectcode: m[3], office: m[1] });
      n++;
    }
    process.stdout.write(`  ${town}:${n}`);
    await sleep(DELAY_MS);
  }
  process.stdout.write("\n");

  fs.writeFileSync(SECTION_FILE, JSON.stringify(map), "utf-8");
  console.log(`已儲存地段代碼對照（${Object.keys(map).length} 段）至 ${SECTION_FILE}`);
  return map;
}

// 跨區同名段優先取南區/大里，否則取第一個
function resolveSection(sectionMap, name) {
  const cands = sectionMap[name];
  if (!cands || cands.length === 0) return null;
  if (cands.length === 1) return cands[0];
  const inTarget = cands.filter((c) => TARGET_TOWNS.includes(c.town));
  return inTarget.length ? inTarget[0] : cands[0];
}

// 「大里段670-22地號」→ { section:"大里段", no:"06700022" }
function parseParcel(address) {
  const m = address.match(/^(.+?段)(\d+)(?:-(\d+))?地號$/);
  if (!m) return null;
  const parent = String(m[2]).padStart(4, "0");
  const child = String(m[3] || 0).padStart(4, "0");
  return { section: m[1], no: parent + child };
}

async function queryParcel(sectcode, no) {
  const url = `https://api.nlsc.gov.tw/S_Maps_WebService/qryLand/GetLandPositionLongitudeLatitude/${COUNTY}/${sectcode}/${no}`;
  const res = await fetch(url, { headers: { Referer: NLSC_REFERER } });
  const xml = await res.text();
  const lng = xml.match(/<LONGITUDE>(.*?)<\/LONGITUDE>/)?.[1];
  const lat = xml.match(/<LATITUDE>(.*?)<\/LATITUDE>/)?.[1];
  if (lat && lng) {
    return { lat: Number(lat), lng: Number(lng), status: "ok" };
  }
  return { lat: null, lng: null, status: "parcel-notfound" };
}

async function main() {
  const properties = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8"));
  const cache = loadJson(CACHE_FILE, {});
  const sectionMap = await loadSectionMap();

  // 只處理地號格式、且尚未成功定位的物件（去重）
  const seen = new Set();
  const targets = [];
  for (const p of properties) {
    if (!p.address.includes("地號")) continue;
    if (cache[p.address]?.status === "ok") continue;
    if (seen.has(p.address)) continue;
    seen.add(p.address);
    targets.push(p.address);
  }

  console.log(`待定位地號：${targets.length} 筆（快取已有 ${Object.keys(cache).length} 筆）`);
  if (targets.length === 0) {
    console.log("全部已有座標，無需查詢。");
    return;
  }

  let ok = 0, noSection = 0, notFound = 0, badFormat = 0;

  for (let i = 0; i < targets.length; i++) {
    const address = targets[i];
    const parsed = parseParcel(address);
    if (!parsed) {
      cache[address] = { lat: null, lng: null, status: "bad-format" };
      badFormat++;
      continue;
    }

    const sect = resolveSection(sectionMap, parsed.section);
    if (!sect) {
      cache[address] = { lat: null, lng: null, status: "no-section" };
      noSection++;
      console.warn(`  [no-section] ${address}`);
      continue;
    }

    const result = await queryParcel(sect.sectcode, parsed.no);
    cache[address] = result;
    if (result.status === "ok") ok++;
    else {
      notFound++;
      console.warn(`  [notfound] ${address}（${sect.town}/${sect.sectcode}/${parsed.no}）`);
    }

    if ((i + 1) % 50 === 0 || i === targets.length - 1) {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
      console.log(`進度：${i + 1}/${targets.length}（成功 ${ok}，查無 ${notFound}）`);
    }

    await sleep(DELAY_MS);
  }

  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
  console.log(
    `\n完成。成功 ${ok}，查無地號 ${notFound}，無對應段 ${noSection}，格式錯誤 ${badFormat}。快取已更新。`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
