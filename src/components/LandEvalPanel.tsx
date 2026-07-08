"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { calculateLandPrice, nearbyPresaleStats, nearbyPresaleList } from "@/lib/price";
import { Property } from "@/types/property";
import ParcelLocator, { LocatedParcel } from "@/components/ParcelLocator";

const COMPARE_RADIUS_KM = 1; // 附近建案售價比較半徑

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
  mobileFullScreen?: boolean; // 手機版：以全螢幕分頁取代浮動卡片（見「地圖／試算」切換）
  onMobileBack?: () => void; // 手機版：從試算全螢幕返回地圖
  onCompareRadiusChange?: (circle: { lat: number; lng: number; km: number } | null) => void; // 試算結果出現時，通知地圖畫出比較半徑圈
  onMapFocusChange?: (focus: MapFocus) => void; // 切換地圖只顯示預售屋／只顯示土地成交
  presaleCount?: number; // 「只看預售屋」按鈕上顯示的即時筆數（有定位時為半徑內，否則為目前範圍）
  landSaleCount?: number; // 「只看土地成交」按鈕上顯示的即時筆數
}

// 地圖顯示焦點：all＝兩者都顯示（預設），presaleOnly／landSaleOnly＝只留下其中一種疊層
export type MapFocus = "all" | "presaleOnly" | "landSaleOnly";

// 「住宅區」「商業區」（無編號舊制分區）容積率推估說明：都市計畫細部計畫依臨路寬度分級，
// 圖資僅收未達 15 公尺道路之低級距，臨路 15 公尺以上且基地縱深 30 公尺內者容積率較高，僅供參考。
function EstimatedFarNote() {
  return (
    <p className="mt-0.5 text-[11px] leading-snug text-amber-600">
      依都市計畫細部計畫臨路寬度推估之下限值（適用未達15公尺道路）；若臨路15公尺以上且基地縱深30公尺內，容積率可能較高（住宅區240%／商業區480%），正確數值請以地政機關核發資料為準
    </p>
  );
}

// 土地評估試算：浮在地圖上的面板（檢視模式＝土地評估時顯示），可收合以免遮擋地圖。
// 內含「地號定位」與價格試算；容積率沿用既有 zoneFAR 欄位語意（原始數值，300 代表 300%）。
export default function LandEvalPanel({
  located,
  onLocate,
  onClear,
  pickedZone,
  presale,
  mobileFullScreen,
  onMobileBack,
  onCompareRadiusChange,
  onMapFocusChange,
  presaleCount,
  landSaleCount,
}: Props) {
  const [open, setOpen] = useState(true);
  const [landArea, setLandArea] = useState(""); // 土地坪數
  const [landPrice, setLandPrice] = useState(""); // 土地買價（萬 / 坪）
  const [zoneFAR, setZoneFAR] = useState(""); // 容積率（既有欄位，300 = 300%）
  const [mapFocus, setMapFocus] = useState<MapFocus>("presaleOnly"); // 地圖只顯示預售屋／只顯示土地成交，預設只看預售屋
  const [locatorKey, setLocatorKey] = useState(0); // 變動時強制 ParcelLocator 重新掛載，清空其內部地區/地段/地號欄位

  // 清除定位：連同已輸入的坪數／買價／容積率，以及地號定位本身的地區/地段/地號欄位一併清空
  function handleClear() {
    setLandArea("");
    setLandPrice("");
    setZoneFAR("");
    setLocatorKey((k) => k + 1);
    onClear();
  }

  useEffect(() => {
    onMapFocusChange?.(mapFocus);
    return () => onMapFocusChange?.("all");
  }, [mapFocus, onMapFocusChange]);
  const [showNearbyList, setShowNearbyList] = useState(false); // 顯示附近建案清單（名稱＋單價）
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const nearbyTriggerRef = useRef<HTMLButtonElement>(null); // 觸發按鈕（連結樣式）
  const nearbyPopoverRef = useRef<HTMLDivElement>(null); // 傳送門彈出框本體

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

  // 試算結果出現時，通知地圖在參考點畫出比較半徑圈；清除定位或離開試算時一併移除
  useEffect(() => {
    if (!onCompareRadiusChange) return;
    if (refPoint && result) {
      onCompareRadiusChange({ lat: refPoint.lat, lng: refPoint.lng, km: COMPARE_RADIUS_KM });
    } else {
      onCompareRadiusChange(null);
    }
    return () => onCompareRadiusChange(null);
  }, [refPoint, result, onCompareRadiusChange]);

  const nearby = useMemo(
    () =>
      refPoint && presale && presale.length
        ? nearbyPresaleStats(presale, refPoint.lat, refPoint.lng, COMPARE_RADIUS_KM)
        : null,
    [refPoint, presale]
  );

  // 附近建案清單（名稱＋單價），供使用者點開查看比較依據
  const nearbyList = useMemo(
    () =>
      refPoint && presale && presale.length
        ? nearbyPresaleList(presale, refPoint.lat, refPoint.lng, COMPARE_RADIUS_KM)
        : [],
    [refPoint, presale]
  );

  // 點擊清單與觸發按鈕以外的地方時自動收合
  useEffect(() => {
    if (!showNearbyList) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        nearbyPopoverRef.current?.contains(target) ||
        nearbyTriggerRef.current?.contains(target)
      ) {
        return;
      }
      setShowNearbyList(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showNearbyList]);

  const NEARBY_POPOVER_WIDTH = 240;
  const NEARBY_POPOVER_MAX_HEIGHT = 288;

  // 開關附近建案清單：以觸發按鈕的畫面座標計算彈出框位置（fixed 定位，貼齊視窗邊界避免溢出）
  function toggleNearbyList() {
    if (!showNearbyList && nearbyTriggerRef.current) {
      const rect = nearbyTriggerRef.current.getBoundingClientRect();
      let left = rect.right + 8;
      if (left + NEARBY_POPOVER_WIDTH > window.innerWidth - 8) {
        left = Math.max(8, rect.left - NEARBY_POPOVER_WIDTH - 8);
      }
      let top = rect.top;
      if (top + NEARBY_POPOVER_MAX_HEIGHT > window.innerHeight - 8) {
        top = Math.max(8, window.innerHeight - NEARBY_POPOVER_MAX_HEIGHT - 8);
      }
      setPopoverPos({ top, left });
    }
    setShowNearbyList((v) => !v);
  }

  // 臨路寬（僅地號定位提供，右鍵反查不含此資訊）：僅供參考，不影響試算公式
  const roadInfo = located;

  return (
    <div
      className={`${
        mobileFullScreen ? "fixed inset-0 z-[1002]" : "hidden"
      } sm:block sm:absolute sm:inset-auto sm:z-[1000] sm:top-4 sm:left-14 sm:w-80 bg-white/90 shadow-[0_4px_20px_rgba(0,0,0,0.05),0_1px_3px_rgba(0,0,0,0.08)] sm:rounded-xl border border-white/80 max-h-full sm:max-h-[calc(100vh-2rem)] overflow-y-auto`}
    >
      <div className="flex items-center border-b">
        {mobileFullScreen && (
          <button
            onClick={onMobileBack}
            className="sm:hidden shrink-0 px-3 py-2 text-slate-600 text-sm"
          >
            ← 地圖
          </button>
        )}
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex-1 flex justify-between items-center px-3 py-2 text-left"
        >
          <span className="font-bold text-sm">土地評估試算</span>
          <span className="text-gray-500 text-xs">{open ? "收合 ▾" : "展開 ▸"}</span>
        </button>
      </div>

      {open && (
        <div className="p-3">
          <ParcelLocator key={locatorKey} onLocate={onLocate} onClear={handleClear} hasResult={!!located} />

          {/* 定位前只顯示地號定位，避免一開始就塞滿輸入欄與試算結果；定位後才展開下方全部內容 */}
          {located && (
          <>
          {roadInfo && (
            <p className="mt-2 text-[11px]">
              {roadInfo.roadWidth != null ? (
                <>
                  <span className="text-sky-600">
                    臨路寬：{roadInfo.roadWidth}m
                    {roadInfo.roadName ? `（${roadInfo.roadName}）` : ""}
                    {roadInfo.hasMedian ? "，有分隔島" : ""}
                    （資料來源：臺中市道路寬度開放資料）
                  </span>
                  <br />
                  <span className="text-red-600 font-bold">僅供參考，本次試算無參考路寬</span>
                </>
              ) : (
                <span className="text-gray-500">臨路寬：查無資料</span>
              )}
            </p>
          )}

          <div className="flex gap-2 pt-3 mt-3 border-t">
          <div className="flex-1 min-w-0 space-y-2">
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
                onWheel={(e) => e.currentTarget.blur()}
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
                onWheel={(e) => e.currentTarget.blur()}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-0.5">容積率（%）</label>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                className="w-full border rounded px-2 py-1 text-sm"
                placeholder="如 300（＝300%）"
                value={zoneFAR}
                onChange={(e) => setZoneFAR(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
              />
              {located && located.zoneFAR != null && (
                <>
                  <p className="mt-0.5 text-[11px] leading-snug text-emerald-700">
                    已依地號帶入{located.useZone ? `「${located.useZone}」` : ""}容積率 {located.zoneFAR}%
                    {located.zoneFAREstimated ? "（推估值）" : ""}
                  </p>
                  {located.zoneFAREstimated && <EstimatedFarNote />}
                </>
              )}
              {located && located.zoneFAR == null && (
                <p className="mt-0.5 text-[11px] leading-snug text-amber-600">
                  此地號{located.useZone ? `為「${located.useZone}」，` : "查無分區，"}無容積率資料，請手動輸入
                </p>
              )}
              {!located && pickedZone && pickedZone.far != null && (
                <>
                  <p className="mt-0.5 text-[11px] leading-snug text-emerald-700">
                    已帶入右鍵所選{pickedZone.useZone ? `「${pickedZone.useZone}」` : ""}容積率 {pickedZone.far}%
                    {pickedZone.farEstimated ? "（推估值）" : ""}
                  </p>
                  {pickedZone.farEstimated && <EstimatedFarNote />}
                </>
              )}
              {!located && pickedZone && pickedZone.far == null && (
                <p className="mt-0.5 text-[11px] leading-snug text-amber-600">
                  右鍵所選{pickedZone.useZone ? `「${pickedZone.useZone}」` : "此處"}無容積率資料，請手動輸入
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-5 shrink-0 w-28">
            <button
              type="button"
              onClick={() => setMapFocus((m) => (m === "presaleOnly" ? "all" : "presaleOnly"))}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl border-2 py-2.5 transition-all active:translate-y-0.5 ${
                mapFocus === "presaleOnly"
                  ? "bg-blue-500 border-blue-300 text-white"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
              style={{
                boxShadow:
                  mapFocus === "presaleOnly"
                    ? "0 4px 0 #1d4ed8, inset 0 -3px 6px rgba(0,0,0,.15)"
                    : "0 3px 0 #e2e8f0",
              }}
            >
              <svg width="22" height="26" viewBox="0 0 26 32" className="shrink-0">
                <path d="M4 8 L14 3 L14 31 L4 31 Z" fill={mapFocus === "presaleOnly" ? "#eff6ff" : "#2f6fb0"} />
                <path d="M14 3 L22 7 L22 31 L14 31 Z" fill={mapFocus === "presaleOnly" ? "#bfdbfe" : "#1e4e82"} />
              </svg>
              <span className="text-xs font-semibold leading-tight mt-0.5">只看預售屋</span>
              <span className={`text-[10px] leading-none ${mapFocus === "presaleOnly" ? "text-blue-100" : "text-slate-400"}`}>
                {presaleCount ?? 0} 筆
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMapFocus((m) => (m === "landSaleOnly" ? "all" : "landSaleOnly"))}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl border-2 py-2.5 transition-all active:translate-y-0.5 ${
                mapFocus === "landSaleOnly"
                  ? "bg-blue-500 border-blue-300 text-white"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
              style={{
                boxShadow:
                  mapFocus === "landSaleOnly"
                    ? "0 4px 0 #1d4ed8, inset 0 -3px 6px rgba(0,0,0,.15)"
                    : "0 3px 0 #e2e8f0",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 22 22" className="shrink-0">
                <circle
                  cx="11"
                  cy="11"
                  r="9"
                  fill={mapFocus === "landSaleOnly" ? "#fde68a" : "#eab308"}
                  stroke={mapFocus === "landSaleOnly" ? "#fff" : "#334155"}
                  strokeWidth="1.5"
                />
              </svg>
              <span className="text-xs font-semibold leading-tight mt-0.5">只看土地成交</span>
              <span className={`text-[10px] leading-none ${mapFocus === "landSaleOnly" ? "text-blue-100" : "text-slate-400"}`}>
                {landSaleCount ?? 0} 筆
              </span>
            </button>
          </div>
          </div>

          {error && <p className="mt-2 text-xs text-red-600 font-bold">{error}</p>}

          {result && (
            <div className="mt-3 rounded bg-gray-50 border p-2.5 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-600">總容積</span>
                <span className="font-medium">約 {fmt(result.totalFloorArea)} 坪</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">土地倍數</span>
                <span className="font-medium">約 {fmt(result.landMultiplier)} 倍</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">土地單坪價</span>
                <span className="font-medium">約 {fmt(result.landCostPerBuildingPing)} 萬 / 坪</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">營造成本（建物+土地）</span>
                <span className="font-medium">約 {fmt(result.constructionTotalCost)} 萬 / 坪</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">管銷費用</span>
                <span className="font-medium">約 {fmt(result.managementCost)} 萬 / 坪</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">預設利潤（20%）</span>
                <span className="font-medium">約 {fmt(result.profit)} 萬 / 坪</span>
              </div>
              <div className="flex justify-between border-t pt-1 mt-1">
                <span className="text-gray-700 font-medium">預計售價</span>
                <span className="font-semibold text-blue-700">
                  約 {fmt(result.estimatedSalePricePerPing)} 萬 / 坪
                </span>
              </div>
            </div>
          )}
          {result && <p className="mt-1 text-sm text-red-600 font-bold">試算內容不考慮獎勵容積</p>}

          {/* 附近 3km 預售建案售價比較 */}
          {result && (
            <div className="mt-2 rounded border border-sky-200 bg-sky-50 p-2.5 text-sm">
              <p className="font-medium text-sky-800 mb-1">附近 {COMPARE_RADIUS_KM}km 建案售價比較</p>
              {!refPoint ? (
                <p className="text-[11px] text-gray-500">
                  請先以「地號定位」或右鍵點擊地圖，設定比較的參考位置。
                </p>
              ) : !nearby ? (
                <p className="text-[11px] leading-snug text-amber-600">此範圍內無建案報價可比較。</p>
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

                      {nearbyList.length > 0 && (
                        <button
                          ref={nearbyTriggerRef}
                          type="button"
                          onClick={toggleNearbyList}
                          className="w-full text-left text-xs font-medium text-sky-700 underline decoration-sky-400 underline-offset-2 hover:text-sky-900"
                        >
                          {showNearbyList
                            ? "收合建案明細 ▴"
                            : `▸ 查看附近 ${nearbyList.length} 筆建案明細與售價`}
                        </button>
                      )}

                      {showNearbyList &&
                        nearbyList.length > 0 &&
                        popoverPos &&
                        createPortal(
                          <div
                            ref={nearbyPopoverRef}
                            style={{
                              position: "fixed",
                              top: popoverPos.top,
                              left: popoverPos.left,
                              width: NEARBY_POPOVER_WIDTH,
                              maxHeight: NEARBY_POPOVER_MAX_HEIGHT,
                            }}
                            className="overflow-y-auto rounded-lg border border-sky-300 bg-white p-2.5 shadow-2xl z-[2000]"
                          >
                            <p className="mb-1 text-[11px] font-medium text-gray-500">
                              附近 {COMPARE_RADIUS_KM}km 預售建案（{nearbyList.length} 筆，依距離排序）
                            </p>
                            <ul className="space-y-1.5">
                              {nearbyList.map((item, i) => (
                                <li key={i} className="text-xs border-b border-gray-100 last:border-0 pb-1 last:pb-0">
                                  <p className="text-gray-700 truncate">{item.buildName}</p>
                                  <p className="flex justify-between gap-2 mt-0.5">
                                    <span className="font-medium text-sky-800">
                                      開價 {fmt(item.unitPrice)} 萬
                                    </span>
                                    {item.actualUnitPrice != null && (
                                      <span className="font-medium text-amber-700">
                                        實登 {fmt(item.actualUnitPrice)} 萬
                                      </span>
                                    )}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          </div>,
                          document.body
                        )}
                    </div>
                  );
                })()
              )}
            </div>
          )}
          </>
          )}
        </div>
      )}
    </div>
  );
}
