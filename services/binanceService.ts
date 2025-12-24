
import { Candle, IntervalType, SymbolType } from "../types";
import { BINANCE_REST_BASE } from "../constants";

/**
 * 获取所有合法的 U 本位合约交易对
 */
export const fetchValidSymbols = async (): Promise<string[]> => {
  try {
    const response = await fetch(`${BINANCE_REST_BASE}/exchangeInfo`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.symbols
      .filter((s: any) => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT')
      .map((s: any) => s.symbol);
  } catch (error) {
    console.error("[Binance] Failed to fetch exchange info:", error);
    return [];
  }
};

export const fetchHistoricalCandles = async (
  symbol: SymbolType, 
  interval: IntervalType, 
  startTime?: number, 
  endTime?: number,
  retries: number = 3
): Promise<Candle[]> => {
  let attempt = 0;
  while (attempt < retries) {
    try {
      let url = `${BINANCE_REST_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=1500`;
      
      if (startTime) url += `&startTime=${startTime}`;
      if (endTime) url += `&endTime=${endTime}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Binance API returned status ${response.status}`);
      }
      
      const data = await response.json();

      if (!Array.isArray(data)) return [];

      return data.map((d: any) => ({
        symbol: symbol,
        time: d[0],
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5]),
        isClosed: true
      }));

    } catch (error) {
      attempt++;
      console.warn(`[Binance] Fetch failed (Attempt ${attempt}/${retries}) for ${symbol}:`, error);
      if (attempt >= retries) {
        console.error(`[Binance] Max retries reached for ${symbol} historical data.`);
        return [];
      }
      await new Promise(res => setTimeout(res, 2000 * attempt));
    }
  }
  return [];
};

export const parseSocketMessage = (msg: any): Candle | null => {
  if (msg.e !== 'kline') return null;
  const k = msg.k;

  return {
    symbol: msg.s,
    time: k.t,
    open: parseFloat(k.o),
    high: parseFloat(k.h),
    low: parseFloat(k.l),
    close: parseFloat(k.c),
    volume: parseFloat(k.v),
    isClosed: k.x
  };
};
