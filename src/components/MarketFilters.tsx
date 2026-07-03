"use client";

import { ViewMode } from "@/components/FilterPanel";
import MonthField from "@/components/MonthField";
import {
  MarketFilters as Filters,
  FilterBounds,
  metricKind,
  METRIC_LABEL,
  MetricKind,
} from "@/lib/price";

interface Props {
  viewMode: ViewMode;
  bounds: FilterBounds;
  filters: Filters;
  onChange: (f: Filters) => void;
  onReset: () => void;
}

const METRIC_UNIT: Record<MetricKind, string> = {
  unitPrice: "萬/坪",
  rent: "元",
  capRate: "%",
};

// 數字填空區間：兩個輸入框，空白代表不限
function NumberRange({
  label,
  unit,
  hintMin,
  hintMax,
  valueMin,
  valueMax,
  onChange,
}: {
  label: string;
  unit: string;
  hintMin: number;
  hintMax: number;
  valueMin: number | null;
  valueMax: number | null;
  onChange: (min: number | null, max: number | null) => void;
}) {
  const parse = (v: string): number | null =>
    v.trim() === "" ? null : Number(v);

  const inputCls =
    "w-full border border-slate-300 rounded-lg px-2 py-1 text-sm text-right bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">
        {label}
        <span className="ml-1 text-slate-400 font-normal">（{unit}）</span>
      </label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          className={inputCls}
          placeholder={String(Math.floor(hintMin))}
          value={valueMin ?? ""}
          onChange={(e) => onChange(parse(e.target.value), valueMax)}
        />
        <span className="text-slate-400 shrink-0">~</span>
        <input
          type="number"
          className={inputCls}
          placeholder={String(Math.ceil(hintMax))}
          value={valueMax ?? ""}
          onChange={(e) => onChange(valueMin, parse(e.target.value))}
        />
      </div>
    </div>
  );
}

export default function MarketFilters({
  viewMode,
  bounds,
  filters,
  onChange,
  onReset,
}: Props) {
  const kind = metricKind(viewMode);
  const { months } = bounds;

  const active =
    !!filters.dateFrom ||
    !!filters.dateTo ||
    filters.metricMin != null ||
    filters.metricMax != null ||
    filters.areaMin != null ||
    filters.areaMax != null;

  return (
    <div className="bg-slate-50 rounded-xl p-3 space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-xs font-medium text-slate-500">交易條件篩選</p>
        {active && (
          <button onClick={onReset} className="text-xs text-blue-600 hover:underline">
            重置
          </button>
        )}
      </div>

      {/* 交易時間：自製月份選擇器（起～迄），限制在資料實際期間內，留空＝不限 */}
      {months.length > 1 && (
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">交易時間</label>
          <div className="space-y-1.5">
            <MonthField
              value={filters.dateFrom}
              min={months[0]}
              max={months[months.length - 1]}
              placeholder="起始月（不限）"
              onChange={(v) => onChange({ ...filters, dateFrom: v })}
            />
            <MonthField
              value={filters.dateTo}
              min={months[0]}
              max={months[months.length - 1]}
              placeholder="結束月（不限）"
              onChange={(v) => onChange({ ...filters, dateTo: v })}
            />
          </div>
        </div>
      )}

      {/* 單價/月租/投報率：填空區間 */}
      {bounds.metricMax > bounds.metricMin && (
        <NumberRange
          label={METRIC_LABEL[kind]}
          unit={METRIC_UNIT[kind]}
          hintMin={bounds.metricMin}
          hintMax={bounds.metricMax}
          valueMin={filters.metricMin}
          valueMax={filters.metricMax}
          onChange={(lo, hi) => onChange({ ...filters, metricMin: lo, metricMax: hi })}
        />
      )}

      {/* 面積：填空區間（買賣模式才顯示） */}
      {kind === "unitPrice" && bounds.areaMax > bounds.areaMin && (
        <NumberRange
          label={viewMode === "land-sale" ? "土地面積" : "建物面積"}
          unit="坪"
          hintMin={bounds.areaMin}
          hintMax={bounds.areaMax}
          valueMin={filters.areaMin}
          valueMax={filters.areaMax}
          onChange={(lo, hi) => onChange({ ...filters, areaMin: lo, areaMax: hi })}
        />
      )}
    </div>
  );
}
