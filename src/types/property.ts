export type PropertyType = "店面" | "住宅" | "土地" | "預售屋";

export interface SaleTransaction {
  price: number; // 萬元
  date: string;
  transactionType: string;
  buildingArea: number; // 坪
  isSpecialTransaction?: boolean; // 政府備註為親友/員工/共有人等特殊關係、持分、畸零地等交易，價格可能不反映市場行情
}

export interface RentTransaction {
  monthlyRent: number; // 元
  floor: string;
  leaseStart: string;
  leaseEnd: string;
  note?: string;
}

export interface BusinessRegistration {
  name: string;
  industry: string;
  status: string;
  floorPosition: string;
}

// 預售屋建案（591 新建案），與成交資料結構不同
export interface PresaleInfo {
  buildName: string;
  priceText: string; // 「2100~2400 萬/戶」或「價格待定」
  priceMin: number | null;
  priceMax: number | null;
  areaText: string;
  unitPrice: number | null; // 推估單價（萬/坪，591 開價推估）
  actualUnitPrice?: number | null; // 實價登錄成交均價（萬/坪），依建案名對應，查無為 null
  actualCount?: number; // 實價登錄成交筆數
  layout: string;
  dealDate: string; // 交屋時間，如「預計2028年下半年」
  sellStatus: string; // 在售/待售
  purpose: string; // 住宅大樓/透天…
  tags: string[];
  cover: string;
  url: string;
}

export interface Property {
  id: string;
  address: string;
  type: PropertyType;
  city: string;
  district: string;
  lat: number;
  lng: number;
  roadWidth: number | null; // 臨路寬（公尺），OSM 推估，無資料為 null
  hasMedian: boolean; // 有無分隔島，OSM 推估
  roadName?: string; // 最近道路名稱
  roadWidthSource?: string; // gov-taichung | none
  buildingArea: number; // 坪
  useZone?: string; // 都市/非都市土地使用分區
  useDesignation?: string; // 非都市土地使用地類別（編定）
  zoneCoverage?: number | null; // 建蔽率（%）
  zoneFAR?: number | null; // 容積率（%）
  zoneSource?: "都市計畫" | "非都市法定" | null; // 建蔽/容積來源：都市計畫 KML 或非都市土地法定表
  sale?: SaleTransaction;
  rents: RentTransaction[];
  businesses: BusinessRegistration[];
  businessCount?: number; // 該門牌營業中商號總數（businesses 可能因上限截斷）
  presale?: PresaleInfo; // 預售屋建案資訊（type 為「預售屋」時）
}
