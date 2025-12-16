
import { Candle } from "../types";

// Exponential Moving Average
export const calculateEMA = (candles: Candle[], period: number): number[] => {
  const k = 2 / (period + 1);
  const emaArray: number[] = [];
  
  if (candles.length < period) {
    return new Array(candles.length).fill(NaN); 
  }

  // Initial SMA
  let initialSum = 0;
  for (let i = 0; i < period; i++) {
    initialSum += candles[i].close;
  }
  
  const initialEMA = initialSum / period;
  
  // Fill initial undefineds
  for(let i=0; i<period-1; i++) {
    emaArray.push(NaN); 
  }
  
  emaArray.push(initialEMA);

  // Calculate rest
  for (let i = period; i < candles.length; i++) {
    const price = candles[i].close;
    const prevEMA = emaArray[i - 1];
    
    // Handle NaN in previous EMA
    if (isNaN(prevEMA)) {
       emaArray.push(price); 
       continue;
    }

    const currentEMA = (price * k) + (prevEMA * (1 - k));
    emaArray.push(currentEMA);
  }

  return emaArray;
};

// MACD Calculation
export const calculateMACD = (candles: Candle[], fast: number, slow: number, signal: number) => {
  const emaFast = calculateEMA(candles, fast);
  const emaSlow = calculateEMA(candles, slow);
  
  const macdLine: number[] = [];
  
  for(let i=0; i<candles.length; i++) {
    if (isNaN(emaFast[i]) || isNaN(emaSlow[i])) {
      macdLine.push(NaN);
    } else {
      macdLine.push(emaFast[i] - emaSlow[i]);
    }
  }

  // Signal Line is EMA of MACD Line
  const calculateEMAFromValues = (values: number[], period: number): number[] => {
     const k = 2 / (period + 1);
     const result: number[] = [];
     
     let firstValidIdx = -1;
     for(let i=0; i<values.length; i++) {
       if(!isNaN(values[i])) {
         firstValidIdx = i;
         break;
       }
     }

     if (firstValidIdx === -1 || (values.length - firstValidIdx) < period) {
       return new Array(values.length).fill(NaN);
     }

     for(let i=0; i<firstValidIdx; i++) result.push(NaN);

     let sum = 0;
     for(let i=0; i<period; i++) sum += values[firstValidIdx + i];
     const initial = sum / period;
     
     for(let i=0; i<period-1; i++) result.push(NaN);
     result.push(initial);

     for(let i = firstValidIdx + period; i < values.length; i++) {
        const val = values[i];
        const prev = result[i-1];
        if (isNaN(val)) {
          result.push(NaN); 
        } else {
          result.push((val * k) + (prev * (1 - k)));
        }
     }
     
     while(result.length < values.length) {
       result.unshift(NaN);
     }
     
     return result.slice(result.length - values.length);
  };

  const macdSignalLine = calculateEMAFromValues(macdLine, signal);
  const macdHist = macdLine.map((m, i) => m - macdSignalLine[i]);

  return { macdLine, macdSignalLine, macdHist };
};

export const enrichCandlesWithIndicators = (
    candles: Candle[], 
    config?: { 
        macdFast: number, 
        macdSlow: number, 
        macdSignal: number
    }
): Candle[] => {
  if (candles.length === 0) return [];

  const ema7 = calculateEMA(candles, 7);
  const ema25 = calculateEMA(candles, 25);
  const ema99 = calculateEMA(candles, 99);

  const f = config?.macdFast || 50;
  const s = config?.macdSlow || 150;
  const sig = config?.macdSignal || 9;

  const { macdLine, macdSignalLine, macdHist } = calculateMACD(candles, f, s, sig);

  return candles.map((c, i) => ({
    ...c,
    ema7: isNaN(ema7[i]) ? undefined : ema7[i],
    ema25: isNaN(ema25[i]) ? undefined : ema25[i],
    ema99: isNaN(ema99[i]) ? undefined : ema99[i],
    macdLine: isNaN(macdLine[i]) ? undefined : macdLine[i],
    macdSignal: isNaN(macdSignalLine[i]) ? undefined : macdSignalLine[i],
    macdHist: isNaN(macdHist[i]) ? undefined : macdHist[i]
  }));
};
