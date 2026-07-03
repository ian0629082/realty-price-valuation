"use client";

import { useEffect, useMemo, useState } from "react";
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
    useZone: string | null;
    lat: number;
    lng: number;
    nonce: number;
  } | null>(null);
  // 預售建案疊層（僅土地評估模式載入，供大樓圖示與 3km 售價比較）
  const [presale, setPresale] = useState<Property[]>([]);

  useEffect(() => {
    const params = new URLSearchParams({
      city: filters.city,
      district: filters.district,
      viewMode: filters.viewMode,
    });
    setLoading(true);
    fetch(`/api/properties?${params}`)
      .then((r) => r.json())
      .then((data) => setProperties(data))
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
    <div className="flex h-screen w-screen">
      <FilterPanel
        cities={CITIES}
        districts={districts}
        filters={filters}
        onChange={(f) => {
          setSelected(null);
          setMarketFilters(EMPTY_FILTERS);
          if (f.viewMode !== "land-eval") setLocated(null); // 離開土地評估即清除定位圖釘
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
          located={located}
          showCadastral={filters.viewMode === "land-eval"}
          onPickZone={
            filters.viewMode === "land-eval"
              ? (z) =>
                  setPickedZone({
                    far: z.zoneFAR,
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
          />
        )}
        {filters.viewMode === "land-eval" && (
          <LandEvalPanel
            located={located}
            onLocate={setLocated}
            onClear={() => setLocated(null)}
            pickedZone={pickedZone}
            presale={presale}
          />
        )}
        {selected && <DetailCard property={selected} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}
