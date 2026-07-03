"use client";

import { useEffect, useMemo, useState } from "react";
import { calculateLandPrice, nearbyPresaleStats } from "@/lib/price";
import { Property } from "@/types/property";
import ParcelLocator, { LocatedParcel } from "@/components/ParcelLocator";

const COMPARE_RADIUS_KM = 3; // 附近建案售價比較半徑

interface Props {
  located?: LocatedParcel | null; // 地號定位結果，用於自動帶入容積率
  onLocate: (parcel: LocatedParcel) => void; // 地號定位成功
  onClear: () => void; // 清除定位
  pickedZone?: {
    far: number | null;
    farEstimated?: boolean;
    useZone: string | null;
    lat: number;
    lng: number;
    nonce: number;
  } | null; // 右鍵反查分區，帶入容積率＋座標
  presale?: Property[]; // 全區預售建案，供 3km 售價比較
}

// 「住宅區」「商業區」（無編號舊制分區）容積率推估說明：都市計畫細部計畫依臨路寬度分級，
// 圖資僅收未達 15 公尺道路之低級距，臨路 15 公尺以上且基地縱深 30 公尺內者容積率較高，僅供參考。
function EstimatedFarNote() {
  return (
    <p className="mt-0.5 text-[11px] text-amber-600">
      依都市計畫細部計畫臨路寬度推估之下限值（適用未達15公尺道路）；若臨路15公尺以上且基地縱深30公尺內，容積率可能較高（住宅區240%／商業區480%），正確數值請以地政機關核發資料為準
    </p>
  );
}

// 土地評估試算：浮在地圖上的面板（檢視模式＝土地評估時顯示），可收合以免遮擋地圖。
// 內含「地號定位」與價格試算；容積率沿用既有 zoneFAR 欄位語意（原始數值，300 代表 300%）。
export default function LandEvalPanel({ located, onLocate, onClear, pickedZone, presale }: Props) {
  const [open, setOpen] = useState(true);
  const [landArea, setLandArea] = useState(""); // 土地坪數
  const [landPrice, setLandPrice] = useState(""); // 土地買價（萬 / 坪）
  const [zoneFAR, setZoneFAR] = useState(""); // 容積率（既有欄位，300 = 300%）

  // 定位到新地號時，若查到容積率則自動帶入（使用者仍可手動修改）
  useEffect(() => {
    if (located && located.zoneFAR != null) {
      setZoneFAR(String(located.zoneFAR));
    }
  }, [located]);

  // 右鍵反查分區時，帶入容積率（nonce 變動即觸發；坪數需另行輸入或由地號定位取得）
  // 若已有地號定位結果，右鍵點擊其他空白處不應覆蓋容積率，須先「清除定位」才能改用右鍵反查
  useEffect(() => {
    if (!located && pickedZone && pickedZone.far != null) {
      setZoneFAR(String(pickedZone.far));
    }
  }, [pickedZone, located]);

  // 驗證＋計算：三個欄位皆須為 > 0 的數字（允許小數）
  const { result, error } = useMemo(() => {
    const area = parseFloat(landArea);
    const price = parseFloat(landPrice);
    const far = parseFloat(zoneFAR);

    if (landArea === "" || landPrice === "" || zoneFAR === "") {
      return { result: null, error: "" }; // 尚未輸入完整，不顯示錯誤
    }
    if (Number.isNaN(area) || area <= 0) {
      return { result: null, error: "土地坪數必須是大於 0 的數字" };
    }
    if (Number.isNaN(price) || price <= 0) {
      return { result: null, error: "土地買價必須是大於 0 的數字" };
    }
    if (Number.isNaN(far) || far <= 0) {
      return { result: null, error: "容積率必須是大於 0 的數字" };
    }
    return { result: calculateLandPrice(area, price, far), error: "" };
  }, [landArea, landPrice, zoneFAR]);

  const fmt = (n: number) => n.toFixed(2);

  // 附近 3km 建案售價比較的參考點：優先地號定位座標，其次右鍵點擊座標
  const refPoint = useMemo(() => {
    if (located) return { lat: located.lat, lng: located.lng };
    if (pickedZone) return { lat: pickedZone.lat, lng: pickedZone.lng };
    return null;
  }, [located, pickedZone]);

  const nearby = useMemo(
    () =>
      refPoint && presale && presale.length
        ? nearbyPresaleStats(presale, refPoint.lat, refPoint.lng, COMPARE_RADIUS_KM)
        : null,
    [refPoint, presale]
  );

  // 臨路寬（僅地號定位提供，右鍵反查不含此資訊）：僅供參考，不影響試算公式
  const roadInfo = located;

  return (
    <div className="absolute top-4 left-14 w-72 bg-white shadow-lg rounded-xl border border-slate-200 z-[1000] max-h-[calc(100vh-2rem)] overflow-y-auto">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex justify-between items-center px-3 py-2 border-b text-left"
      >
        <span className="font-bold text-sm">土地評估試算</span>
        <span className="text-gray-500 text-xs">{open ? "收合 ▾" : "展開 ▸"}</span>
      </button>

      {open && (
        <div className="p-3">
          <ParcelLocator onLocate={onLocate} onClear={onClear} hasResult={!!located} />

          {roadInfo && (
            <p className="mt-2 text-[11px] text-gray-500">
              {roadInfo.roadWidth != null ? (
                <>
                  臨路寬：{roadInfo.roadWidth}m
                  {roadInfo.roadName ? `（${roadInfo.roadName}）` : ""}
                  {roadInfo.hasMedian ? "，有分隔島" : ""} — 僅供參考，本次試算無參考路寬
                </>
              ) : (
                "臨路寬：查無資料"
              )}
            </p>
          )}

          <div className="space-y-2 pt-3 mt-3 border-t">
            <div>
              <label className="block text-xs text-gray-600 mb-0.5">土地坪數（坪）</label>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                className="w-full border rounded px-2 py-1 text-sm"
                placeholder="如 100、35.68"
                value={landArea}
                onChange={(e) => setLandArea(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-0.5">土地買價（萬 / 坪）</label>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                className="w-full border rounded px-2 py-1 text-sm"
                placeholder="如 120、128.5"
                value={landPrice}
                onChange={(e) => setLandPrice(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-0.5">容積率（%，如 300）</label>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                className="w-full border rounded px-2 py-1 text-sm"
                placeholder="如 300（＝300%）"
                value={zoneFAR}
                onChange={(e) => setZoneFAR(e.target.value)}
              />
              {located && located.zoneFAR != null && (
                <>
                  <p className="mt-0.5 text-[11px] text-emerald-700">
                    已依地號帶入{located.useZone ? `「${located.useZone}」` : ""}容積率 {located.zoneFAR}%
                    {located.zoneFAREstimated ? "（推估值）" : ""}
                  </p>
                  {located.zoneFAREstimated && <EstimatedFarNote />}
                </>
              )}
              {located && located.zoneFAR == null && (
                <p className="mt-0.5 text-[11px] text-amber-600">
                  此地號{located.useZone ? `為「${located.useZone}」，` : "查無分區，"}無容積率資料，請手動輸入
                </p>
              )}
              {!located && pickedZone && pickedZone.far != null && (
                <>
                  <p className="mt-0.5 text-[11px] text-emerald-700">
                    已帶入右鍵所選{pickedZone.useZone ? `「${pickedZone.useZone}」` : ""}容積率 {pickedZone.far}%
                    {pickedZone.farEstimated ? "（推估值）" : ""}
                  </p>
                  {pickedZone.farEstimated && <EstimatedFarNote />}
                </>
              )}
              {!located && pickedZone && pickedZone.far == null && (
                <p className="mt-0.5 text-[11px] text-amber-600">
                  右鍵所選{pickedZone.useZone ? `「${pickedZone.useZone}」` : "此處"}無容積率資料，請手動輸入
                </p>
              )}
            </div>
          </div>

          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

          {result && (
            <div className="mt-3 rounded bg-gray-50 border p-2.5 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-600">總容積</span>
                <span className="font-medium">{fmt(result.totalFloorArea)} 坪</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">土地倍數</span>
                <span className="font-medium">{fmt(result.landMultiplier)} 倍</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">土地單坪價</span>
                <span className="font-medium">{fmt(result.landCostPerBuildingPing)} 萬 / 坪</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">營造成本</span>
                <span className="font-medium">{fmt(result.constructionTotalCost)} 萬 / 坪</span>
              </div>
              <div className="flex justify-between border-t pt-1 mt-1">
                <span className="text-gray-700 font-medium">預計售價</span>
                <span className="font-semibold text-blue-700">
                  {fmt(result.estimatedSalePricePerPing)} 萬 / 坪
                </span>
              </div>
            </div>
          )}

          {/* 附近 3km 預售建案售價比較 */}
          {result && (
            <div className="mt-2 rounded border border-sky-200 bg-sky-50 p-2.5 text-sm">
              <p className="font-medium text-sky-800 mb-1">附近 {COMPARE_RADIUS_KM}km 建案售價比較</p>
              {!refPoint ? (
                <p className="text-[11px] text-gray-500">
                  請先以「地號定位」或右鍵點擊地圖，設定比較的參考位置。
                </p>
              ) : !nearby ? (
                <p className="text-[11px] text-amber-600">此範圍內無建案報價可比較。</p>
              ) : (
                (() => {
                  const est = result.estimatedSalePricePerPing;
                  const diff = est - nearby.median;
                  const pct = (diff / nearby.median) * 100;
                  const high = diff > 0;
                  return (
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-600">建案中位數（{nearby.count} 筆）</span>
                        <span className="font-medium">{fmt(nearby.median)} 萬 / 坪</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">建案售價區間</span>
                        <span className="font-medium">
                          {fmt(nearby.min)} ~ {fmt(nearby.max)}
                        </span>
                      </div>
                      <div
                        className={`flex justify-between border-t pt-1 mt-1 font-medium ${
                          high ? "text-rose-700" : "text-emerald-700"
                        }`}
                      >
                        <span>你的預計售價</span>
                        <span>
                          {high ? "高於" : "低於"}中位數 {Math.abs(pct).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
