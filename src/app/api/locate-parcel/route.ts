import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { zoneAt } from "@/lib/zoneLookup";

// 地段代碼對照（scripts/geocode-parcel.mjs 產出）：段名 -> [{ town, sectcode, office }]
type SectionMap = Record<string, { town: string; sectcode: string; office: string }[]>;

const TARGET_TOWNS = ["B03", "B28", "B07"]; // 南區、大里區、南屯區（跨區同名段優先此三區）
const COUNTY = "B"; // 臺中市

let sectionMapCache: SectionMap | null = null;
function loadSectionMap(): SectionMap {
  if (sectionMapCache) return sectionMapCache;
  const filePath = path.join(process.cwd(), "data", "land-sections.json");
  sectionMapCache = JSON.parse(fs.readFileSync(filePath, "utf-8")) as SectionMap;
  return sectionMapCache;
}

// 「大里段670-22」「信義段八小段2-14」「大里段670-22地號」→ { section, no(8碼) }
function parseParcel(input: string): { section: string; no: string } | null {
  const q = input.trim().replace(/地號$/, "");
  const m = q.match(/^(.+?段(?:.+?小段)?)(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  const parent = String(m[2]).padStart(4, "0");
  const child = String(m[3] || 0).padStart(4, "0");
  return { section: m[1], no: parent + child };
}

function resolveSection(map: SectionMap, name: string, preferTown?: string) {
  const cands = map[name];
  if (!cands || cands.length === 0) return null;
  if (cands.length === 1) return cands[0];
  // 前端有指定區域（地政事務所）時優先採用
  if (preferTown) {
    const hit = cands.find((c) => c.town === preferTown);
    if (hit) return hit;
  }
  const inTarget = cands.filter((c) => TARGET_TOWNS.includes(c.town));
  return inTarget.length ? inTarget[0] : cands[0];
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q.trim()) {
    return NextResponse.json({ error: "請輸入地段地號" }, { status: 400 });
  }

  const parsed = parseParcel(q);
  if (!parsed) {
    return NextResponse.json(
      { error: "格式無法辨識，請輸入如「大里段670-22」" },
      { status: 400 }
    );
  }

  const town = req.nextUrl.searchParams.get("town") ?? undefined;
  const sect = resolveSection(loadSectionMap(), parsed.section, town);
  if (!sect) {
    return NextResponse.json({ error: `查無此地段：${parsed.section}` }, { status: 404 });
  }

  // 呼叫國土測繪中心地籍 API（需帶 Referer 才會回傳資料）
  const url = `https://api.nlsc.gov.tw/S_Maps_WebService/qryLand/GetLandPositionLongitudeLatitude/${COUNTY}/${sect.sectcode}/${parsed.no}`;
  const res = await fetch(url, { headers: { Referer: "https://maps.nlsc.gov.tw/" } });
  const xml = await res.text();
  const lng = xml.match(/<LONGITUDE>(.*?)<\/LONGITUDE>/)?.[1];
  const lat = xml.match(/<LATITUDE>(.*?)<\/LATITUDE>/)?.[1];

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "查無此地號座標（可能為已分割／合併地號）" },
      { status: 404 }
    );
  }

  const latNum = Number(lat);
  const lngNum = Number(lng);
  const zone = zoneAt(latNum, lngNum); // 該地號座標所在分區（含容積率）

  return NextResponse.json({
    lat: latNum,
    lng: lngNum,
    section: parsed.section,
    label: parsed.section + q.trim().replace(/地號$/, "").replace(parsed.section, ""),
    useZone: zone?.useZone ?? null,
    zoneFAR: zone?.zoneFAR ?? null,
    zoneCoverage: zone?.zoneCoverage ?? null,
  });
}
