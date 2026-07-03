import fs from "node:fs";
import path from "node:path";

// 分區即時查詢（scripts/build-zone-lookup.mjs 產出，僅後端載入）
// z:使用分區 f:容積率 c:建蔽率 r:外環座標 [[lng,lat],...]（僅目標三區）
interface ZonePolygon {
  z: string;
  f: number | null;
  c: number | null;
  r: [number, number][];
}

// 「住宅區」「商業區」（無編號舊制分區）容積率依臨路寬度分級，KML 圖資本身未收錄單一數字。
// 依台中市都發局《變更臺中市大里地區都市計畫細部計畫（土地使用分區管制要點）》，
// 未達 15 公尺計畫道路取低級距（住宅 180% / 商業 320%），以此作為預設推估值；
// 臨接 15 公尺以上計畫道路且基地縱深 30 公尺內者容積率較高（住宅 240% / 商業 480%），僅供參考。
const DEFAULT_FAR: Record<string, number> = {
  住宅區: 180,
  商業區: 320,
};

let cache: (ZonePolygon & { bbox: [number, number, number, number] })[] | null = null;

function load() {
  if (cache) return cache;
  const filePath = path.join(process.cwd(), "src", "data", "zone-lookup.json");
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as ZonePolygon[];
  // 預先算每個多邊形的 bbox，加速逐點查詢
  cache = raw.map((zp) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of zp.r) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { ...zp, bbox: [minX, minY, maxX, maxY] as [number, number, number, number] };
  });
  return cache;
}

// 射線法：點 (lng,lat) 是否在外環 ring 內
function pointInRing(lng: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// 找出座標所在分區：回傳 { useZone, zoneFAR, zoneCoverage, zoneFAREstimated } 或 null
// zoneFAREstimated：容積率非圖資原值，而是依「住宅區/商業區」預設低級距推估（見 DEFAULT_FAR 說明）
export function zoneAt(lat: number, lng: number) {
  for (const zp of load()) {
    const [minX, minY, maxX, maxY] = zp.bbox;
    if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue;
    if (pointInRing(lng, lat, zp.r)) {
      if (zp.f != null) {
        return { useZone: zp.z, zoneFAR: zp.f, zoneCoverage: zp.c, zoneFAREstimated: false };
      }
      const fallback = DEFAULT_FAR[zp.z];
      if (fallback != null) {
        return { useZone: zp.z, zoneFAR: fallback, zoneCoverage: zp.c, zoneFAREstimated: true };
      }
      return { useZone: zp.z, zoneFAR: null, zoneCoverage: zp.c, zoneFAREstimated: false };
    }
  }
  return null;
}
