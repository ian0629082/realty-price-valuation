"use client";

import { Property } from "@/types/property";
import { ViewMode } from "@/components/FilterPanel";
import {
  MetricScale,
  DistrictStat,
  summarize,
  formatMetric,
  METRIC_LABEL,
} from "@/lib/price";

interface Props {
  visible: Property[]; // 目前畫面範圍內（且已套用篩選）的物件
  viewMode: ViewMode;
  scale: MetricScale; // 與地圖點位一致的色階（依整區計算，拖動時不跳動）
  districtStats: DistrictStat[];
  alignRight?: boolean; // 靠右下角顯示（土地評估模式，避免與左上試算面板重疊）
}

// 地圖角落浮動行情總覽：統計「目前畫面範圍」，並比較各區中位數
export default function MarketStatsPanel({
  visible,
  viewMode,
  scale,
  districtStats,
  alignRight,
}: Props) {
  const summary = summarize(visible, viewMode);
  const kind = scale.kind;
  const label = viewMode === "presale" ? "預售單價" : METRIC_LABEL[kind];

  return (
    <div
      className={`absolute bottom-4 ${alignRight ? "right-4" : "left-4"} z-[1000] bg-white/95 shadow-lg rounded-lg p-4 w-64`}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="font-bold text-sm">{label}總覽</h3>
        <span className="text-xs text-gray-500">
          畫面內 {summary?.count ?? 0} 筆
        </span>
      </div>

      {summary ? (
        <>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-bold text-gray-900">
              {formatMetric(summary.median, kind).split(" ")[0]}
            </span>
            <span className="text-xs text-gray-600">
              {formatMetric(summary.median, kind).split(" ").slice(1).join(" ")} 中位數
            </span>
          </div>

          <div className="mt-1 text-xs text-gray-600 space-y-0.5">
            <div>
              常見區間（25%–75%）：{formatMetric(summary.p25, kind)} ~ {formatMetric(summary.p75, kind)}
            </div>
            <div>
              全距：{formatMetric(summary.min, kind)} ~ {formatMetric(summary.max, kind)}
            </div>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-gray-500">此畫面範圍無資料，試著縮小地圖。</p>
      )}

      {/* 區域比較（多於一區時顯示，依整區計算） */}
      {districtStats.length > 1 && (
        <div className="mt-3 pt-2 border-t">
          <p className="text-xs font-medium text-gray-600 mb-1">區域比較（中位數）</p>
          {districtStats.map((d) => (
            <div key={d.district} className="flex justify-between text-xs text-gray-700">
              <span>{d.district}</span>
              <span className="font-medium">
                {d.median != null ? formatMetric(d.median, kind) : "—"}
                <span className="text-gray-400 font-normal">（{d.count}）</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 色階圖例（與地圖點位著色一致） */}
      <div className="mt-3 pt-2 border-t">
        <div className="flex h-3 rounded overflow-hidden">
          {scale.colors.map((c) => (
            <span key={c} className="flex-1" style={{ backgroundColor: c }} />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
          <span>{kind === "capRate" ? "高投報" : "便宜"}</span>
          <span>{kind === "capRate" ? "低投報" : "貴"}</span>
        </div>
      </div>
    </div>
  );
}
