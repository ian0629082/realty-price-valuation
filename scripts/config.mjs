// 內政部不動產成交案件資料供應系統，季別格式：{民國年}S{季別1-4}
// 4 季：114S1 ~ 114S4
export const SEASONS = [
  "114S1", "114S2", "114S3", "114S4",
];
export const CITY_FILE_PREFIX = "b"; // b = 臺中市
export const TARGET_DISTRICTS = ["南區", "大里區", "南屯區"];

export const RAW_DIR = "data/raw";
export const OUTPUT_FILE = "data/properties.json";
export const UI_OUTPUT_FILE = "src/data/properties.json";

// 座標定位失敗時（門牌查無 / 地號查無）的後備：以區域大致範圍隨機產生假座標
export const DISTRICT_BOUNDS = {
  南區: { latMin: 24.1, latMax: 24.135, lngMin: 120.66, lngMax: 120.685 },
  大里區: { latMin: 24.08, latMax: 24.12, lngMin: 120.665, lngMax: 120.72 },
  南屯區: { latMin: 24.11, latMax: 24.17, lngMin: 120.58, lngMax: 120.655 },
};
