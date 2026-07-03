import fs from "node:fs";
import path from "node:path";
import proj4 from "proj4";

// 臨路寬即時查詢（scripts/build-road-lookup.mjs 產出，僅後端載入）
// n:路名 w:路寬(m) x1,y1,x2,y2:線段兩端 TWD97 平面座標（僅目標三區）
interface RoadSegment {
  n: string;
  w: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const SNAP_MAX_M = 100; // 最近道路超過此距離視為無臨路資料（與 enrich-road.mjs 一致）
const MEDIAN_WIDTH_M = 30; // 路寬 >= 此值推估有分隔島
const CELL = 200; // 空間網格索引邊長（公尺）

// TWD97 TM2（EPSG:3826）；座標轉此平面座標後以公尺比對，與 enrich-road.mjs 一致
const TWD97 =
  "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs";
const toTWD97 = (lat: number, lng: number): [number, number] =>
  proj4("WGS84", TWD97, [lng, lat]) as [number, number];

let cache: { segs: RoadSegment[]; grid: Map<string, number[]> } | null = null;

function load() {
  if (cache) return cache;
  const filePath = path.join(process.cwd(), "src", "data", "road-lookup.json");
  const segs = JSON.parse(fs.readFileSync(filePath, "utf-8")) as RoadSegment[];
  const grid = new Map<string, number[]>();
  const key = (gx: number, gy: number) => gx + "," + gy;
  segs.forEach((s, i) => {
    const gx0 = Math.floor(Math.min(s.x1, s.x2) / CELL);
    const gx1 = Math.floor(Math.max(s.x1, s.x2) / CELL);
    const gy0 = Math.floor(Math.min(s.y1, s.y2) / CELL);
    const gy1 = Math.floor(Math.max(s.y1, s.y2) / CELL);
    for (let gx = gx0; gx <= gx1; gx++)
      for (let gy = gy0; gy <= gy1; gy++) {
        const k = key(gx, gy);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k)!.push(i);
      }
  });
  cache = { segs, grid };
  return cache;
}

// 點到線段最短距離（平面，公尺）
function pointToSeg(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// 找出座標最近的道路段（100m 內）：回傳 { roadWidth, roadName, hasMedian } 或 null
// 僅供參考（非官方逐宗地臨路寬資料，見 scripts/enrich-road.mjs 說明）
export function roadWidthAt(lat: number, lng: number) {
  const { segs, grid } = load();
  const [px, py] = toTWD97(lat, lng);
  const gx = Math.floor(px / CELL), gy = Math.floor(py / CELL);

  let best: RoadSegment | null = null;
  let bestDist = Infinity;
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      const cell = grid.get(gx + dx + "," + (gy + dy));
      if (!cell) continue;
      for (const i of cell) {
        const s = segs[i];
        const d = pointToSeg(px, py, s.x1, s.y1, s.x2, s.y2);
        if (d < bestDist) {
          bestDist = d;
          best = s;
        }
      }
    }

  if (!best || bestDist > SNAP_MAX_M) return null;
  return {
    roadWidth: best.w,
    roadName: best.n || null,
    hasMedian: best.w >= MEDIAN_WIDTH_M,
  };
}
