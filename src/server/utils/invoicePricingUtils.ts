import { toNullableNumber } from "./parsingUtils";

export function getPeriodPrice(
  reqBody: any,
  invoiceData: any,
  period: "p1" | "p2" | "p3" | "p4" | "p5" | "p6",
): number | null {
  return (
    toNullableNumber(reqBody?.[`precio_${period}_eur_kwh`]) ??
    toNullableNumber(invoiceData?.[`precio_${period}_eur_kwh`]) ??
    toNullableNumber(invoiceData?.prices?.[period]) ??
    toNullableNumber(invoiceData?.energy_prices?.[period]) ??
    toNullableNumber(invoiceData?.period_prices?.[period]) ??
    toNullableNumber(invoiceData?.coste_eur_kwh?.[period]) ??
    null
  );
}
