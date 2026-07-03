"use client";

import { useMemo, useState } from "react";
import sectionsData from "@/data/sections.json";

export interface LocatedParcel {
  lat: number;
  lng: number;
  label: string;
  useZone?: string | null; // 該地號座標所在使用分區
  zoneFAR?: number | null; // 容積率（%，300 代表 300%），供土地評估試算自動帶入
  zoneFAREstimated?: boolean; // true：容積率非圖資原值，依「住宅區/商業區」臨路寬度預設低級距推估，僅供參考
  zoneCoverage?: number | null; // 建蔽率（%）
  roadWidth?: number | null; // 臨路寬（公尺，最近道路段推估，僅供參考，不影響試算）
  roadName?: string | null; // 最近道路名稱
  hasMedian?: boolean; // 該道路是否推估有分隔島
}

interface Props {
  onLocate: (parcel: LocatedParcel) => void;
  onClear: () => void;
  hasResult: boolean;
}

const SECTIONS = sectionsData as Record<string, string[]>;
const REGIONS = Object.keys(SECTIONS); // ["台中市南區", "台中市大里區"]
// 區域 → 地政事務所代碼（供後端精準定位同名地段）
const REGION_TOWN: Record<string, string> = {
  台中市南區: "B03",
  台中市大里區: "B28",
  台中市南屯區: "B07",
};

// 地號定位（左側欄）：區域 → 地段（連動）→ 地號輸入 → 定位
export default function ParcelLocator({ onLocate, onClear, hasResult }: Props) {
  const [region, setRegion] = useState(""); // 預設「選擇地區」
  const [section, setSection] = useState("");
  const [no, setNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sections = useMemo(() => SECTIONS[region] ?? [], [region]);

  async function locate() {
    setError("");
    if (!region) return setError("請選擇地區");
    if (!section) return setError("請選擇地段");
    if (!no.trim()) return setError("請輸入地號");
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: `${section}${no.trim()}`,
        town: REGION_TOWN[region] ?? "",
      });
      const res = await fetch(`/api/locate-parcel?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "查詢失敗");
        return;
      }
      onLocate(data as LocatedParcel);
    } catch {
      setError("查詢失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-1">地號定位</label>
      <div className="space-y-1.5">
        <select
          className="w-full border rounded px-2 py-1 text-sm"
          value={region}
          onChange={(e) => {
            setRegion(e.target.value);
            setSection("");
          }}
        >
          <option value="">選擇地區</option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <select
          className="w-full border rounded px-2 py-1 text-sm"
          value={section}
          onChange={(e) => setSection(e.target.value)}
        >
          <option value="">選擇地段</option>
          {sections.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <div className="flex gap-1.5">
          <input
            className="flex-1 min-w-0 border rounded px-2 py-1 text-sm"
            placeholder="地號，如 670-22"
            value={no}
            onChange={(e) => setNo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && locate()}
          />
          <button
            onClick={locate}
            disabled={loading}
            className="shrink-0 bg-blue-600 text-white rounded px-3 py-1 text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "查詢" : "定位"}
          </button>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
        {hasResult && (
          <button
            onClick={() => {
              setError("");
              onClear();
            }}
            className="text-xs text-blue-600 hover:underline"
          >
            清除定位
          </button>
        )}
      </div>
    </div>
  );
}
