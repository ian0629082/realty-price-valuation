import fs from "node:fs";
import path from "node:path";
import { OUTPUT_FILE } from "./config.mjs";

const CACHE_FILE = "data/geocode-cache.json";
const API_KEY = process.env.GOOGLE_GEOCODING_API_KEY;
const DELAY_MS = 120; // 每次請求間隔，避免超過 rate limit

if (!API_KEY) {
  console.error("找不到 GOOGLE_GEOCODING_API_KEY，請確認 .env.local 是否正確");
  process.exit(1);
}

function loadCache() {
  if (!fs.existsSync(CACHE_FILE)) return {};
  return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function geocodeAddress(address) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${API_KEY}&language=zh-TW&region=TW`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.status === "OK" && data.results.length > 0) {
    const { lat, lng } = data.results[0].geometry.location;
    return { lat, lng, status: "ok" };
  }
  return { lat: null, lng: null, status: data.status };
}

async function main() {
  const properties = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8"));
  const cache = loadCache();

  // 只對有完整門牌的物件做地理編碼；地號格式由 geocode-parcel.mjs 以地籍 API 處理
  const targets = properties.filter(
    (p) => !p.address.includes("地號") && !cache[p.address]
  );

  console.log(`快取已有：${Object.keys(cache).length} 筆`);
  console.log(`待查詢：${targets.length} 筆（共 ${properties.length} 筆，地號跳過）`);

  if (targets.length === 0) {
    console.log("全部已有快取，無需重新查詢。");
    return;
  }

  let ok = 0, failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const p = targets[i];
    const result = await geocodeAddress(p.address);
    cache[p.address] = result;

    if (result.status === "ok") {
      ok++;
    } else {
      failed++;
      console.warn(`  [${result.status}] ${p.address}`);
    }

    if ((i + 1) % 50 === 0 || i === targets.length - 1) {
      saveCache(cache);
      console.log(`進度：${i + 1}/${targets.length}（成功 ${ok}，失敗 ${failed}）`);
    }

    await sleep(DELAY_MS);
  }

  saveCache(cache);
  console.log(`\n完成。成功 ${ok} 筆，失敗 ${failed} 筆，快取已儲存至 ${CACHE_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
