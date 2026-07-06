"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, WMSTileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";
import { Property } from "@/types/property";
import type { MapBounds } from "@/lib/price";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

interface LocatedParcel {
  lat: number;
  lng: number;
  label: string;
}

interface Props {
  properties: Property[];
  onSelect: (property: Property) => void;
  colorFor: (property: Property) => string;
  onBoundsChange?: (bounds: MapBounds) => void;
  focusBounds?: (MapBounds & { nonce: number }) | null; // 切換縣市／區域時，地圖飛到該範圍
  located?: LocatedParcel | null;
  showCadastral?: boolean; // 疊加地籍圖底圖（土地評估模式）
  onPickZone?: (zone: PickedZone) => void; // 右鍵任一點反查分區，帶入試算容積率
  presale?: Property[]; // 預售建案疊層（土地評估模式，大樓圖示，供 3km 售價比較）
  compareCircle?: { lat: number; lng: number; km: number } | null; // 試算結果出現時，附近建案比較半徑圈
}

// 右鍵反查回傳的分區資訊（含點擊座標，供附近建案比較）
export interface PickedZone {
  lat: number;
  lng: number;
  useZone: string | null;
  zoneFAR: number | null;
  zoneFAREstimated?: boolean; // true：容積率非圖資原值，依「住宅區/商業區」臨路寬度預設低級距推估，僅供參考
  zoneCoverage: number | null;
}

// 地號定位的圖釘（紅色水滴 pin，與物件圓點明顯區隔）
const PARCEL_PIN = L.divIcon({
  className: "",
  html: `<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 25 15 25s15-14.5 15-25C30 6.7 23.3 0 15 0z" fill="#dc2626" stroke="#fff" stroke-width="2"/>
    <circle cx="15" cy="15" r="6" fill="#fff"/>
  </svg>`,
  iconSize: [30, 40],
  iconAnchor: [15, 40],
  popupAnchor: [0, -38],
});

// 地號定位圖釘：放上標記、飛到該位置，清除時移除
function LocatedPinLayer({ located }: { located: LocatedParcel | null | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (!located) return;
    const marker = L.marker([located.lat, located.lng], { icon: PARCEL_PIN, zIndexOffset: 1000 })
      .addTo(map)
      .bindTooltip(located.label, { permanent: true, direction: "top", offset: [0, -38] });
    map.flyTo([located.lat, located.lng], 18, { duration: 0.8 });
    return () => {
      map.removeLayer(marker);
    };
  }, [map, located]);
  return null;
}

// 附近建案比較半徑圈（淡色，僅供參考範圍視覺化）：試算結果出現時顯示，清除定位時一併移除
function CompareRadiusLayer({
  circle,
}: {
  circle: { lat: number; lng: number; km: number } | null | undefined;
}) {
  const map = useMap();
  useEffect(() => {
    if (!circle) return;
    const layer = L.circle([circle.lat, circle.lng], {
      radius: circle.km * 1000,
      color: "#0284c7",
      weight: 1,
      opacity: 0.5,
      fillColor: "#0284c7",
      fillOpacity: 0.06,
    }).addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, circle]);
  return null;
}

// 預售建案「大樓」圖示（藍色大樓 + 開價標籤，下方另加實價登錄成交均價標籤區隔顏色）
function buildingIcon(unitPrice: number | null, actualUnitPrice?: number | null): L.DivIcon {
  const askLabel =
    unitPrice != null
      ? `<span style="background:#1e3a5f;color:#fff;font-size:11px;line-height:1;padding:2px 5px;border-radius:8px;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,.3)">${unitPrice} 萬</span>`
      : "";
  const actualLabel =
    actualUnitPrice != null
      ? `<span style="margin-top:2px;background:#b45309;color:#fff;font-size:11px;line-height:1;padding:2px 5px;border-radius:8px;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,.3)">實登 ${actualUnitPrice} 萬</span>`
      : "";
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center">
      <svg width="26" height="32" viewBox="0 0 26 32" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 8 L14 3 L14 31 L4 31 Z" fill="#2f6fb0" stroke="#fff" stroke-width="1"/>
        <path d="M14 3 L22 7 L22 31 L14 31 Z" fill="#1e4e82" stroke="#fff" stroke-width="1"/>
        <g fill="#cfe4f7">
          <rect x="6" y="11" width="2" height="2"/><rect x="10" y="11" width="2" height="2"/>
          <rect x="6" y="16" width="2" height="2"/><rect x="10" y="16" width="2" height="2"/>
          <rect x="6" y="21" width="2" height="2"/><rect x="10" y="21" width="2" height="2"/>
          <rect x="16" y="12" width="2" height="2"/><rect x="19" y="13" width="2" height="2"/>
          <rect x="16" y="17" width="2" height="2"/><rect x="19" y="18" width="2" height="2"/>
          <rect x="16" y="22" width="2" height="2"/><rect x="19" y="23" width="2" height="2"/>
        </g>
      </svg>
      ${askLabel}${actualLabel}</div>`,
    iconSize: [26, actualUnitPrice != null ? 64 : 48],
    iconAnchor: [13, 32],
  });
}

// 預售建案圖示滑鼠提示：開價（591 推估）＋ 實價登錄成交均價（若有對應成交紀錄）
function presaleTooltip(p: Property): string {
  const name = p.presale?.buildName ?? p.address;
  const ask = p.presale?.unitPrice != null ? `｜開價 ${p.presale.unitPrice} 萬/坪` : "";
  const actual =
    p.presale?.actualUnitPrice != null
      ? `｜實登 ${p.presale.actualUnitPrice} 萬/坪（${p.presale.actualCount ?? 0} 筆）`
      : "";
  return `${name}${ask}${actual}`;
}

// 預售建案疊層（土地評估模式）：以大樓圖示呈現，點擊開啟明細卡
function PresaleLayer({
  presale,
  onSelect,
}: {
  presale: Property[];
  onSelect: (p: Property) => void;
}) {
  const map = useMap();
  useEffect(() => {
    const cluster = L.markerClusterGroup({
      maxClusterRadius: 45,
      showCoverageOnHover: false,
    });
    for (const p of presale) {
      const marker = L.marker([p.lat, p.lng], {
        icon: buildingIcon(p.presale?.unitPrice ?? null, p.presale?.actualUnitPrice),
      });
      marker.bindTooltip(presaleTooltip(p));
      marker.on("click", () => onSelect(p));
      cluster.addLayer(marker);
    }
    map.addLayer(cluster);
    return () => {
      map.removeLayer(cluster);
    };
  }, [map, presale, onSelect]);
  return null;
}

// 國土測繪中心 NLSC WMTS 圖磚，免費免申請
const NLSC_TILE_URL =
  "https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}";

// 以 markercluster 管理所有物件圈圈，縮小時聚合、放大時展開。
// 顏色由行情色階（buildMetricScale）決定，故隨檢視模式/區域自動調整。
// 預售屋（type「預售屋」）改用大樓圖示＋單價標籤呈現，與成交圓點區隔。
function ClusterLayer({ properties, onSelect, colorFor }: Props) {
  const map = useMap();

  useEffect(() => {
    const cluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
    });

    for (const p of properties) {
      let marker: L.Marker | L.CircleMarker;
      if (p.type === "預售屋") {
        marker = L.marker([p.lat, p.lng], {
          icon: buildingIcon(p.presale?.unitPrice ?? null, p.presale?.actualUnitPrice),
        });
        marker.bindTooltip(presaleTooltip(p));
      } else {
        const fillColor = colorFor(p);
        marker = L.circleMarker([p.lat, p.lng], {
          radius: 8,
          color: "#334155",
          fillColor,
          fillOpacity: 0.85,
          weight: 1,
        });
        marker.bindTooltip(
          p.sale?.isSpecialTransaction ? `${p.address}（特殊交易，僅供參考）` : p.address
        );
      }
      marker.on("click", () => onSelect(p));
      cluster.addLayer(marker);
    }

    map.addLayer(cluster);
    return () => {
      map.removeLayer(cluster);
    };
  }, [map, properties, onSelect, colorFor]);

  return null;
}

// 監聽地圖平移/縮放，回報目前可視範圍供「視野即時行情」使用
function BoundsWatcher({ onBoundsChange }: { onBoundsChange: (b: MapBounds) => void }) {
  const emit = (map: L.Map) => {
    const b = map.getBounds();
    onBoundsChange({
      north: b.getNorth(),
      south: b.getSouth(),
      east: b.getEast(),
      west: b.getWest(),
    });
  };
  const map = useMapEvents({
    moveend: () => emit(map),
    zoomend: () => emit(map),
  });
  useEffect(() => {
    emit(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// 切換縣市／區域時，地圖飛到該範圍（單點資料則以合理縮放層級置中）
function FocusBoundsFlyTo({ focus }: { focus: (MapBounds & { nonce: number }) | null | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    map.flyToBounds(
      [
        [focus.south, focus.west],
        [focus.north, focus.east],
      ],
      { padding: [40, 40], maxZoom: 16, duration: 0.8 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);
  return null;
}

// 右鍵：對點擊處任一點反查都市計畫分區＋容積率，彈出資訊並帶入試算器
function ZoneRightClick({ onPickZone }: { onPickZone: (zone: PickedZone) => void }) {
  const onPickRef = useRef(onPickZone);
  onPickRef.current = onPickZone;

  const map = useMapEvents({
    async contextmenu(e) {
      L.DomEvent.preventDefault(e.originalEvent); // 抑制瀏覽器原生右鍵選單
      const { lat, lng } = e.latlng;
      const popup = L.popup({ offset: [0, -6] })
        .setLatLng(e.latlng)
        .setContent('<div style="font-size:13px">查詢分區中…</div>')
        .openOn(map);
      try {
        const res = await fetch(`/api/zone-at?lat=${lat}&lng=${lng}`);
        const zone = await res.json();
        const z: PickedZone = { lat, lng, ...zone };
        if (z.useZone) {
          const parts: string[] = [];
          if (z.zoneFAR != null) parts.push(`容積率 ${z.zoneFAR}%`);
          if (z.zoneCoverage != null) parts.push(`建蔽率 ${z.zoneCoverage}%`);
          const detail = parts.length ? `${parts.join("｜")}<br/>` : "";
          const note =
            z.zoneFAR != null
              ? z.zoneFAREstimated
                ? '<span style="color:#d97706">推估值（未達15公尺道路級距），已帶入試算</span>'
                : '<span style="color:#059669">已帶入試算容積率</span>'
              : '<span style="color:#d97706">此分區無容積率資料</span>';
          popup.setContent(
            `<div style="font-size:13px;line-height:1.5">
              使用分區：<b>${z.useZone}</b><br/>
              ${detail}${note}
            </div>`
          );
          onPickRef.current(z);
        } else {
          popup.setContent('<div style="font-size:13px">此處查無都市計畫分區資料</div>');
        }
      } catch {
        popup.setContent('<div style="font-size:13px;color:#dc2626">分區查詢失敗，請重試</div>');
      }
    },
  });
  return null;
}

export default function PropertyMap({
  properties,
  onSelect,
  colorFor,
  onBoundsChange,
  focusBounds,
  located,
  showCadastral,
  onPickZone,
  presale,
  compareCircle,
}: Props) {
  return (
    <MapContainer center={[24.155, 120.65]} zoom={13} className="w-full h-full">
      <TileLayer
        url={NLSC_TILE_URL}
        attribution='&copy; <a href="https://www.nlsc.gov.tw/">國土測繪中心</a>'
      />
      {showCadastral && (
        // 國土測繪中心地籍圖（段籍圖）WMS，免申請；半透明疊在電子地圖上
        <WMSTileLayer
          url="https://wms.nlsc.gov.tw/wms"
          layers="LANDSECT"
          format="image/png"
          transparent
          version="1.3.0"
          opacity={0.7}
          attribution="地籍圖 &copy; 國土測繪中心"
        />
      )}
      <ClusterLayer properties={properties} onSelect={onSelect} colorFor={colorFor} />
      {onBoundsChange && <BoundsWatcher onBoundsChange={onBoundsChange} />}
      <FocusBoundsFlyTo focus={focusBounds} />
      {onPickZone && <ZoneRightClick onPickZone={onPickZone} />}
      {presale && presale.length > 0 && <PresaleLayer presale={presale} onSelect={onSelect} />}
      <CompareRadiusLayer circle={compareCircle} />
      <LocatedPinLayer located={located} />
    </MapContainer>
  );
}
