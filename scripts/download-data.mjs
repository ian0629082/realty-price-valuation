import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { SEASONS, CITY_FILE_PREFIX, RAW_DIR } from "./config.mjs";

const FILES_TO_EXTRACT = [
  `${CITY_FILE_PREFIX}_lvr_land_a.csv`, // 不動產買賣
  `${CITY_FILE_PREFIX}_lvr_land_b.csv`, // 預售屋買賣（含建案名稱，供預售實價登錄均價）
  `${CITY_FILE_PREFIX}_lvr_land_c.csv`, // 不動產租賃
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function downloadSeason(season) {
  const url = `https://plvr.land.moi.gov.tw/DownloadSeason?season=${season}&type=zip&fileName=lvr_landcsv.zip`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下載失敗（${season}）：HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const zip = new AdmZip(buffer);
  const destDir = path.join(RAW_DIR, season);
  fs.mkdirSync(destDir, { recursive: true });

  for (const fileName of FILES_TO_EXTRACT) {
    const entry = zip.getEntry(fileName);
    if (!entry) throw new Error(`zip 內找不到檔案（${season}）：${fileName}`);
    fs.writeFileSync(path.join(destDir, fileName), entry.getData());
  }
  console.log(`  ${season} ✓`);
}

async function main() {
  console.log(`下載 ${SEASONS.length} 季資料...`);
  for (const season of SEASONS) {
    await downloadSeason(season);
    await sleep(500); // 對內政部主機客氣一點
  }
  console.log("全部下載完成。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
