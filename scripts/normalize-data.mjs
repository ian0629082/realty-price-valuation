import fs from "node:fs";
import path from "node:path";
import { CITY_FILE_PREFIX, TARGET_DISTRICTS, RAW_DIR, OUTPUT_FILE, SEASONS } from "./config.mjs";

function toHalfWidth(str) {
  return str.replace(/[！-～]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );
}

function normalizeAddress(raw) {
  return toHalfWidth(raw).trim();
}

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
  // 第1行中文表頭，第2行英文表頭，第3行起為資料
  return lines.slice(2).map((line) => line.split(","));
}

function loadSaleRows() {
  const rows = [];
  for (const season of SEASONS) {
    const filePath = path.join(RAW_DIR, season, `${CITY_FILE_PREFIX}_lvr_land_a.csv`);
    if (!fs.existsSync(filePath)) continue;
    for (const cols of parseCsv(filePath)) {
      if (!TARGET_DISTRICTS.includes(cols[0])) continue;
      rows.push({
        season,
        district: cols[0],
        transactionSign: cols[1],
        rawAddress: cols[2],
        date: rocDateToISO(cols[7]),
        buildingType: cols[11] || "",
        mainUse: cols[12] || "",
        landAreaSqm: Number(cols[3]) || 0,
        useZone: cols[4] || cols[5] || "",
        useDesignation: cols[6] || "",
        buildingAreaSqm: Number(cols[15]) || 0,
        totalPrice: Number(cols[21]) || 0,
        note: cols[26] || "", // 備註：政府標記特殊關係人/持分/畸零地等非典型交易
        serial: (cols[27] || "").trim(), // 編號：跨季去重依據
      });
    }
  }
  return rows;
}

function loadRentRows() {
  const rows = [];
  for (const season of SEASONS) {
    const filePath = path.join(RAW_DIR, season, `${CITY_FILE_PREFIX}_lvr_land_c.csv`);
    if (!fs.existsSync(filePath)) continue;
    for (const cols of parseCsv(filePath)) {
      if (!TARGET_DISTRICTS.includes(cols[0])) continue;
      rows.push({
        season,
        district: cols[0],
        rawAddress: cols[2],
        date: rocDateToISO(cols[7]),
        floor: cols[9],
        buildingType: cols[11] || "",
        mainUse: cols[12] || "",
        buildingArea: Number(cols[15]) || 0,
        monthlyRent: Number(cols[22]) || 0,
        note: cols[27] || "",
        leasePeriod: cols[31] || "",
        serial: (cols[28] || "").trim(), // 編號：跨季去重依據
      });
    }
  }
  return rows;
}

// 從「建物型態」「主要用途」判斷是否為商業/店面用途
function isCommercialUse(buildingType, mainUse) {
  const text = `${buildingType}｜${mainUse}`;
  return /店面|店鋪|店舖|商業|商辦|商店|辦公|廠房|工廠|營業/.test(text);
}

// 政府備註標記價格可能不反映市場行情的交易（親友/員工/持分/畸零地/政府標售/協議價購/債務抵償等）；
// 不含「陽台外推」「其他增建」「頂樓加蓋」等單純現況描述，避免誤傷大量正常交易
function isSpecialTransactionNote(note) {
  return /特殊關係間之交易|持分|畸零地|政府機關標讓售|協議價購|債務抵償/.test(note || "");
}

function buildProperties(saleRows, rentRows) {
  const propertiesByAddress = new Map();

  function getOrCreate(address, district) {
    if (!propertiesByAddress.has(address)) {
      propertiesByAddress.set(address, {
        address,
        district,
        // 先暫定，聚合完成後再依交易的建物型態/主要用途分類
        type: address.includes("地號") ? "土地" : "住宅",
        commercial: false, // 任一交易為商業用途即為 true
        sales: [],
        rents: [],
      });
    }
    return propertiesByAddress.get(address);
  }

  for (const row of saleRows) {
    const address = normalizeAddress(row.rawAddress);
    const property = getOrCreate(address, row.district);
    if (isCommercialUse(row.buildingType, row.mainUse)) property.commercial = true;
    property.sales.push({
      season: row.season,
      serial: row.serial,
      totalPriceNTD: row.totalPrice,
      date: row.date,
      transactionType: row.transactionSign,
      landAreaSqm: row.landAreaSqm,
      buildingAreaSqm: row.buildingAreaSqm,
      useZone: row.useZone,
      useDesignation: row.useDesignation,
      isSpecialTransaction: isSpecialTransactionNote(row.note),
    });
  }

  for (const row of rentRows) {
    const address = normalizeAddress(row.rawAddress);
    const property = getOrCreate(address, row.district);
    if (isCommercialUse(row.buildingType, row.mainUse)) property.commercial = true;
    const [leaseStartRoc, leaseEndRoc] = row.leasePeriod.split("~");
    property.rents.push({
      season: row.season,
      serial: row.serial,
      monthlyRent: row.monthlyRent,
      floor: row.floor,
      date: row.date,
      leaseStart: rocDateToISO(leaseStartRoc) || row.date,
      leaseEnd: rocDateToISO(leaseEndRoc) || row.date,
      note: row.note || undefined,
    });
  }

  // 跨季去重：同一筆交易可能在相鄰季檔案重複釋出，以「編號」為唯一鍵；
  // 編號為空時退回用交易內容組合鍵（保留不同日期/價格的交易）
  function dedupBySerial(records, fallbackKey) {
    const seen = new Set();
    const out = [];
    for (const r of records) {
      const key = r.serial ? `s:${r.serial}` : `f:${fallbackKey(r)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    return out;
  }

  for (const p of propertiesByAddress.values()) {
    if (p.type !== "土地") p.type = p.commercial ? "店面" : "住宅";
    delete p.commercial;
    p.sales = dedupBySerial(
      p.sales,
      (r) => `${r.date}|${r.totalPriceNTD}|${r.buildingAreaSqm}|${r.landAreaSqm}`
    );
    p.rents = dedupBySerial(
      p.rents,
      (r) => `${r.date}|${r.monthlyRent}|${r.leaseStart}|${r.leaseEnd}|${r.floor}`
    );
  }

  return Array.from(propertiesByAddress.values());
}

function main() {
  const saleRows = loadSaleRows();
  const rentRows = loadRentRows();
  console.log(`篩選後買賣筆數：${saleRows.length}，租賃筆數：${rentRows.length}`);

  const properties = buildProperties(saleRows, rentRows);
  console.log(`正規化後物件數（依門牌/地號去重聚合）：${properties.length}`);

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(properties, null, 2), "utf-8");
  console.log(`已輸出：${OUTPUT_FILE}`);
}

main();
