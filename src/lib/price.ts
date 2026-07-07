import { Property } from "@/types/property";
import { estimateCapRate } from "./capRate";
import type { ViewMode } from "@/components/FilterPanel";

// 行情指標種類：買賣→單價(萬/坪)、租賃→月租(元)、投報率→毛投報率(%)
export type MetricKind = "unitPrice" | "rent" | "capRate";

const SALE_MODES: ViewMode[] = ["store-sale", "resi-sale", "land-sale"];
const RENT_MODES: ViewMode[] = ["store-rent", "resi-rent"];

export function metricKind(viewMode: ViewMode): MetricKind {
  if (viewMode === "cap-rate") return "capRate";
  if (RENT_MODES.includes(viewMode)) return "rent";
  return "unitPrice"; // 買賣、土地、預售屋皆以單價（萬/坪）為指標
}

// 買賣單價：成交總價(萬) / 成交面積(坪) = 萬/坪
export function saleUnitPrice(p: Property): number | null {
  if (!p.sale || !p.sale.buildingArea) return null;
  return p.sale.price / p.sale.buildingArea;
}

// 最新一筆月租(元)
export function latestMonthlyRent(p: Property): number | null {
  if (p.rents.length === 0) return null;
  return p.rents[p.rents.length - 1].monthlyRent ?? null;
}

// 依檢視模式取出該物件的行情指標數值
export function metricValue(p: Property, viewMode: ViewMode): number | null {
  switch (metricKind(viewMode)) {
    case "capRate":
      return estimateCapRate(p);
    case "rent":
      return latestMonthlyRent(p);
    default:
      // 預售屋用建案推估單價；其餘用成交單價
      return p.presale ? p.presale.unitPrice : saleUnitPrice(p);
  }
}

// 分位著色：便宜→貴（綠→紅）。投報率意義相反，高投報為佳，故反轉。
export const TIER_COLORS = ["#16a34a", "#84cc16", "#eab308", "#f97316", "#dc2626"];
const NO_DATA_COLOR = "#9ca3af";
export const SPECIAL_TRANSACTION_COLOR = "#a855f7"; // 特殊交易（親友/持分/畸零地等）：紫色，與其餘色階明顯區隔

// 買賣單價類指標且成交紀錄被政府備註標記為特殊交易時，價格可能不反映市場行情，
// 統計（中位數/色階分位）與地圖著色都應排除／另外標示，但地圖上仍會顯示該點本身
function isSpecialSaleTransaction(p: Property, viewMode: ViewMode): boolean {
  return metricKind(viewMode) === "unitPrice" && viewMode !== "presale" && !!p.sale?.isSpecialTransaction;
}

// 目前範圍內被排除在統計外的特殊交易筆數，供總覽面板附註說明
export function specialTransactionCount(properties: Property[], viewMode: ViewMode): number {
  return properties.filter((p) => isSpecialSaleTransaction(p, viewMode)).length;
}

function sortedValues(properties: Property[], viewMode: ViewMode): number[] {
  return properties
    .filter((p) => !isSpecialSaleTransaction(p, viewMode))
    .map((p) => metricValue(p, viewMode))
    .filter((v): v is number => v != null && v > 0)
    .sort((a, b) => a - b);
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
}

export interface MetricScale {
  kind: MetricKind;
  breaks: number[]; // 4 個分位界線，切成 5 級
  colors: string[]; // 由低到高對應的顏色（投報率已反轉）
  colorFor: (p: Property) => string;
}

// 依當前載入的物件動態計算分位色階，讓著色隨檢視/區域自動調整
export function buildMetricScale(properties: Property[], viewMode: ViewMode): MetricScale {
  const kind = metricKind(viewMode);
  const values = sortedValues(properties, viewMode);
  const breaks = [0.2, 0.4, 0.6, 0.8].map((q) => quantile(values, q));
  // 投報率高為佳 → 綠色代表高，故反轉色階
  const colors = kind === "capRate" ? [...TIER_COLORS].reverse() : TIER_COLORS;

  const colorFor = (p: Property): string => {
    if (isSpecialSaleTransaction(p, viewMode)) return SPECIAL_TRANSACTION_COLOR;
    const v = metricValue(p, viewMode);
    if (v == null || v <= 0 || Number.isNaN(breaks[0])) return NO_DATA_COLOR;
    let tier = 0;
    while (tier < breaks.length && v >= breaks[tier]) tier++;
    return colors[tier];
  };

  return { kind, breaks, colors, colorFor };
}

export interface MetricSummary {
  kind: MetricKind;
  count: number;
  median: number;
  mean: number;
  p25: number;
  p75: number;
  min: number;
  max: number;
}

export interface PresaleActualSummary {
  median: number; // 實價登錄成交均價中位數（萬 / 坪）
  count: number; // 有實登資料的建案數
}

// 預售屋「開價 vs 實價登錄」對比用：實登成交均價的中位數（僅計入查無實登為 null 以外的建案）
export function presaleActualSummary(properties: Property[]): PresaleActualSummary | null {
  const values = properties
    .map((p) => p.presale?.actualUnitPrice)
    .filter((v): v is number => v != null && v > 0)
    .sort((a, b) => a - b);
  if (values.length === 0) return null;
  return { median: quantile(values, 0.5), count: values.length };
}

export function summarize(properties: Property[], viewMode: ViewMode): MetricSummary | null {
  const values = sortedValues(properties, viewMode);
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    kind: metricKind(viewMode),
    count: values.length,
    median: quantile(values, 0.5),
    mean: sum / values.length,
    p25: quantile(values, 0.25),
    p75: quantile(values, 0.75),
    min: values[0],
    max: values[values.length - 1],
  };
}

// ── 顯示格式化 ──────────────────────────────────────────────────────────────
export function formatMetric(value: number, kind: MetricKind): string {
  switch (kind) {
    case "unitPrice":
      return `${value.toFixed(1)} 萬/坪`;
    case "rent":
      return `${Math.round(value).toLocaleString()} 元/月`;
    case "capRate":
      return `${value.toFixed(2)}%`;
  }
}

export const METRIC_LABEL: Record<MetricKind, string> = {
  unitPrice: "成交單價",
  rent: "月租行情",
  capRate: "毛投報率",
};

// ── 交易時間 ────────────────────────────────────────────────────────────────
// 依檢視模式取該物件的代表交易日期（YYYY-MM-DD）
export function transactionDate(p: Property, viewMode: ViewMode): string | null {
  if (metricKind(viewMode) === "rent") {
    return p.rents[p.rents.length - 1]?.leaseStart ?? null;
  }
  return p.sale?.date ?? null;
}

// ── 篩選 ────────────────────────────────────────────────────────────────────
export interface MarketFilters {
  dateFrom: string; // YYYY-MM，空字串代表不限
  dateTo: string;
  metricMin: number | null;
  metricMax: number | null;
  areaMin: number | null;
  areaMax: number | null;
}

export const EMPTY_FILTERS: MarketFilters = {
  dateFrom: "",
  dateTo: "",
  metricMin: null,
  metricMax: null,
  areaMin: null,
  areaMax: null,
};

// 各篩選欄位的可用範圍（給滑桿用），依當前資料與檢視模式動態計算
export interface FilterBounds {
  months: string[]; // 由小到大的 YYYY-MM 清單
  metricMin: number;
  metricMax: number;
  areaMin: number;
  areaMax: number;
}

export function computeFilterBounds(
  properties: Property[],
  viewMode: ViewMode
): FilterBounds {
  const months = new Set<string>();
  const metrics: number[] = [];
  const areas: number[] = [];
  for (const p of properties) {
    const d = transactionDate(p, viewMode);
    if (d) months.add(d.slice(0, 7));
    const m = metricValue(p, viewMode);
    if (m != null && m > 0) metrics.push(m);
    if (p.buildingArea > 0) areas.push(p.buildingArea);
  }
  metrics.sort((a, b) => a - b);
  areas.sort((a, b) => a - b);
  return {
    months: [...months].sort(),
    metricMin: metrics[0] ?? 0,
    metricMax: metrics[metrics.length - 1] ?? 0,
    areaMin: areas[0] ?? 0,
    areaMax: areas[areas.length - 1] ?? 0,
  };
}

export function applyFilters(
  properties: Property[],
  viewMode: ViewMode,
  f: MarketFilters
): Property[] {
  return properties.filter((p) => {
    if (f.dateFrom || f.dateTo) {
      const d = transactionDate(p, viewMode);
      const ym = d?.slice(0, 7) ?? "";
      if (f.dateFrom && ym < f.dateFrom) return false;
      if (f.dateTo && ym > f.dateTo) return false;
    }
    if (f.metricMin != null || f.metricMax != null) {
      const m = metricValue(p, viewMode);
      if (m == null) return false;
      if (f.metricMin != null && m < f.metricMin) return false;
      if (f.metricMax != null && m > f.metricMax) return false;
    }
    if (f.areaMin != null && p.buildingArea < f.areaMin) return false;
    if (f.areaMax != null && p.buildingArea > f.areaMax) return false;
    return true;
  });
}

// ── 視野範圍 ────────────────────────────────────────────────────────────────
export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export function withinBounds(properties: Property[], b: MapBounds): Property[] {
  return properties.filter(
    (p) =>
      p.lat <= b.north && p.lat >= b.south && p.lng <= b.east && p.lng >= b.west
  );
}

// ── 區域行情比較 ────────────────────────────────────────────────────────────
export interface DistrictStat {
  district: string;
  count: number;
  median: number | null;
}

export function districtSummaries(
  properties: Property[],
  viewMode: ViewMode
): DistrictStat[] {
  const byDistrict = new Map<string, Property[]>();
  for (const p of properties) {
    if (!byDistrict.has(p.district)) byDistrict.set(p.district, []);
    byDistrict.get(p.district)!.push(p);
  }
  return [...byDistrict.entries()]
    .map(([district, ps]) => {
      const s = summarize(ps, viewMode);
      return { district, count: s?.count ?? 0, median: s?.median ?? null };
    })
    .sort((a, b) => (b.median ?? 0) - (a.median ?? 0));
}

// 使用分區歸併成大類（住宅區／商業區／工業區／鄉村區／其他），避免「第一之三種住宅區」
// 這類細分法定分區各自成一條、樣本數過少而失去統計意義
function normalizeZoneCategory(useZone: string | undefined): string {
  if (!useZone) return "其他";
  if (useZone.includes("住宅")) return "住宅區";
  if (useZone.includes("商業")) return "商業區";
  if (useZone.includes("工業")) return "工業區";
  if (useZone.includes("鄉村")) return "鄉村區";
  return "其他";
}

export interface ZoneStat {
  zone: string;
  count: number;
  median: number | null;
}

// 分區行情比較（土地買賣成交專用）：使用分區對地價的影響通常比行政區更明顯
export function zoneSummaries(properties: Property[], viewMode: ViewMode): ZoneStat[] {
  const byZone = new Map<string, Property[]>();
  for (const p of properties) {
    const key = normalizeZoneCategory(p.useZone);
    if (!byZone.has(key)) byZone.set(key, []);
    byZone.get(key)!.push(p);
  }
  return [...byZone.entries()]
    .map(([zone, ps]) => {
      const s = summarize(ps, viewMode);
      return { zone, count: s?.count ?? 0, median: s?.median ?? null };
    })
    .sort((a, b) => (b.median ?? 0) - (a.median ?? 0));
}

// ── 距離與附近建案比較 ──────────────────────────────────────────────────────
// 兩點間球面距離（公里，Haversine）
export function distanceKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// 篩出參考點半徑內的物件（公里），供土地評估「只看預售屋／只看土地成交」的總覽統計使用
export function withinRadiusKm(
  properties: Property[],
  refLat: number,
  refLng: number,
  radiusKm: number
): Property[] {
  return properties.filter((p) => distanceKm(refLat, refLng, p.lat, p.lng) <= radiusKm);
}

export interface NearbyPresaleStats {
  count: number; // 半徑內有單價的建案數
  median: number; // 單價中位數（萬 / 坪）
  min: number;
  max: number;
}

export interface NearbyPresaleItem {
  buildName: string;
  unitPrice: number; // 萬 / 坪（591 開價推估）
  actualUnitPrice: number | null; // 萬 / 坪（實價登錄成交均價，依建案名對應，查無為 null）
  distanceKm: number;
}

// 參考點半徑內、有推估單價的預售建案清單（依距離近到遠排序），供使用者點開查看個別建案
export function nearbyPresaleList(
  presale: Property[],
  refLat: number,
  refLng: number,
  radiusKm: number
): NearbyPresaleItem[] {
  return presale
    .filter((p) => p.presale?.unitPrice != null)
    .map((p) => ({
      buildName: p.presale!.buildName,
      unitPrice: p.presale!.unitPrice as number,
      actualUnitPrice: p.presale!.actualUnitPrice ?? null,
      distanceKm: distanceKm(refLat, refLng, p.lat, p.lng),
    }))
    .filter((item) => item.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

// 參考點半徑內、有推估單價的預售建案單價統計（萬 / 坪）
export function nearbyPresaleStats(
  presale: Property[],
  refLat: number,
  refLng: number,
  radiusKm: number
): NearbyPresaleStats | null {
  const prices = presale
    .filter(
      (p) =>
        p.presale?.unitPrice != null &&
        distanceKm(refLat, refLng, p.lat, p.lng) <= radiusKm
    )
    .map((p) => p.presale!.unitPrice as number)
    .sort((a, b) => a - b);
  if (prices.length === 0) return null;
  const mid = Math.floor(prices.length / 2);
  const median =
    prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];
  return { count: prices.length, median, min: prices[0], max: prices[prices.length - 1] };
}

// ── 土地價格評估（見 land_price_evaluation.md）──────────────────────────────
// 容積率沿用專案既有欄位 `Property.zoneFAR`（來源：都市計畫分區 KML）。
// 資料中維持原始數值，例如 300 代表 300%；只有在計算公式中才會 / 100。
// 為避免同一資料出現多個變數名稱，一律以 `zoneFAR` 稱之，不另建 far / floorAreaRatio。

// 固定參數（集中管理，未來可改為可調欄位）
export const EXEMPT_FLOOR_AREA_MULTIPLIER = 1.3; // 免計容積倍率
export const CONSTRUCTION_COST_PER_PING = 20; // 建物興建成本（萬 / 坪）
export const MANAGEMENT_SALES_MULTIPLIER = 1.15; // 管銷倍率
export const PROFIT_MULTIPLIER = 1.2; // 利潤倍率

export interface LandPriceResult {
  totalFloorArea: number; // 總容積（坪）
  landMultiplier: number; // 土地倍數（倍）
  landCostPerBuildingPing: number; // 土地單坪價（萬 / 坪）
  constructionTotalCost: number; // 營造成本（萬 / 坪）
  managementCost: number; // 管銷費用（萬 / 坪）
  profit: number; // 預設利潤（萬 / 坪）
  estimatedSalePricePerPing: number; // 預計售價單坪價（萬 / 坪）
}

/**
 * 土地價格評估計算。回傳值為全精度，顯示時再四捨五入到 2 位。
 * @param landArea          土地坪數（坪，允許小數，須 > 0）
 * @param landPricePerPing  土地買價（萬 / 坪，允許小數，須 > 0）
 * @param zoneFAR           既有容積率欄位（原始數值，300 代表 300%，須 > 0）
 */
export function calculateLandPrice(
  landArea: number,
  landPricePerPing: number,
  zoneFAR: number
): LandPriceResult {
  // 總容積 = 土地坪數 × (容積率 / 100) × 免計容積倍率
  const totalFloorArea = landArea * (zoneFAR / 100) * EXEMPT_FLOOR_AREA_MULTIPLIER;
  // 土地倍數 = 總容積 / 土地坪數
  const landMultiplier = totalFloorArea / landArea;
  // 土地單坪價 = 土地買價 / 土地倍數
  const landCostPerBuildingPing = landPricePerPing / landMultiplier;
  // 營造成本 = 建物興建成本 + 土地單坪價
  const constructionTotalCost = CONSTRUCTION_COST_PER_PING + landCostPerBuildingPing;
  // 管銷費用 = 營造成本 × (管銷倍率 - 1)
  const managementCost = constructionTotalCost * (MANAGEMENT_SALES_MULTIPLIER - 1);
  // 預設利潤 = (營造成本 + 管銷費用) × (利潤倍率 - 1)
  const profit = (constructionTotalCost + managementCost) * (PROFIT_MULTIPLIER - 1);
  // 預計售價單坪價 = 營造成本 + 管銷費用 + 預設利潤
  const estimatedSalePricePerPing = constructionTotalCost + managementCost + profit;

  return {
    totalFloorArea,
    landMultiplier,
    landCostPerBuildingPing,
    constructionTotalCost,
    managementCost,
    profit,
    estimatedSalePricePerPing,
  };
}
