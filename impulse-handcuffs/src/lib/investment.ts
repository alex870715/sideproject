export function futureValue(
  price: number,
  cagrDecimal: number,
  years = 10,
): number {
  return price * (1 + cagrDecimal) ** years;
}
