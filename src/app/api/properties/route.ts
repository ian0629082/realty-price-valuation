import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { Property, PropertyType, PresaleInfo } from "@/types/property";
import { estimateCapRate } from "@/lib/capRate";

function loadProperties(): Property[] {
  const filePath = path.join(process.cwd(), "src", "data", "properties.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as Property[];
}

// 預售屋原始抓取記錄（scripts/fetch-presale.mjs 產出）
interface PresaleRecord extends PresaleInfo {
  id: string;
  city: string;
  district: string;
  lat: number | null;
  lng: number | null;
  areaMin: number | null;
}

// 實價登錄預售成交均價（scripts/build-presale-actual.mjs 產出）：normKey -> { name, avgUnitPrice, count }
type ActualMap = Record<string, { name: string; avgUnitPrice: number; count: number }>;
let actualCache: { map: ActualMap; keys: string[] } | null = null;
function loadActual() {
  if (actualCache) return actualCache;
  const filePath = path.join(process.cwd(), "src", "data", "presale-actual.json");
  const map = fs.existsSync(filePath)
    ? (JSON.parse(fs.readFileSync(filePath, "utf-8")) as ActualMap)
    : {};
  actualCache = { map, keys: Object.keys(map) };
  return actualCache;
}

// 建案名稱正規化，與 build-presale-actual.mjs 的 normalizeName 一致
function normalizeName(raw: string): string {
  return (raw || "")
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[\s‧・·．.\-‐‑–—・･]/g, "")
    .trim();
}

// 依建案名對應實價登錄成交均價：先完全相符，再取名稱互相包含者（591 常多建商前綴）
function matchActual(buildName: string): { avgUnitPrice: number; count: number } | null {
  const { map, keys } = loadActual();
  const key = normalizeName(buildName);
  if (!key) return null;
  if (map[key]) return { avgUnitPrice: map[key].avgUnitPrice, count: map[key].count };
  // 包含式配對：取重疊最長（最具體）的候選，避免過短名稱誤配
  let best: string | null = null;
  for (const k of keys) {
    if ((k.includes(key) || key.includes(k)) && (!best || k.length > best.length)) best = k;
  }
  return best ? { avgUnitPrice: map[best].avgUnitPrice, count: map[best].count } : null;
}

// 將 591 建案記錄轉為地圖可用的 Property（type 為「預售屋」）
function loadPresale(): Property[] {
  const filePath = path.join(process.cwd(), "src", "data", "presale.json");
  if (!fs.existsSync(filePath)) return [];
  const records = JSON.parse(fs.readFileSync(filePath, "utf-8")) as PresaleRecord[];
  return records
    .filter((r) => r.lat != null && r.lng != null)
    .map((r) => {
      const actual = matchActual(r.buildName);
      return {
      id: r.id,
      address: r.buildName,
      type: "預售屋" as PropertyType,
      city: r.city,
      district: r.district,
      lat: r.lat as number,
      lng: r.lng as number,
      roadWidth: null,
      hasMedian: false,
      buildingArea: r.areaMin ?? 0,
      rents: [],
      businesses: [],
      presale: {
        buildName: r.buildName,
        priceText: r.priceText,
        priceMin: r.priceMin,
        priceMax: r.priceMax,
        areaText: r.areaText,
        unitPrice: r.unitPrice,
        actualUnitPrice: actual?.avgUnitPrice ?? null,
        actualCount: actual?.count ?? 0,
        layout: r.layout,
        dealDate: r.dealDate,
        sellStatus: r.sellStatus,
        purpose: r.purpose,
        tags: r.tags,
        cover: r.cover,
        url: r.url,
      },
      };
    });
}

// 檢視模式 → 物件類型 + 交易別
const VIEW_MODE_RULES: Record<string, { type: PropertyType; kind: "sale" | "rent" }> = {
  "store-sale": { type: "店面", kind: "sale" },
  "resi-sale": { type: "住宅", kind: "sale" },
  "store-rent": { type: "店面", kind: "rent" },
  "resi-rent": { type: "住宅", kind: "rent" },
  "land-sale": { type: "土地", kind: "sale" },
  // 土地評估：顯示土地成交點位（含面積），供地籍圖疊合與右鍵查坪數
  "land-eval": { type: "土地", kind: "sale" },
};

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const city = searchParams.get("city") ?? "全部";
  const district = searchParams.get("district") ?? "全部";
  const viewMode = searchParams.get("viewMode") ?? "store-sale";

  const isPresale = viewMode === "presale";
  const all = isPresale ? loadPresale() : loadProperties();

  const filtered = all.filter((p) => {
    if (city !== "全部" && p.city !== city) return false;
    if (district !== "全部" && p.district !== district) return false;

    // 預售屋／土地評估：資料已是建案，僅套用縣市/區域篩選
    if (isPresale) return true;

    // 買賣投報率：同時具備買賣與租賃成交的物件
    if (viewMode === "cap-rate") {
      if (!p.sale || p.rents.length === 0) return false;
      // 投報率低於 1% 多為資料來源錯誤（如成交價含大面積土地、租金為部分空間），過濾掉
      const cap = estimateCapRate(p);
      return cap !== null && cap >= 1;
    }

    const rule = VIEW_MODE_RULES[viewMode] ?? VIEW_MODE_RULES["store-sale"];
    if (p.type !== rule.type) return false;
    if (rule.kind === "sale" && !p.sale) return false;
    if (rule.kind === "rent" && p.rents.length === 0) return false;
    return true;
  });

  return NextResponse.json(filtered);
}
