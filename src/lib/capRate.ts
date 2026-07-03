import { Property } from "@/types/property";

// 推估毛投報率 = 最新月租 x 12 / (成交總價 x 萬元換算) ，租金與成交非同期僅供概估
export function estimateCapRate(property: Property): number | null {
  if (!property.sale || property.rents.length === 0) return null;
  const latestRent = property.rents[property.rents.length - 1];
  const annualRent = latestRent.monthlyRent * 12;
  const salePriceInDollars = property.sale.price * 10000;
  if (salePriceInDollars === 0) return null;
  return (annualRent / salePriceInDollars) * 100;
}
