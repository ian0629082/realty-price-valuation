import { NextRequest, NextResponse } from "next/server";
import { zoneAt } from "@/lib/zoneLookup";

// 右鍵任一點反查都市計畫分區＋容積率（純本地 zone-lookup，免申請免外部 API）
export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "缺少座標" }, { status: 400 });
  }
  const zone = zoneAt(lat, lng);
  return NextResponse.json({
    useZone: zone?.useZone ?? null,
    zoneFAR: zone?.zoneFAR ?? null,
    zoneCoverage: zone?.zoneCoverage ?? null,
  });
}
