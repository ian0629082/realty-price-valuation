/**
 * 產生「分區即時查詢」精簡檔 src/data/zone-lookup.json
 *
 * 從都市計畫分區 KML 抽出「目標行政區」的分區多邊形（使用分區/容積率/建蔽率＋外環座標），
 * 供 /api/locate-parcel 對地號座標做 point-in-polygon，即時得到該點的容積率。
 *
 * 輸出格式（精簡鍵，座標取 6 位小數）：
 *   [{ z:使用分區, f:容積率|null, c:建蔽率|null, d:行政區, r:[[lng,lat],...] }]
 */

import fs from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import { TARGET_DISTRICTS } from "./config.mjs";

const KML_FILE = "data/zone/108期末_都計U0002_TWD97_0107.kml";
const OUT_FILE = "src/data/zone-lookup.json";

function extractField(desc, label) {
  const m = desc.match(new RegExp(`<td>${label}</td>\\s*<td>([^<]*)</td>`));
  return m ? m[1].trim() : null;
}

function toNum(str) {
  if (str == null || str === "") return null;
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
}

function parseCoords(coordStr) {
  return coordStr
    .trim()
    .split(/\s+/)
    .map((triple) => {
      const [lng, lat] = triple.split(",").map(Number);
      return [Math.round(lng * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6];
    })
    .filter(([lng, lat]) => !isNaN(lng) && !isNaN(lat));
}

function extractRing(polygonObj) {
  const outerRing = polygonObj?.outerBoundaryIs?.LinearRing?.coordinates;
  if (!outerRing) return null;
  const coords = parseCoords(outerRing);
  if (coords.length < 4) return null;
  const first = coords[0], last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) coords.push(coords[0]);
  return coords;
}

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
  const doc = parsed?.kml?.Document;
  const folder = Array.isArray(doc?.Folder) ? doc.Folder[0] : doc?.Folder;
  const placemarks = folder?.Placemark ?? doc?.Placemark ?? [];
  console.log(`解析到 ${placemarks.length} 個 Placemark`);

  const targetSet = new Set(TARGET_DISTRICTS);
  const out = [];

  for (const pm of placemarks) {
    const descRaw =
      typeof pm.description === "object"
        ? pm.description.__cdata ?? pm.description["#text"] ?? ""
        : pm.description ?? "";
    const zone = extractField(descRaw, "使用分區");
    if (!zone) continue;
    const district = extractField(descRaw, "行政區");
    if (!targetSet.has(district)) continue; // 只保留目標行政區

    const far = toNum(extractField(descRaw, "容積率"));
    const coverage = toNum(extractField(descRaw, "建蔽率"));

    const polygons = [];
    const geoList = Array.isArray(pm.MultiGeometry)
      ? pm.MultiGeometry
      : pm.MultiGeometry ? [pm.MultiGeometry] : [];
    for (const geo of geoList) {
      const geoPolys = geo.Polygon
        ? Array.isArray(geo.Polygon) ? geo.Polygon : [geo.Polygon]
        : [];
      polygons.push(...geoPolys);
    }
    const directPolys = pm.Polygon ? (Array.isArray(pm.Polygon) ? pm.Polygon : [pm.Polygon]) : [];
    polygons.push(...directPolys);

    for (const poly of polygons) {
      const ring = extractRing(poly);
      if (!ring) continue;
      out.push({ z: zone, f: far, c: coverage, d: district, r: ring });
    }
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out), "utf-8");
  const kb = Math.round(fs.statSync(OUT_FILE).size / 1024);
  console.log(`目標區分區多邊形：${out.length} 個 → ${OUT_FILE}（${kb} KB）`);
}

main();
