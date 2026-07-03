/**
 * 依門牌把財政部稅籍商號比對到每個物件，寫入 property.businesses。
 *
 * 比對邏輯：兩邊地址正規化成「區＋路段巷弄＋號」的 join key
 *   - 全形轉半形、去空白、去市名、去里名
 *   - 切到第一個「號」為止，統一之/-/― 分隔
 * 稅籍全為營業中，故 status 固定「營業中」；樓層由地址「號」之後擷取。
 */
import fs from "node:fs";
import path from "node:path";
import { RAW_DIR, OUTPUT_FILE } from "./config.mjs";

const TAX_FILE = path.join(RAW_DIR, "tax-business.csv");
const MAX_PER_ADDRESS = 20; // 單一門牌最多附掛的商號數，避免 JSON 過度膨脹

function parseCsvLine(line) {
  const out = [];
  let cur = "", inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === "," && !inQuote) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function toHalf(s) {
  return s
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, "")
    .replace(/\s/g, "");
}

// 正規化地址為 join key（區＋路段巷弄＋號）
function keyOf(addrRaw) {
  let a = toHalf(addrRaw).replace(/^台中市|^臺中市/, "");
  a = a.replace(/^(大里區|南屯區|南區|東區|西區|北區|中區)([一-鿿]{1,4}里)/, "$1");
  const i = a.indexOf("號");
  if (i < 0) return null;
  return a.slice(0, i + 1).replace(/[之―－\-]/g, "-");
}

// 擷取「號」之後的樓層描述（例：一樓、２樓之1），供店面判斷樓層位置
function floorOf(addrRaw) {
  const a = toHalf(addrRaw);
  const i = a.indexOf("號");
  if (i < 0) return "";
  const rest = a.slice(i + 1);
  const m = rest.match(/[0-9一二三四五六七八九十]+樓[之0-9]*/);
  return m ? m[0] : "";
}

// 只保留地面層店面：無樓層，或 1 樓/一樓（排除 10~19 樓等以 1 開頭者）
function isGroundFloor(floor) {
  if (!floor) return true;
  return /^(1|一)樓/.test(floor) && !/^1[0-9]樓/.test(floor);
}

function main() {
  // 建立 key → 商號清單
  const lines = fs.readFileSync(TAX_FILE, "utf-8").split("\n").filter((l) => l.trim());
  const index = new Map();
  for (let i = 1; i < lines.length; i++) {
    const [addr, , name, , industry] = parseCsvLine(lines[i]);
    const key = keyOf(addr);
    if (!key) continue;
    const floorPosition = floorOf(addr);
    if (!isGroundFloor(floorPosition)) continue; // 只要地面層店面
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({
      name,
      industry: industry || "",
      status: "營業中",
      floorPosition,
    });
  }
  console.log(`稅籍索引：${lines.length - 1} 筆商號 → ${index.size} 個門牌`);

  const properties = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8"));
  let matched = 0, totalBiz = 0;
  for (const p of properties) {
    const key = keyOf(p.address);
    const list = key ? index.get(key) : null;
    if (list && list.length) {
      p.businesses = list.slice(0, MAX_PER_ADDRESS);
      p.businessCount = list.length; // 實際總數（可能超過上限）
      matched++;
      totalBiz += list.length;
    } else {
      p.businesses = [];
      p.businessCount = 0;
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(properties, null, 2), "utf-8");
  console.log(`比對：${matched}/${properties.length} 個物件掛到商號，共 ${totalBiz} 筆登記`);
  console.log(`已更新 ${OUTPUT_FILE}`);
}

main();
