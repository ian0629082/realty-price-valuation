/**
 * 預售屋建案抓取（591 新建案）
 *
 * 來源：591 新建案 BFF API（公開清單資料）
 *   列表：https://bff-newhouse.591.com.tw/v1/list?regionid=8&sectionid={區}
 *   詳情：https://bff-newhouse.591.com.tw/v1/detail/base-info?id={hid}（含座標）
 *
 * build_type=1 為「預售屋」。輸出結構化建案清單至 data/presale.json。
 *
 * 用法：node scripts/fetch-presale.mjs [每區最多筆數]
 *   （不帶參數＝全部；先抓一筆測試可用 `node scripts/fetch-presale.mjs 1`）
 */

import fs from "node:fs";

const REGION_ID = 8; // 台中市
// 與 app 涵蓋範圍一致（591 台中 sectionid）：南區=100、大里區=107、南屯區=105
const SECTIONS = { 南區: 100, 大里區: 107, 南屯區: 105 };
const OUTPUT_FILE = "data/presale.json";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const DEVICE_ID = "storemap0000000000000000000000ab";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const listHeaders = { "User-Agent": UA, Referer: "https://newhouse.591.com.tw/" };
const detailHeaders = (hid) => ({
  "User-Agent": UA,
  Referer: `https://newhouse.591.com.tw/${hid}`,
  deviceid: DEVICE_ID,
  device: "pc",
});

// 「2100~2400」→ { min:2100, max:2400 }；單一值兩者相同；無法解析回 null
function parseRange(str) {
  if (!str) return { min: null, max: null };
  const nums = String(str).match(/[\d.]+/g);
  if (!nums || nums.length === 0) return { min: null, max: null };
  const vals = nums.map(Number);
  return { min: vals[0], max: vals[vals.length - 1] };
}

async function fetchListPage(sectionid, page) {
  const url = `https://bff-newhouse.591.com.tw/v1/list?regionid=${REGION_ID}&sectionid=${sectionid}&page=${page}`;
  const res = await fetch(url, { headers: listHeaders });
  const json = await res.json();
  return json?.data ?? { items: [], total: 0, per_page: 20 };
}

async function fetchDetail(hid) {
  const url = `https://bff-newhouse.591.com.tw/v1/detail/base-info?id=${hid}`;
  const res = await fetch(url, { headers: detailHeaders(hid) });
  const json = await res.json();
  return json?.status === 1 ? json.data : null;
}

function buildRecord(item, detail) {
  const h = detail?.housing ?? {};
  const map = h.map ?? {};
  const price = parseRange(item.price);
  const area = parseRange(item.area); // 坪
  const round1 = (v) => Math.round(v * 10) / 10;

  // price_unit 可能是「萬/坪」(已是單價) 或「萬/戶」(總價，需除以坪數)
  let unitPrice = null;
  if (price.min != null) {
    if ((item.price_unit || "").includes("坪")) {
      unitPrice = round1((price.min + price.max) / 2);
    } else if (area.min && area.max) {
      const upMin = price.min / area.max;
      const upMax = price.max / area.min;
      unitPrice = round1((upMin + upMax) / 2);
    }
  }

  return {
    id: `presale-${item.hid}`,
    hid: item.hid,
    buildName: item.build_name,
    type: "預售屋",
    city: item.region,
    district: item.section, // 用建案自身的行政區
    address: item.address,
    lat: map.lat ? Number(map.lat) : null,
    lng: map.lng ? Number(map.lng) : null,
    priceText: item.price ? `${item.price} ${item.price_unit}` : "價格待定",
    priceMin: price.min,
    priceMax: price.max,
    areaText: item.area,
    areaMin: area.min,
    areaMax: area.max,
    unitPrice, // 萬/坪（推估中位）
    layout: item.room || (h.layout ? `${h.layout.layout}房` : ""),
    dealDate: h.deal_time_v2?.date || h.deal_time?.date || "",
    sellStatus: h.sell_time?.sell_status_txt || "",
    purpose: h.purpose_name || item.purpose_str || "",
    tags: item.tag || [],
    cover: item.cover || "",
    url: `https://newhouse.591.com.tw/${item.hid}`,
  };
}

async function main() {
  const limit = process.argv[2] ? parseInt(process.argv[2], 10) : Infinity;
  const records = [];

  for (const [district, sectionid] of Object.entries(SECTIONS)) {
    console.log(`\n=== ${district}（sectionid=${sectionid}）===`);
    const first = await fetchListPage(sectionid, 1);
    const perPage = first.per_page || 20;
    const pages = Math.ceil((first.total || 0) / perPage);
    let items = first.items || [];
    for (let p = 2; p <= pages; p++) {
      await sleep(400);
      const d = await fetchListPage(sectionid, p);
      items = items.concat(d.items || []);
    }
    // 僅該區的預售屋（build_type=1）；591 建案少時會補鄰區推薦，故以 sectionid 過濾
    const presale = items
      .filter((it) => it.build_type === 1 && it.sectionid === sectionid)
      .slice(0, limit);
    console.log(`預售屋 ${presale.length} 筆，抓取詳情座標...`);

    for (const item of presale) {
      const detail = await fetchDetail(item.hid);
      records.push(buildRecord(item, detail));
      process.stdout.write(`  ${item.build_name}\n`);
      await sleep(400);
    }
  }

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(records, null, 2), "utf-8");
  console.log(`\n完成：${records.length} 筆預售屋，已輸出至 ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
