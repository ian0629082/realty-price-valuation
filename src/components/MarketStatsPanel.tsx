"use client";

import { Property } from "@/types/property";
import { ViewMode } from "@/components/FilterPanel";
import {
  MetricScale,
  DistrictStat,
  ZoneStat,
  summarize,
  presaleActualSummary,
  specialTransactionCount,
  formatMetric,
  METRIC_LABEL,
} from "@/lib/price";

interface Props {
  visible: Property[]; // 目前畫面範圍內（且已套用篩選）的物件；土地評估「只看…」模式下改傳半徑內物件
  viewMode: ViewMode;
  scale: MetricScale; // 與地圖點位一致的色階（依整區計算，拖動時不跳動）
  districtStats: DistrictStat[];
  zoneStats?: ZoneStat[] | null; // 土地買賣成交專用：有值時取代區域比較，改依使用分區（住宅/商業/工業…）比較
  alignRight?: boolean; // 靠右下角顯示（土地評估模式，避免與左上試算面板重疊）
  hideOnMobile?: boolean; // 手機版：試算全螢幕分頁開啟時隱藏，避免與試算面板疊在一起
  radiusLabel?: string; // 有值時取代「畫面內」文字（如「2km內」），代表 visible 已改為半徑篩選
  hideDistrictCompare?: boolean; // 半徑模式下範圍通常只落在一兩個行政區，區域比較意義不大，可隱藏
  hideColorLegend?: boolean; // 只看預售屋時地圖改用大樓圖示、無色階點位，色階圖例可隱藏
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
  zoneStats,
  alignRight,
  hideOnMobile,
  radiusLabel,
  hideDistrictCompare,
  hideColorLegend,
}: Props) {
  const summary = summarize(visible, viewMode);
  const kind = scale.kind;
  // 土地相關檢視模式明確標示「土地」，避免與預售屋切換時混淆（兩者都用同一個色階/總覽卡樣式）
  const label =
    viewMode === "presale"
      ? "預售單價"
      : viewMode === "land-sale" || viewMode === "land-eval"
        ? "土地成交單價"
        : METRIC_LABEL[kind];
  // 開價 vs 實價登錄成交均價對比（僅預售屋模式）：呼應地圖大樓圖示的深藍／橘色配色
  const actualSummary = viewMode === "presale" ? presaleActualSummary(visible) : null;
  // 土地買賣成交有 zoneStats 時，改用分區比較取代區域比較（使用分區對地價影響通常比行政區明顯）
  const compareRows = zoneStats
    ? zoneStats.map((z) => ({ key: z.zone, label: z.zone, count: z.count, median: z.median }))
    : districtStats.map((d) => ({ key: d.district, label: d.district, count: d.count, median: d.median }));
  const compareTitle = zoneStats ? "分區比較（中位數）" : "區域比較（中位數）";
  const maxCompareMedian = Math.max(0, ...compareRows.map((d) => d.median ?? 0));
  // 親友/持分/畸零地等特殊交易：地圖上仍會顯示（紫色標示），但不列入統計，此處附註排除筆數
  const excludedCount = specialTransactionCount(visible, viewMode);

  return (
    <div
      className={`${hideOnMobile ? "hidden sm:block" : ""} absolute bottom-4 left-4 right-4 sm:w-64 ${
        alignRight ? "sm:left-auto sm:right-4" : "sm:right-auto sm:left-4"
      } z-[1000] bg-gradient-to-b from-white to-slate-100 rounded-2xl border-2 border-slate-300 p-3.5`}
      style={{
        boxShadow: "inset 0 2px 4px rgba(255,255,255,.9), 0 4px 12px rgba(0,0,0,.15)",
      }}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="font-bold text-sm text-slate-900">{label}總覽</h3>
        <span className="text-[11px] text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
          {radiusLabel ?? "畫面內"} {summary?.count ?? 0} 筆
        </span>
      </div>
      {excludedCount > 0 && (
        <p className="mt-0.5 text-[10px] text-purple-600">
          不含 {excludedCount} 筆特殊交易（親友/持分/畸零地等，地圖上以紫色標示，僅供參考）
        </p>
      )}

      {summary ? (
        <>
          {viewMode === "presale" ? (
            <div className="mt-2.5 flex items-end gap-4">
              <div>
                <div className="flex items-baseline gap-1">
                  <span
                    className="text-2xl font-extrabold tracking-tight"
                    style={{ color: "#1e3a5f" }}
                  >
                    {formatMetric(summary.median, kind).split(" ")[0]}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {formatMetric(summary.median, kind).split(" ").slice(1).join(" ")}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">開價中位數</p>
              </div>
              {actualSummary && (
                <div>
                  <div className="flex items-baseline gap-1">
                    <span
                      className="text-2xl font-extrabold tracking-tight"
                      style={{ color: "#b45309" }}
                    >
                      {formatMetric(actualSummary.median, kind).split(" ")[0]}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {formatMetric(actualSummary.median, kind).split(" ").slice(1).join(" ")}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    實登中位數（{actualSummary.count} 筆）
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-2.5 flex items-baseline gap-1.5">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                {formatMetric(summary.median, kind).split(" ")[0]}
              </span>
              <span className="text-xs text-slate-500">
                {formatMetric(summary.median, kind).split(" ").slice(1).join(" ")}
              </span>
              <span className="text-[11px] text-slate-400">中位數</span>
            </div>
          )}

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
        <p className="mt-2 text-sm text-gray-500">
          {radiusLabel ? `${radiusLabel}無資料` : "此畫面範圍無資料，試著縮小地圖。"}
        </p>
      )}

      {/* 區域／分區比較（多於一組時顯示）：長條圖取代純文字，一眼看出差異 */}
      {!hideDistrictCompare && compareRows.length > 1 && (
        <div className="mt-3 pt-2.5 border-t border-slate-100">
          <p className="text-[11px] font-medium text-slate-500 mb-1.5">{compareTitle}</p>
          <div className="space-y-1.5">
            {compareRows.map((d) => (
              <div key={d.key} className="flex items-center gap-2">
                <span className="text-[11px] text-slate-600 w-12 shrink-0">{d.label}</span>
                <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  {d.median != null && (
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${maxCompareMedian > 0 ? Math.max(6, (d.median / maxCompareMedian) * 100) : 0}%`,
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

      {/* 色階圖例（與地圖點位著色一致）：只看預售屋時地圖改用大樓圖示，無色階點位可對應 */}
      {!hideColorLegend && (
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
      )}
    </div>
  );
}
