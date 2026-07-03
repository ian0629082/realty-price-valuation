import fs from "node:fs";
import path from "node:path";
import { OUTPUT_FILE, UI_OUTPUT_FILE, DISTRICT_BOUNDS } from "./config.mjs";

const CACHE_FILE = "data/geocode-cache.json";

function loadGeocodeCache() {
  if (!fs.existsSync(CACHE_FILE)) return {};
  return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
}

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function hashToInt(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) % 1000000007;
  }
  return h;
}

function fakeCoordinate(address, district) {
  const bounds = DISTRICT_BOUNDS[district];
  const rand = seededRandom(hashToInt(address));
  return {
    lat: bounds.latMin + rand() * (bounds.latMax - bounds.latMin),
    lng: bounds.lngMin + rand() * (bounds.lngMax - bounds.lngMin),
  };
}

const SQM_TO_PIN = 3.30579; // 1坪 = 3.30579 m²

// 非都市土地建蔽率/容積率法定表（《非都市土地使用管制規則》§9，依「使用地類別」）
// 都市計畫分區的容積率在 KML；非都市土地（如鄉村區）KML 無值，改依編定套此法定表。
// 農牧/林業/生態保護等用地法條未直接訂定（另訂），故不列，維持 null。
const STATUTORY_ZONE_BY_DESIGNATION = {
  甲種建築用地: { coverage: 60, far: 240 },
  乙種建築用地: { coverage: 60, far: 240 },
  丙種建築用地: { coverage: 40, far: 120 },
  丁種建築用地: { coverage: 70, far: 300 },
  窯業用地: { coverage: 60, far: 120 },
  交通用地: { coverage: 40, far: 120 },
  遊憩用地: { coverage: 40, far: 120 },
  殯葬用地: { coverage: 40, far: 120 },
  特定目的事業用地: { coverage: 60, far: 180 },
};

// 從地圖排除的分區（圈圈與資料卡皆不顯示），分兩類：
//   1. 公共設施/非建築性分區：無私人開發價值
//   2. 使用者指定排除：農業區類、機關用地、山坡地保育區（評估參考性低）
// 保留：鄉村區、住宅區、商業區、工業區等可建築分區。
const EXCLUDED_ZONE_RE =
  /道路用地|市場用地|公園用地|綠地|園道|兒童遊樂場|廣場|停車場|排水|河川|河道|行水|鐵路|高速公路|電路鐵塔|人行|兼供道路|兼作園道|農業區|機關用地|山坡地保育區/;

function isNonBuildableZone(useZone) {
  return !!useZone && EXCLUDED_ZONE_RE.test(useZone);
}

const USE_ZONE_MAP = {
  // 都市土地使用分區（col[4]）
  住: "住宅區",
  商: "商業區",
  工: "工業區",
  農: "農業區",
  保: "保護區",
  // 非都市土地使用分區（col[5]）
  特定農業區: "特定農業區",
  一般農業區: "一般農業區",
  鄉村區: "鄉村區",
  工業區: "工業區",
  森林區: "森林區",
  山坡地保育區: "山坡地保育區",
  風景區: "風景區",
  國家公園區: "國家公園區",
  // 非都市土地使用編定（col[6]）
  農牧用地: "農牧用地",
  林業用地: "林業用地",
  養殖用地: "養殖用地",
  鹽業用地: "鹽業用地",
  礦業用地: "礦業用地",
  水利用地: "水利用地",
  交通用地: "交通用地",
  乙種建築用地: "乙種建築用地",
  丙種建築用地: "丙種建築用地",
  丁種建築用地: "丁種建築用地",
  遊憩用地: "遊憩用地",
  生態保護用地: "生態保護用地",
  國土保安用地: "國土保安用地",
  殯葬用地: "殯葬用地",
};

function normalizeUseZone(raw) {
  if (!raw) return "";
  // 「都市：其他:道路用地」→「道路用地」
  const otherMatch = raw.match(/都市：其他:(.*)/);
  if (otherMatch) return otherMatch[1].trim() || "其他";
  return USE_ZONE_MAP[raw.trim()] ?? raw.trim();
}

function sqmToPin(sqm) {
  return Math.round((sqm / SQM_TO_PIN) * 10) / 10;
}

function pickLatestSale(sales, propertyType) {
  if (sales.length === 0) return undefined;
  const latest = [...sales].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const areaSqm = propertyType === "土地" ? latest.landAreaSqm : latest.buildingAreaSqm;
  return {
    price: Math.round(latest.totalPriceNTD / 10000), // 元 -> 萬元
    date: latest.date,
    transactionType: latest.transactionType,
    buildingArea: sqmToPin(areaSqm), // 坪
    useZone: normalizeUseZone(latest.useZone),
    useDesignation: normalizeUseZone(latest.useDesignation),
  };
}

function toUiProperty(raw, index, geocodeCache) {
  const cached = geocodeCache[raw.address];
  const hasRealCoord = cached?.status === "ok" && cached.lat && cached.lng;
  const { lat, lng } = hasRealCoord
    ? { lat: cached.lat, lng: cached.lng }
    : fakeCoordinate(raw.address, raw.district);
  const sale = pickLatestSale(raw.sales, raw.type);
  const buildingArea = sale?.buildingArea || sqmToPin(raw.rents[0]?.buildingArea || 0);

  const useDesignation = normalizeUseZone(sale?.useDesignation);
  // 建蔽率/容積率（%）：優先都市計畫分區 KML（raw.detailedZone 疊合者）；
  // 非都市土地（KML 無此分區）則依「使用地類別」套非都市法定表。
  let zoneCoverage = raw.zoneCoverage ?? null;
  let zoneFAR = raw.zoneFAR ?? null;
  let zoneSource = raw.detailedZone ? "都市計畫" : null;
  if (!raw.detailedZone && zoneFAR == null && STATUTORY_ZONE_BY_DESIGNATION[useDesignation]) {
    const s = STATUTORY_ZONE_BY_DESIGNATION[useDesignation];
    zoneCoverage = s.coverage;
    zoneFAR = s.far;
    zoneSource = "非都市法定";
  }

  return {
    id: `real-${index}`,
    address: raw.address,
    type: raw.type,
    city: "台中市",
    district: raw.district,
    lat,
    lng,
    // 臨路寬/分隔島由 enrich-road.mjs 以 OSM 推估寫入 raw；無資料則留空
    roadWidth: raw.roadWidth ?? null,
    hasMedian: raw.hasMedian ?? false,
    roadName: raw.roadName,
    roadWidthSource: raw.roadWidthSource ?? "none",
    buildingArea,
    useZone: raw.detailedZone || normalizeUseZone(sale?.useZone),
    useDesignation,
    // 建蔽率/容積率（%）：都市計畫 KML 或非都市法定表
    zoneCoverage,
    zoneFAR,
    zoneSource, // "都市計畫" | "非都市法定" | null
    sale,
    rents: raw.rents.map((r) => ({
      monthlyRent: r.monthlyRent,
      floor: r.floor,
      leaseStart: r.leaseStart,
      leaseEnd: r.leaseEnd,
      note: r.note,
    })),
    businesses: raw.businesses || [], // 財政部稅籍登記商號
    businessCount: raw.businessCount || 0,
  };
}

function main() {
  const raw = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8"));
  const geocodeCache = loadGeocodeCache();
  const realCoordCount = raw.filter(p => geocodeCache[p.address]?.status === "ok").length;
  console.log(`座標來源：真實 ${realCoordCount} 筆，假座標 ${raw.length - realCoordCount} 筆`);
  const mapped = raw.map((p, i) => toUiProperty(p, i, geocodeCache));

  // 排除公共設施/非建築性分區，並統計被移除的分區明細
  const removedByZone = {};
  const uiProperties = mapped.filter((p) => {
    if (isNonBuildableZone(p.useZone)) {
      removedByZone[p.useZone] = (removedByZone[p.useZone] || 0) + 1;
      return false;
    }
    return true;
  });
  const removedTotal = mapped.length - uiProperties.length;
  console.log(`已排除公共設施/非建築性分區：${removedTotal} 筆`);
  for (const [z, c] of Object.entries(removedByZone).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${z}：${c}`);
  }

  fs.mkdirSync(path.dirname(UI_OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(UI_OUTPUT_FILE, JSON.stringify(uiProperties, null, 2), "utf-8");
  console.log(`已輸出 ${uiProperties.length} 筆物件至 ${UI_OUTPUT_FILE}`);
}

main();
