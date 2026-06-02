/** Pre-set CAGR (annual, decimal). Negative allowed for ARKK mock. */
export const TICKER_CAGR = {
  "0050": 0.1,
  VOO: 0.12,
  VTI: 0.11,
  ARKK: -0.15,
  TSLA: 0.18,
  BTC: 0.25,
  AAPL: 0.14,
} as const;

export type TickerSymbol = keyof typeof TICKER_CAGR;

export const TICKER_OPTIONS: TickerSymbol[] = [
  "0050",
  "VOO",
  "VTI",
  "AAPL",
  "TSLA",
  "BTC",
  "ARKK",
];

export function getCagrDecimal(ticker: string): number {
  const key = ticker as TickerSymbol;
  return TICKER_CAGR[key] ?? TICKER_CAGR.VOO;
}
