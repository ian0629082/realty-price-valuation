/**
 * 下載財政部「全國營業(稅籍)登記資料集」，篩出目標行政區，存成精簡檔。
 * 來源：https://eip.fia.gov.tw/data/BGMOPEN1.zip（全國、每日更新、免費、僅營業中）
 *
 * 原始欄位：營業地址,統一編號,總機構統一編號,營業人名稱,資本額,設立日期,
 *           組織別名稱,使用統一發票,行業代號,名稱,行業代號1,名稱1,...
 * 只保留：營業地址、統一編號、營業人名稱、設立日期、行業名稱
 */
import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { RAW_DIR, TARGET_DISTRICTS } from "./config.mjs";

const ZIP_URL = "https://eip.fia.gov.tw/data/BGMOPEN1.zip";
const OUT_FILE = path.join(RAW_DIR, "tax-business.csv");

// 單行 CSV 解析（處理雙引號內含逗號）
function parseCsvLine(line) {
  const out = [];
  let cur = "", inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      out.push(cur); cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

// 稅籍地址中，單字區名補了全形空格（南　區）；把它壓成一般字串以利比對行政區
function normDistrict(addr) {
  return addr.replace(/　/g, "");
}

async function main() {
  console.log("下載財政部稅籍資料（約 66MB）...");
  const res = await fetch(ZIP_URL);
  if (!res.ok) throw new Error(`下載失敗：HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const zip = new AdmZip(buffer);
  const entry = zip.getEntry("BGMOPEN1.csv");
  if (!entry) throw new Error("zip 內找不到 BGMOPEN1.csv");

  console.log("解析中（全國約 160 萬筆，僅保留目標行政區）...");
  const text = entry.getData().toString("utf-8");
  const lines = text.split("\n");

  const wanted = TARGET_DISTRICTS.map((d) => `臺中市${d}`);
  const rows = [["營業地址", "統一編號", "營業人名稱", "設立日期", "行業"]];
  let kept = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('"臺中市')) continue;
    const cols = parseCsvLine(line);
    const addr = normDistrict(cols[0] || "");
    if (!wanted.some((w) => addr.startsWith(w))) continue;
    rows.push([addr, cols[1] || "", cols[3] || "", cols[5] || "", cols[9] || ""]);
    kept++;
  }

  fs.mkdirSync(RAW_DIR, { recursive: true });
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
  fs.writeFileSync(OUT_FILE, csv, "utf-8");
  console.log(`保留 ${kept} 筆商號 → ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
