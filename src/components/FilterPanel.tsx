"use client";

export type ViewMode =
  | "store-sale"
  | "resi-sale"
  | "store-rent"
  | "resi-rent"
  | "land-sale"
  | "cap-rate"
  | "presale"
  | "land-eval";

export interface Filters {
  city: string;
  district: string;
  viewMode: ViewMode;
}

interface Props {
  cities: string[];
  districts: string[];
  filters: Filters;
  onChange: (filters: Filters) => void;
  locator?: React.ReactNode; // 地號定位（顯示於檢視模式與縣市之間）
  children?: React.ReactNode;
}

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: "store-sale", label: "店面買賣成交" },
  { key: "resi-sale", label: "住宅買賣成交" },
  { key: "store-rent", label: "店面租賃成交" },
  { key: "resi-rent", label: "住宅租賃成交" },
  { key: "land-sale", label: "土地買賣成交" },
  { key: "cap-rate", label: "買賣投報率" },
  { key: "presale", label: "預售屋" },
  { key: "land-eval", label: "土地評估" },
];

export default function FilterPanel({ cities, districts, filters, onChange, locator, children }: Props) {
  return (
    <div className="w-64 shrink-0 bg-white border-r p-4 space-y-5 overflow-y-auto">
      <h2 className="font-bold text-lg">篩選條件</h2>

      {/* 檢視模式 */}
      <div>
        <label className="block text-sm font-medium mb-2">檢視模式</label>
        <div className="flex flex-col gap-1">
          {VIEW_MODES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onChange({ ...filters, viewMode: key })}
              className={`w-full text-left px-3 py-2 rounded text-sm font-medium border transition-colors ${
                filters.viewMode === key
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-800 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 地號定位 */}
      {locator}

      {/* 縣市 */}
      <div>
        <label className="block text-sm font-medium mb-1">縣市</label>
        <select
          className="w-full border rounded px-2 py-1 text-sm"
          value={filters.city}
          onChange={(e) => onChange({ ...filters, city: e.target.value, district: "全部" })}
        >
          <option value="全部">全部</option>
          {cities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* 區域 */}
      <div>
        <label className="block text-sm font-medium mb-1">區域</label>
        <select
          className="w-full border rounded px-2 py-1 text-sm"
          value={filters.district}
          onChange={(e) => onChange({ ...filters, district: e.target.value })}
        >
          <option value="全部">全部</option>
          {districts.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      {/* 圖例 */}
      <div className="pt-2 border-t">
        <p className="text-xs font-medium text-gray-600 mb-2">點位著色</p>
        <div className="flex h-3 rounded overflow-hidden">
          {["#16a34a", "#84cc16", "#eab308", "#f97316", "#dc2626"].map((c) => (
            <span key={c} className="flex-1" style={{ backgroundColor: c }} />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
          <span>{filters.viewMode === "cap-rate" ? "高投報" : "便宜"}</span>
          <span>{filters.viewMode === "cap-rate" ? "低投報" : "貴"}</span>
        </div>
        <p className="text-[10px] text-gray-400 mt-1">
          依當前檢視的行情指標分位著色，詳見地圖左下角總覽。
        </p>
      </div>

      {children}
    </div>
  );
}
