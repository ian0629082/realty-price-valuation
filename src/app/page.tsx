"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Property } from "@/types/property";
import FilterPanel, { Filters } from "@/components/FilterPanel";
import MarketFilters from "@/components/MarketFilters";
import DetailCard from "@/components/DetailCard";
import MarketStatsPanel from "@/components/MarketStatsPanel";
import type { LocatedParcel } from "@/components/ParcelLocator";
import LandEvalPanel from "@/components/LandEvalPanel";
import {
  buildMetricScale,
  applyFilters,
  computeFilterBounds,
  withinBounds,
  districtSummaries,
  EMPTY_FILTERS,
  MarketFilters as MarketFiltersType,
  MapBounds,
} from "@/lib/price";

const PropertyMap = dynamic(() => import("@/components/PropertyMap"), { ssr: false });

const CITIES = ["台中市"];
const DISTRICTS: Record<string, string[]> = {
  台中市: ["南區", "大里區", "南屯區"],
};

export default function Home() {
  const [filters, setFilters] = useState<Filters>({
    city: "全部",
    district: "全部",
    viewMode: "store-sale",
  });
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Property | null>(null);
  const [marketFilters, setMarketFilters] = useState<MarketFiltersType>(EMPTY_FILTERS);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [located, setLocated] = useState<LocatedParcel | null>(null);
  // 右鍵反查的分區容積率（帶入試算）；nonce 讓重複點同一區也會觸發
  const [pickedZone, setPickedZone] = useState<{
    far: number | null;
    farEstimated?: boolean;
    useZone: string | null;
    lat: number;
    lng: number;
    nonce: number;
  } | null>(null);
  // 預售建案疊層（僅土地評估模式載入，供大樓圖示與 3km 售價比較）
  const [presale, setPresale] = useState<Property[]>([]);
  // 手機版：篩選側欄以抽屜形式顯示，預設收合
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  // 手機版：土地評估模式的「地圖／試算」分頁（避免試算面板與總覽面板疊在一起）
  const [mobileLandEvalView, setMobileLandEvalView] = useState<"map" | "eval">("map");
  // 切換縣市／區域時，地圖飛到該區域範圍（nonce 讓重複選同一區也會觸發）
  const [focusBounds, setFocusBounds] = useState<(MapBounds & { nonce: number }) | null>(null);
  const prevAreaRef = useRef({ city: filters.city, district: filters.district });

  useEffect(() => {
    const params = new URLSearchParams({
      city: filters.city,
      district: filters.district,
      viewMode: filters.viewMode,
    });
    setLoading(true);
    fetch(`/api/properties?${params}`)
      .then((r) => r.json())
      .then((data: Property[]) => {
        setProperties(data);
        const areaChanged =
          prevAreaRef.current.city !== filters.city || prevAreaRef.current.district !== filters.district;
        if (areaChanged && data.length > 0) {
          let north = -Infinity, south = Infinity, east = -Infinity, west = Infinity;
          for (const p of data) {
            if (p.lat > north) north = p.lat;
            if (p.lat < south) south = p.lat;
            if (p.lng > east) east = p.lng;
            if (p.lng < west) west = p.lng;
          }
          setFocusBounds({ north, south, east, west, nonce: Date.now() });
        }
        prevAreaRef.current = { city: filters.city, district: filters.district };
      })
      .finally(() => setLoading(false));
  }, [filters]);

  // 土地評估模式：載入全區預售建案（不限 district，供 3km 跨區比較與大樓圖示疊層）
  useEffect(() => {
    if (filters.viewMode !== "land-eval") {
      setPresale([]);
      return;
    }
    const params = new URLSearchParams({
      city: filters.city,
      district: "全部",
      viewMode: "presale",
    });
    fetch(`/api/properties?${params}`)
      .then((r) => r.json())
      // 排除透天/別墅：其單價（總價÷最小坪）灌高、非大樓開發可比對象
      .then((data: Property[]) =>
        setPresale(data.filter((p) => !/透天|別墅/.test(p.presale?.purpose ?? "")))
      )
      .catch(() => setPresale([]));
  }, [filters.viewMode, filters.city]);

  const districts = useMemo(() => {
    if (filters.city === "全部") return Object.values(DISTRICTS).flat();
    return DISTRICTS[filters.city] ?? [];
  }, [filters.city]);

  // 交易條件篩選（時間/單價/面積）後的物件
  const filtered = useMemo(
    () => applyFilters(properties, filters.viewMode, marketFilters),
    [properties, filters.viewMode, marketFilters]
  );

  // 篩選欄位可用範圍（滑桿上下限），依整批載入資料計算
  const filterBounds = useMemo(
    () => computeFilterBounds(properties, filters.viewMode),
    [properties, filters.viewMode]
  );

  // 行情色階：依「已篩選、整區」計算，故拖動地圖時點位顏色穩定
  const scale = useMemo(
    () => buildMetricScale(filtered, filters.viewMode),
    [filtered, filters.viewMode]
  );

  // 視野即時行情：面板統計只算目前畫面範圍內的物件
  const visible = useMemo(
    () => (bounds ? withinBounds(filtered, bounds) : filtered),
    [filtered, bounds]
  );

  // 區域比較：依整批已篩選資料，各區中位數
  const districtStats = useMemo(
    () => districtSummaries(filtered, filters.viewMode),
    [filtered, filters.viewMode]
  );

  return (
    <div className="flex h-dvh w-screen overflow-hidden">
      <FilterPanel
        cities={CITIES}
        districts={districts}
        filters={filters}
        mobileOpen={mobileFilterOpen}
        onMobileClose={() => setMobileFilterOpen(false)}
        onChange={(f) => {
          setSelected(null);
          setMarketFilters(EMPTY_FILTERS);
          if (f.viewMode !== "land-eval") setLocated(null); // 離開土地評估即清除定位圖釘
          if (f.viewMode !== filters.viewMode) {
            setMobileLandEvalView("map"); // 切換檢視模式時重置土地評估手機分頁
            // 手機版抽屜：切到土地評估才自動收合（該模式改用地圖／試算分頁操作）；
            // 其餘檢視模式維持展開，讓使用者可以接著往下選縣市／區域
            if (f.viewMode === "land-eval") setMobileFilterOpen(false);
          }
          setFilters(f);
        }}
      >
        {properties.length > 0 && (
          <MarketFilters
            viewMode={filters.viewMode}
            bounds={filterBounds}
            filters={marketFilters}
            onChange={setMarketFilters}
            onReset={() => setMarketFilters(EMPTY_FILTERS)}
          />
        )}
      </FilterPanel>
      <div className="relative flex-1">
        <button
          onClick={() => setMobileFilterOpen(true)}
          className="sm:hidden absolute top-4 right-4 z-[1000] bg-white shadow-lg rounded-xl border border-slate-200 w-10 h-10 flex items-center justify-center text-slate-700"
          aria-label="開啟篩選條件"
        >
          ☰
        </button>
        {/* 手機版：土地評估模式「地圖／試算」分頁切換，避免試算與總覽面板疊在一起 */}
        {filters.viewMode === "land-eval" && mobileLandEvalView === "map" && (
          <div className="sm:hidden absolute top-4 left-14 right-16 z-[1000] flex bg-white rounded-full shadow-lg border border-slate-200 p-1 gap-1">
            <button
              onClick={() => setMobileLandEvalView("map")}
              className="flex-1 text-xs font-medium py-1.5 rounded-full bg-blue-600 text-white"
            >
              🗺️ 地圖
            </button>
            <button
              onClick={() => setMobileLandEvalView("eval")}
              className="flex-1 text-xs font-medium py-1.5 rounded-full text-slate-600"
            >
              🧮 試算
            </button>
          </div>
        )}
        {loading && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1001] bg-white shadow px-3 py-1 rounded text-sm">
            載入中…
          </div>
        )}
        <PropertyMap
          properties={filtered}
          onSelect={setSelected}
          colorFor={scale.colorFor}
          onBoundsChange={setBounds}
          focusBounds={focusBounds}
          located={located}
          showCadastral={filters.viewMode === "land-eval"}
          onPickZone={
            filters.viewMode === "land-eval"
              ? (z) =>
                  setPickedZone({
                    far: z.zoneFAR,
                    farEstimated: z.zoneFAREstimated,
                    useZone: z.useZone,
                    lat: z.lat,
                    lng: z.lng,
                    nonce: Date.now(),
                  })
              : undefined
          }
          presale={filters.viewMode === "land-eval" ? presale : undefined}
        />
        {!loading && properties.length > 0 && (
          <MarketStatsPanel
            visible={visible}
            viewMode={filters.viewMode}
            scale={scale}
            districtStats={districtStats}
            alignRight={filters.viewMode === "land-eval"}
            hideOnMobile={filters.viewMode === "land-eval" && mobileLandEvalView === "eval"}
          />
        )}
        {filters.viewMode === "land-eval" && (
          <LandEvalPanel
            located={located}
            onLocate={setLocated}
            onClear={() => setLocated(null)}
            pickedZone={pickedZone}
            presale={presale}
            mobileFullScreen={mobileLandEvalView === "eval"}
            onMobileBack={() => setMobileLandEvalView("map")}
          />
        )}
        {selected && <DetailCard property={selected} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}
