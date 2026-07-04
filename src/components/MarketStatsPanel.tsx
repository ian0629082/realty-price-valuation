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
  hideOnMobile?: boolean; // 手機版：試算全螢幕分頁開啟時隱藏，避免與試算面板疊在一起
}

// 依色階分級找出數值對應顏色（與地圖點位著色同一套 breaks/colors，供區域比較長條使用）
function colorForValue(value: number, scale: MetricScale): string {
  let tier = 0;
  while (tier < scale.breaks.length && value >= scale.breaks[tier]) tier++;
  return scale.colors[tier];
}

// 地圖角落浮動行情總覽：統計「目前畫面範圍」，並比較各區中位數
// 版面採「Data-Dense Dashboard」風格：緊湊 KPI 小卡＋長條比較，資訊密度高但層次分明
export default function MarketStatsPanel({
  visible,
  viewMode,
  scale,
  districtStats,
  alignRight,
  hideOnMobile,
}: Props) {
  const summary = summarize(visible, viewMode);
  const kind = scale.kind;
  const label = viewMode === "presale" ? "預售單價" : METRIC_LABEL[kind];
  const maxDistrictMedian = Math.max(0, ...districtStats.map((d) => d.median ?? 0));

  return (
    <div
      className={`${hideOnMobile ? "hidden sm:block" : ""} absolute bottom-4 left-4 right-4 sm:right-auto sm:w-64 ${
        alignRight ? "sm:left-auto sm:right-4" : "sm:left-4"
      } z-[1000] bg-white/95 shadow-lg rounded-xl border border-slate-200 p-3.5`}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="font-bold text-sm text-slate-900">{label}總覽</h3>
        <span className="text-[11px] text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
          畫面內 {summary?.count ?? 0} 筆
        </span>
      </div>

      {summary ? (
        <>
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {formatMetric(summary.median, kind).split(" ")[0]}
            </span>
            <span className="text-xs text-slate-500">
              {formatMetric(summary.median, kind).split(" ").slice(1).join(" ")}
            </span>
            <span className="text-[11px] text-slate-400">中位數</span>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            <div className="bg-slate-50 rounded-lg px-2 py-1.5">
              <p className="text-[10px] text-slate-500">常見區間（25–75%）</p>
              <p className="text-xs font-semibold text-slate-800 mt-0.5">
                {formatMetric(summary.p25, kind)} ~ {formatMetric(summary.p75, kind)}
              </p>
            </div>
            <div className="bg-slate-50 rounded-lg px-2 py-1.5">
              <p className="text-[10px] text-slate-500">全距</p>
              <p className="text-xs font-semibold text-slate-800 mt-0.5">
                {formatMetric(summary.min, kind)} ~ {formatMetric(summary.max, kind)}
              </p>
            </div>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-gray-500">此畫面範圍無資料，試著縮小地圖。</p>
      )}

      {/* 區域比較（多於一區時顯示，依整區計算）：長條圖取代純文字，一眼看出差異 */}
      {districtStats.length > 1 && (
        <div className="mt-3 pt-2.5 border-t border-slate-100">
          <p className="text-[11px] font-medium text-slate-500 mb-1.5">區域比較（中位數）</p>
          <div className="space-y-1.5">
            {districtStats.map((d) => (
              <div key={d.district} className="flex items-center gap-2">
                <span className="text-[11px] text-slate-600 w-10 shrink-0">{d.district}</span>
                <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  {d.median != null && (
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${maxDistrictMedian > 0 ? Math.max(6, (d.median / maxDistrictMedian) * 100) : 0}%`,
                        backgroundColor: colorForValue(d.median, scale),
                      }}
                    />
                  )}
                </div>
                <span className="text-[11px] font-medium text-slate-700 shrink-0">
                  {d.median != null ? formatMetric(d.median, kind) : "—"}
                  <span className="text-slate-400 font-normal">（{d.count}）</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 色階圖例（與地圖點位著色一致） */}
      <div className="mt-3 pt-2.5 border-t border-slate-100">
        <div className="flex h-3 rounded-full overflow-hidden">
          {scale.colors.map((c) => (
            <span key={c} className="flex-1" style={{ backgroundColor: c }} />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
          <span>{kind === "capRate" ? "高投報" : "便宜"}</span>
          <span>{kind === "capRate" ? "低投報" : "貴"}</span>
        </div>
      </div>
    </div>
  );
}
