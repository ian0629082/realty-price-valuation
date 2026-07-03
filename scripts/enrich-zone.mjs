/**
 * 點位 × 都市計畫分區 空間疊合
 *
 * 輸入：
 *   data/zone/108期末_都計U0002_TWD97_0107.kml  — 台中市都計分區 KML（WGS84）
 *   data/geocode-cache.json                       — 地址 → 座標快取
 *   data/properties.json                          — 正規化後的物件清單
 *
 * 輸出：
 *   data/properties.json（in-place 更新，加入 detailedZone 欄位）
 *
 * 邏輯：
 *   1. 解析 KML，取出每個 Placemark 的「使用分區/建蔽率/容積率」與多邊形座標
 *   2. 對每筆有真實座標的物件做 point-in-polygon
 *   3. 找到最細的分區後寫入 detailedZone、zoneCoverage(建蔽率%)、zoneFAR(容積率%)
 */

import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point, polygon, multiPolygon } from "@turf/helpers";
import { OUTPUT_FILE } from "./config.mjs";

const KML_FILE = "data/zone/108期末_都計U0002_TWD97_0107.kml";
const CACHE_FILE = "data/geocode-cache.json";

// ── 從 Placemark 的 description HTML 表格中取欄位值 ────────────────────────
// 表格格式：<td>欄名</td><td>值</td>
function extractField(desc, label) {
  const m = desc.match(new RegExp(`<td>${label}</td>\\s*<td>([^<]*)</td>`));
  return m ? m[1].trim() : null;
}

// 建蔽率/容積率為數值（如 60、240），空值或非數字回 null
function toNum(str) {
  if (str == null || str === "") return null;
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
}

// 取出分區資訊：{ name(使用分區), coverage(建蔽率%), far(容積率%) }；無使用分區回 null
function extractZoneInfo(desc) {
  if (!desc) return null;
  const name = extractField(desc, "使用分區");
  if (!name) return null;
  return {
    name,
    coverage: toNum(extractField(desc, "建蔽率")),
    far: toNum(extractField(desc, "容積率")),
  };
}

// ── 將 KML coordinates 字串解析為 [lng, lat] 陣列 ─────────────────────────
function parseCoords(coordStr) {
  return coordStr
    .trim()
    .split(/\s+/)
    .map((triple) => {
      const [lng, lat] = triple.split(",").map(Number);
      return [lng, lat];
    })
    .filter(([lng, lat]) => !isNaN(lng) && !isNaN(lat));
}

// ── 從 Polygon element 中取出外環（LinearRing）座標 ──────────────────────
function extractRing(polygonObj) {
  const outerRing =
    polygonObj?.outerBoundaryIs?.LinearRing?.coordinates ??
    polygonObj?.outerBoundaryIs?.LinearRing?.coordinates;
  if (!outerRing) return null;
  const coords = parseCoords(outerRing);
  if (coords.length < 4) return null;
  // GeoJSON polygon ring 必須首尾相同
  const first = coords[0], last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) coords.push(coords[0]);
  return coords;
}

// ── 主程式 ───────────────────────────────────────────────────────────────
function main() {
  console.log("讀取 KML（73MB，可能需要幾秒）...");
  const kmlText = fs.readFileSync(KML_FILE, "utf-8");

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name) => ["Placemark", "Polygon", "MultiGeometry"].includes(name),
    cdataPropName: "__cdata",
  });
  const parsed = parser.parse(kmlText);

  // 找 Placemark 陣列（可能在 Document > Folder 或直接在 Document）
  const doc = parsed?.kml?.Document;
  const folder = Array.isArray(doc?.Folder) ? doc.Folder[0] : doc?.Folder;
  const placemarks = folder?.Placemark ?? doc?.Placemark ?? [];

  console.log(`解析到 ${placemarks.length} 個 Placemark`);

  // ── 建立分區多邊形清單 ────────────────────────────────────────────────
  const zones = [];
  for (const pm of placemarks) {
    const descRaw =
      typeof pm.description === "object"
        ? pm.description.__cdata ?? pm.description["#text"] ?? ""
        : pm.description ?? "";
    const zoneInfo = extractZoneInfo(descRaw);
    if (!zoneInfo) continue;

    // Placemark 可能有 Polygon 或 MultiGeometry > Polygon
    const polygons = [];

    // MultiGeometry is parsed as an array (isArray config)
    const geoList = Array.isArray(pm.MultiGeometry)
      ? pm.MultiGeometry
      : pm.MultiGeometry ? [pm.MultiGeometry] : [];
    const directPolys = pm.Polygon ? (Array.isArray(pm.Polygon) ? pm.Polygon : [pm.Polygon]) : [];

    for (const geo of geoList) {
      const geoPolys = geo.Polygon
        ? Array.isArray(geo.Polygon) ? geo.Polygon : [geo.Polygon]
        : [];
      polygons.push(...geoPolys);
    }
    polygons.push(...directPolys);

    for (const poly of polygons) {
      const ring = extractRing(poly);
      if (!ring) continue;
      try {
        zones.push({
          name: zoneInfo.name,
          coverage: zoneInfo.coverage,
          far: zoneInfo.far,
          geom: polygon([ring]),
        });
      } catch {
        // skip invalid polygon
      }
    }
  }

  console.log(`有效分區多邊形：${zones.length} 個`);

  // ── 讀取座標快取與物件清單 ───────────────────────────────────────────
  const cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
  const properties = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8"));

  let enriched = 0, skipped = 0, notFound = 0;

  for (const prop of properties) {
    const geo = cache[prop.address];
    if (!geo || geo.status !== "ok" || !geo.lat || !geo.lng) {
      skipped++;
      continue;
    }

    const pt = point([geo.lng, geo.lat]);
    let matched = null;
    for (const zone of zones) {
      if (booleanPointInPolygon(pt, zone.geom)) {
        matched = zone;
        break;
      }
    }

    if (matched) {
      prop.detailedZone = matched.name;
      prop.zoneCoverage = matched.coverage; // 建蔽率（%）
      prop.zoneFAR = matched.far; // 容積率（%）
      enriched++;
    } else {
      notFound++;
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(properties, null, 2), "utf-8");
  console.log(`\n完成：`);
  console.log(`  比對成功：${enriched} 筆`);
  console.log(`  找不到分區：${notFound} 筆`);
  console.log(`  無座標跳過：${skipped} 筆`);
  console.log(`已更新 ${OUTPUT_FILE}`);
}

main();
