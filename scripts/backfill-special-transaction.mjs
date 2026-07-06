/**
 * 一次性回填腳本：把「特殊交易」標記補進既有 data/properties.json 的 sales[] 內。
 *
 * 背景：normalize-data.mjs 已改為會解析政府 CSV 的「備註」欄位並標記特殊交易，
 * 但 normalize-data.mjs 是從原始 CSV 「重新產生」data/properties.json，若直接重跑
 * 會覆蓋掉後續步驟（geocode / enrich-zone / enrich-road / enrich-business 等）
 * 已經寫入的欄位。此腳本改為「比對後就地補欄位」，不影響其他既有資料。
 *
 * 用法：node scripts/backfill-special-transaction.mjs
 * 完成後需重跑：npm run data:build-ui（重新產生 src/data/properties.json）
 */

import fs from "node:fs";
import path from "node:path";
import { CITY_FILE_PREFIX, TARGET_DISTRICTS, RAW_DIR, OUTPUT_FILE, SEASONS } from "./config.mjs";

function rocDateToISO(rocDate) {
  if (!rocDate || rocDate.length < 7) return null;
  const year = Number(rocDate.slice(0, 3)) + 1911;
  const month = rocDate.slice(3, 5);
  const day = rocDate.slice(5, 7);
  return `${year}-${month}-${day}`;
}

function parseCsv(filePath) {
  const text = fs.readFileSync(filePath, "utf-8").replace(/^﻿/, "");
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  return lines.slice(2).map((line) => line.split(","));
}

// 與 normalize-data.mjs 同一套關鍵字，僅標記價格可能不反映市場行情的交易類型
function isSpecialTransactionNote(note) {
  return /特殊關係間之交易|持分|畸零地|政府機關標讓售|協議價購|債務抵償/.test(note || "");
}

// 建立「交易識別鍵 → 是否特殊交易」對照表，鍵值與 normalize-data.mjs 的 dedupBySerial 一致
function buildFlagMap() {
  const map = new Map();
  for (const season of SEASONS) {
    const filePath = path.join(RAW_DIR, season, `${CITY_FILE_PREFIX}_lvr_land_a.csv`);
    if (!fs.existsSync(filePath)) continue;
    for (const cols of parseCsv(filePath)) {
      if (!TARGET_DISTRICTS.includes(cols[0])) continue;
      const serial = (cols[27] || "").trim();
      const date = rocDateToISO(cols[7]);
      const totalPriceNTD = Number(cols[21]) || 0;
      const buildingAreaSqm = Number(cols[15]) || 0;
      const landAreaSqm = Number(cols[3]) || 0;
      const flag = isSpecialTransactionNote(cols[26]);
      const key = serial
        ? `s:${serial}`
        : `f:${date}|${totalPriceNTD}|${buildingAreaSqm}|${landAreaSqm}`;
      map.set(key, flag);
    }
  }
  return map;
}

function main() {
  const flagMap = buildFlagMap();
  const properties = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8"));

  let matched = 0;
  let flagged = 0;
  for (const p of properties) {
    for (const s of p.sales) {
      const key = s.serial
        ? `s:${s.serial}`
        : `f:${s.date}|${s.totalPriceNTD}|${s.buildingAreaSqm}|${s.landAreaSqm}`;
      const flag = flagMap.get(key);
      if (flag !== undefined) matched++;
      s.isSpecialTransaction = flag ?? false;
      if (s.isSpecialTransaction) flagged++;
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(properties, null, 2), "utf-8");
  console.log(
    `比對 ${matched} 筆交易紀錄，其中 ${flagged} 筆標記為特殊交易（親友/持分/畸零地等）。已更新 ${OUTPUT_FILE}`
  );
}

main();
