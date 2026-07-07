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
  mobileOpen?: boolean; // 手機版：是否展開為滑入式抽屜
  onMobileClose?: () => void;
}

const VIEW_MODES: { key: ViewMode; label: string; icon: string }[] = [
  { key: "store-sale", label: "店面買賣成交", icon: "🏬" },
  { key: "resi-sale", label: "住宅買賣成交", icon: "🏠" },
  { key: "store-rent", label: "店面租賃成交", icon: "🗝️" },
  { key: "resi-rent", label: "住宅租賃成交", icon: "🔑" },
  { key: "land-sale", label: "土地買賣成交", icon: "🏞️" },
  { key: "cap-rate", label: "買賣投報率", icon: "📈" },
  { key: "presale", label: "預售屋", icon: "🏗️" },
  { key: "land-eval", label: "土地評估", icon: "🧮" },
];

const SELECT_CLS =
  "w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-white";

export default function FilterPanel({
  cities,
  districts,
  filters,
  onChange,
  locator,
  children,
  mobileOpen,
  onMobileClose,
}: Props) {
  return (
    <>
      {/* 手機版遮罩：點擊收合抽屜 */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-[1001] sm:hidden"
          onClick={onMobileClose}
        />
      )}
      <div
        className={`fixed sm:static inset-y-0 left-0 z-[1002] sm:z-auto w-72 max-w-[85vw] sm:w-64 sm:max-w-none shrink-0 bg-indigo-100/60 border-r border-indigo-200 p-4 space-y-4 overflow-y-auto transition-transform duration-200 sm:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg text-slate-900">篩選條件</h2>
          <button
            onClick={onMobileClose}
            className="sm:hidden text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-full w-8 h-8 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

      {/* 檢視模式 */}
      <div className="bg-slate-50 rounded-xl p-3">
        <label className="block text-xs font-medium text-slate-500 mb-2">檢視模式</label>
        <div className="flex flex-col gap-1">
          {VIEW_MODES.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => onChange({ ...filters, viewMode: key })}
              className={`w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-lg text-sm font-medium border transition-all active:scale-95 ${
                filters.viewMode === key
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
              }`}
            >
              <span className="text-base leading-none">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 地號定位 */}
      {locator}

      {/* 縣市／區域 */}
      <div className="bg-slate-50 rounded-xl p-3 space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">縣市</label>
          <select
            className={SELECT_CLS}
            value={filters.city}
            onChange={(e) => onChange({ ...filters, city: e.target.value, district: "全部" })}
          >
            <option value="全部">全部</option>
            {cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">區域</label>
          <select
            className={SELECT_CLS}
            value={filters.district}
            onChange={(e) => onChange({ ...filters, district: e.target.value })}
          >
            <option value="全部">全部</option>
            {districts.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 圖例 */}
      <div className="bg-slate-50 rounded-xl p-3">
        <p className="text-xs font-medium text-slate-500 mb-2">點位著色</p>
        <div className="flex h-3 rounded-full overflow-hidden">
          {["#16a34a", "#84cc16", "#eab308", "#f97316", "#dc2626"].map((c) => (
            <span key={c} className="flex-1" style={{ backgroundColor: c }} />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
          <span>{filters.viewMode === "cap-rate" ? "高投報" : "便宜"}</span>
          <span>{filters.viewMode === "cap-rate" ? "低投報" : "貴"}</span>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          依當前檢視的行情指標分位著色，詳見地圖左下角總覽。
        </p>
      </div>

        {children}
      </div>
    </>
  );
}
