
import { Candle, IntervalType } from "../types";

const NATIVE_INTERVALS = [
  '1m', '3m', '5m', '15m', '30m', 
  '1h', '2h', '4h', '6h', '8h', '12h', 
  '1d', '3d', '1w', '1M'
];

export const intervalToMs = (interval: string): number => {
  const match = interval.match(/^(\d+)([a-zA-Z]+)$/);
  if (!match) return 60000;
  const value = parseInt(match[1]);
  const unit = match[2];
  
  let mult = 60 * 1000;
  if (unit === 's') mult = 1000;
  if (unit === 'm') mult = 60 * 1000;
  if (unit === 'h') mult = 60 * 60 * 1000;
  if (unit === 'd') mult = 24 * 60 * 60 * 1000;
  if (unit === 'w') mult = 7 * 24 * 60 * 60 * 1000;
  if (unit === 'M') mult = 30 * 24 * 60 * 60 * 1000; 

  return value * mult;
};

export const determineBaseConfig = (targetInterval: IntervalType): { baseInterval: IntervalType, isNative: boolean } => {
  if (NATIVE_INTERVALS.includes(targetInterval as string)) {
    return { baseInterval: targetInterval, isNative: true };
  }
  const mappings: Record<string, string> = {
    '2m': '1m', '6m': '3m', '10m': '5m', '20m': '5m', '45m': '15m', '3h': '1h', '10h': '2h', '2d': '1d',
  };
  return { baseInterval: (mappings[targetInterval] || '1m') as IntervalType, isNative: false };
};

export const resampleCandles = (baseCandles: Candle[], targetInterval: IntervalType, baseInterval: IntervalType): Candle[] => {
  const targetMs = intervalToMs(targetInterval);
  const baseMs = intervalToMs(baseInterval);
  
  const resampledMap: Map<number, Candle> = new Map();

  for (const base of baseCandles) {
    // 关键修正：确保聚合边界对齐到格林威治时间/系统时间的整数倍
    const targetStartTime = Math.floor(base.time / targetMs) * targetMs;
    
    if (!resampledMap.has(targetStartTime)) {
      resampledMap.set(targetStartTime, {
        symbol: base.symbol,
        time: targetStartTime,
        open: base.open,
        high: base.high,
        low: base.low,
        close: base.close,
        volume: base.volume,
        isClosed: false
      });
    }

    const current = resampledMap.get(targetStartTime)!;
    current.high = Math.max(current.high, base.high);
    current.low = Math.min(current.low, base.low);
    current.close = base.close;
    current.volume += base.volume;

    const baseEndTime = base.time + baseMs;
    const targetEndTime = targetStartTime + targetMs;
    
    // 如果当前基础K线已经触及或超过了目标周期的结束时间，且基础K线已关闭，则目标K线关闭
    if (base.isClosed && baseEndTime >= targetEndTime) {
        current.isClosed = true;
    }
  }

  return Array.from(resampledMap.values()).sort((a, b) => a.time - b.time);
};
