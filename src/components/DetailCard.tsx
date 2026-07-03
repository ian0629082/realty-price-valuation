"use client";

import { Property } from "@/types/property";
import { estimateCapRate } from "@/lib/capRate";
import { saleUnitPrice } from "@/lib/price";

interface Props {
  property: Property;
  onClose: () => void;
}

export default function DetailCard({ property, onClose }: Props) {
  const capRate = estimateCapRate(property);
  const unitPrice = saleUnitPrice(property);
  const streetViewUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${property.lat},${property.lng}`;

  // 預售屋建案：顯示建案資訊而非成交
  const ps = property.presale;
  if (ps) {
    return (
      <div className="absolute top-4 right-4 w-80 bg-white shadow-lg rounded-lg p-4 z-[1000] max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start">
          <h3 className="font-bold text-lg">{ps.buildName}</h3>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-900">
            ✕
          </button>
        </div>
        <div className="text-sm text-gray-500">
          預售屋｜{property.district}
          {ps.sellStatus ? `｜${ps.sellStatus}` : ""}
        </div>

        {ps.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ps.cover} alt={ps.buildName} className="w-full h-36 object-cover rounded mt-2" />
        )}

        <div className="mt-3 space-y-1 text-sm text-gray-800">
          <div className="font-semibold text-blue-700">總價：{ps.priceText}</div>
          {ps.unitPrice != null && (
            <div className="font-semibold text-blue-700">推估單價：{ps.unitPrice} 萬/坪</div>
          )}
          {ps.actualUnitPrice != null && (
            <div className="font-semibold text-emerald-700">
              實價登錄：{ps.actualUnitPrice} 萬/坪（{ps.actualCount} 筆）
            </div>
          )}
          {ps.layout && <div>格局／坪數：{ps.layout}</div>}
          {ps.purpose && <div>型態：{ps.purpose}</div>}
          {ps.dealDate && <div>交屋：{ps.dealDate}</div>}
          {property.address && property.address !== ps.buildName && (
            <div className="text-gray-600">{property.address}</div>
          )}
          {ps.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {ps.tags.map((t) => (
                <span key={t} className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        {ps.unitPrice != null && (
          <p className="mt-2 text-xs text-gray-500">
            單價為總價範圍 ÷ 坪數範圍之推估中位，僅供概估。
          </p>
        )}

        <a
          href={streetViewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block mt-3 text-center bg-blue-600 text-white rounded py-2 text-sm hover:bg-blue-700"
        >
          開啟街景
        </a>
        <p className="mt-2 text-xs text-gray-400">資料來源：591 新建案</p>
      </div>
    );
  }

  return (
    <div className="absolute top-4 right-4 w-80 bg-white shadow-lg rounded-lg p-4 z-[1000] max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-start">
        <h3 className="font-bold text-lg">{property.address}</h3>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-900">
          ✕
        </button>
      </div>

      <div className="text-sm text-gray-800 mt-1 space-y-0.5">
        <div>
          類型：{property.type}｜
          {property.type === "土地" ? "土地面積" : "建物面積"}：{property.buildingArea}坪
        </div>
        {property.roadWidth != null && (
          <div>
            臨路：{property.roadName ? `${property.roadName}，` : ""}路寬 {property.roadWidth}m｜
            分隔島：{property.hasMedian ? "有" : "無"}
            <span className="ml-1 text-xs text-gray-400">（臺中市道路寬度）</span>
          </div>
        )}
        {property.useZone && (
          <div>
            使用分區：{property.useZone}
            {(property.zoneCoverage != null || property.zoneFAR != null) && (
              <>
                {"｜建蔽率 "}
                {property.zoneCoverage != null ? `${property.zoneCoverage}%` : "—"}
                {"｜容積率 "}
                {property.zoneFAR != null ? `${property.zoneFAR}%` : "—"}
              </>
            )}
            <span className="ml-1 text-xs text-gray-400">
              （{property.zoneSource === "非都市法定"
                ? "非都市土地法定，依編定"
                : "臺中市都市計畫分區"}）
            </span>
          </div>
        )}
        {property.useDesignation && (
          <div>使用地類別：{property.useDesignation}</div>
        )}
        {capRate !== null && (
          <div className="font-semibold text-emerald-700">
            推估毛投報率：{capRate.toFixed(2)}%
          </div>
        )}
      </div>

      {property.sale && (
        <div className="mt-3">
          <h4 className="font-semibold text-sm">買賣成交</h4>
          <p className="text-sm">
            總價 {property.sale.price.toLocaleString()} 萬｜{property.sale.date}｜{property.sale.transactionType}｜
            {property.type === "土地" ? "成交土地面積" : "成交建坪"} {property.sale.buildingArea}坪
          </p>
          {unitPrice !== null && (
            <p className="text-sm font-semibold text-blue-700">
              成交單價：{unitPrice.toFixed(1)} 萬/坪
            </p>
          )}
        </div>
      )}

      {property.rents.length > 0 && (
        <div className="mt-3">
          <h4 className="font-semibold text-sm">租賃成交</h4>
          {property.rents.map((r, i) => (
            <p key={i} className="text-sm">
              {r.leaseStart}~{r.leaseEnd}｜{r.floor}｜月租 {r.monthlyRent.toLocaleString()} 元
              {r.note ? `｜${r.note}` : ""}
            </p>
          ))}
        </div>
      )}

      {capRate !== null && (
        <p className="mt-3 text-xs text-gray-600">
          投報率計算方式：最新月租 x 12 / 成交總價。租金與成交時間非同期，僅供概估，非實際投報率。
        </p>
      )}

      {property.businesses.length > 0 && (
        <div className="mt-3">
          <h4 className="font-semibold text-sm">
            營業中商號
            <span className="ml-1 text-gray-500 font-normal">
              （{property.businessCount ?? property.businesses.length} 家）
            </span>
          </h4>
          {property.businesses.map((b, i) => (
            <p key={i} className="text-sm">
              {b.name}
              {b.industry ? `｜${b.industry}` : ""}
              {b.floorPosition ? `｜${b.floorPosition}` : ""}
            </p>
          ))}
          {property.businessCount != null &&
            property.businessCount > property.businesses.length && (
              <p className="text-xs text-gray-500 mt-1">
                （僅顯示前 {property.businesses.length} 家，共 {property.businessCount} 家）
              </p>
            )}
          <p className="text-xs text-gray-500 mt-1">資料來源：財政部營業稅籍登記</p>
        </div>
      )}

      <a
        href={streetViewUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block mt-4 text-center bg-blue-600 text-white rounded py-2 text-sm hover:bg-blue-700"
      >
        開啟街景
      </a>
    </div>
  );
}
