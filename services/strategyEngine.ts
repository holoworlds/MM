
import { Candle, StrategyConfig, PositionState, TradeStats, WebhookPayload } from "../types";

// Helper to determine crosses
const crossOver = (currA: number, currB: number, prevA: number, prevB: number) => prevA <= prevB && currA > currB;
const crossUnder = (currA: number, currB: number, prevA: number, prevB: number) => prevA >= prevB && currA < currB;

export interface StrategyResult {
  newPositionState: PositionState;
  newTradeStats: TradeStats;
  actions: WebhookPayload[];
}

export const evaluateStrategy = (
  candles: Candle[],
  config: StrategyConfig,
  currentPosition: PositionState,
  tradeStats: TradeStats
): StrategyResult => {
  const actions: WebhookPayload[] = [];
  let nextPos = { ...currentPosition };
  let nextStats = { ...tradeStats };

  if (candles.length < 50 || !config.isActive) {
    return { newPositionState: nextPos, newTradeStats: nextStats, actions };
  }

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const now = new Date();
  const dateKey = now.toISOString().split('T')[0];
  const currentCandleTime = last.time;

  if (nextStats.lastTradeDate !== dateKey) {
    nextStats.dailyTradeCount = 0;
    nextStats.lastTradeDate = dateKey;
  }

  const isSignalTrigger = config.triggerOnClose ? last.isClosed : true;


  // --- 3. Check Technical Signals ---
  
  if (last.ema7 === undefined || last.ema25 === undefined || last.ema99 === undefined) {
    return { newPositionState: nextPos, newTradeStats: nextStats, actions };
  }
  
  // Trend Filter Logic
  const isTrendLong = (last.ema7 > last.ema25 && last.ema25 > last.ema99);
  const isTrendShort = (last.ema7 < last.ema25 && last.ema25 < last.ema99);
  
  const blockShort = config.trendFilterBlockShort && isTrendLong;
  const blockLong = config.trendFilterBlockLong && isTrendShort;

  // EMA Crosses
  const ema7_25_Up = config.useEMA7_25 && crossOver(last.ema7, last.ema25, prev.ema7!, prev.ema25!);
  const ema7_25_Down = config.useEMA7_25 && crossUnder(last.ema7, last.ema25, prev.ema7!, prev.ema25!);
  
  const ema7_99_Up = config.useEMA7_99 && crossOver(last.ema7, last.ema99, prev.ema7!, prev.ema99!);
  const ema7_99_Down = config.useEMA7_99 && crossUnder(last.ema7, last.ema99, prev.ema7!, prev.ema99!);

  const ema25_99_Up = config.useEMA25_99 && crossOver(last.ema25, last.ema99, prev.ema25!, prev.ema99!);
  const ema25_99_Down = config.useEMA25_99 && crossUnder(last.ema25, last.ema99, prev.ema25!, prev.ema99!);

  // Double EMA Logic
  const isDoubleLongZone = last.ema7 > last.ema99 && last.ema25 > last.ema99;
  const wasDoubleLongZone = prev.ema7! > prev.ema99! && prev.ema25! > prev.ema99!;
  const emaDouble_Up = config.useEMADouble && isDoubleLongZone && !wasDoubleLongZone;

  const isDoubleShortZone = last.ema7 < last.ema99 && last.ema25 < last.ema99;
  const wasDoubleShortZone = prev.ema7! < prev.ema99! && prev.ema25! < prev.ema99!;
  const emaDouble_Down = config.useEMADouble && isDoubleShortZone && !wasDoubleShortZone;

  // MACD
  const macdBuy = config.useMACD && last.macdLine !== undefined && last.macdSignal !== undefined && 
                  crossOver(last.macdLine, last.macdSignal, prev.macdLine!, prev.macdSignal!);
  const macdSell = config.useMACD && last.macdLine !== undefined && last.macdSignal !== undefined &&
                   crossUnder(last.macdLine, last.macdSignal, prev.macdLine!, prev.macdSignal!);


  // --- PRICE RETURN GATE (EMA7) ---
  let priceReturnAllowed = true;
  if (config.usePriceReturnEMA7) {
      const distPct = Math.abs((last.close - last.ema7) / last.ema7) * 100;
      if (distPct > config.priceReturnDist) {
          priceReturnAllowed = false;
      }
  }

  // --- 4. Determine Entry Conditions ---
  
  let longEntryReason = '';
  // Only check Entry if Gate allows
  if (!config.manualTakeover && isSignalTrigger && !blockLong && priceReturnAllowed) { 
     if (config.useMACD && config.macdLong && macdBuy) longEntryReason = 'MACD金叉开多';
     else if (config.useEMA7_25 && config.ema7_25_Long && ema7_25_Up) longEntryReason = 'EMA7上穿25开多';
     else if (config.useEMA7_99 && config.ema7_99_Long && ema7_99_Up) longEntryReason = 'EMA7上穿99开多';
     else if (config.useEMA25_99 && config.ema25_99_Long && ema25_99_Up) longEntryReason = 'EMA25上穿99开多';
     else if (config.useEMADouble && config.emaDoubleLong && emaDouble_Up) longEntryReason = 'EMA双线>99开多';
  }

  let shortEntryReason = '';
  if (!config.manualTakeover && isSignalTrigger && !blockShort && priceReturnAllowed) { 
    if (config.useMACD && config.macdShort && macdSell) shortEntryReason = 'MACD死叉开空';
    else if (config.useEMA7_25 && config.ema7_25_Short && ema7_25_Down) shortEntryReason = 'EMA7下穿25开空';
    else if (config.useEMA7_99 && config.ema7_99_Short && ema7_99_Down) shortEntryReason = 'EMA7下穿99开空';
    else if (config.useEMA25_99 && config.ema25_99_Short && ema25_99_Down) shortEntryReason = 'EMA25下穿99开空';
    else if (config.useEMADouble && config.emaDoubleShort && emaDouble_Down) shortEntryReason = 'EMA双线<99开空';
  }

  // --- 5. Determine Exit Conditions (Price Return Gate does NOT affect exits) ---
  
  let exitLongReason = '';
  if (isSignalTrigger) {
      if (config.useMACD && config.macdExitLong && macdSell) exitLongReason = 'MACD死叉平多';
      else if (config.useEMA7_25 && config.ema7_25_ExitLong && ema7_25_Down) exitLongReason = 'EMA7下穿25平多';
      else if (config.useEMA7_99 && config.ema7_99_ExitLong && ema7_99_Down) exitLongReason = 'EMA7下穿99平多';
      else if (config.useEMA25_99 && config.ema25_99_ExitLong && ema25_99_Down) exitLongReason = 'EMA25下穿99平多';
      else if (config.useEMADouble && config.emaDoubleExitLong && emaDouble_Down) exitLongReason = 'EMA双线<99平多';
  }

  let exitShortReason = '';
  if (isSignalTrigger) {
      if (config.useMACD && config.macdExitShort && macdBuy) exitShortReason = 'MACD金叉平空';
      else if (config.useEMA7_25 && config.ema7_25_ExitShort && ema7_25_Up) exitShortReason = 'EMA7上穿25平空';
      else if (config.useEMA7_99 && config.ema7_99_ExitShort && ema7_99_Up) exitShortReason = 'EMA7上穿99平空';
      else if (config.useEMA25_99 && config.ema25_99_ExitShort && ema25_99_Up) exitShortReason = 'EMA25上穿99平空';
      else if (config.useEMADouble && config.emaDoubleExitShort && emaDouble_Up) exitShortReason = 'EMA双线>99平空';
  }

  // --- 6. Execution State Machine ---
  
  const canOpen = nextStats.dailyTradeCount < config.maxDailyTrades;

  const createPayload = (act: string, pos: string, comment: string, amountVal: number, qty: number): WebhookPayload => ({
    secret: config.secret,
    action: act,
    position: pos,
    symbol: config.symbol,
    quantity: qty.toString(),
    trade_amount: amountVal, 
    leverage: 5,
    timestamp: now.toISOString(),
    tv_exchange: "BINANCE",
    strategy_name: config.name,
    tp_level: comment,
    execution_price: last.close,
    execution_quantity: qty
  });

  // A. Check Exits
  if (nextPos.direction !== 'FLAT') {
      const isLong = nextPos.direction === 'LONG';
      const entryPrice = nextPos.entryPrice;
      const currentPrice = last.close;
      let finalCloseReason = '';
      
      // 1. Signal Exit
      if (isLong && exitLongReason) finalCloseReason = exitLongReason;
      if (!isLong && exitShortReason) finalCloseReason = exitShortReason;

      // 2. Fixed TP/SL
      if (config.useFixedTPSL && !config.useTrailingStop && !config.useMultiTPSL && !finalCloseReason) {
          const longTPHit = isLong && last.high >= entryPrice * (1 + config.takeProfitPct/100);
          const longSLHit = isLong && last.low <= entryPrice * (1 - config.stopLossPct/100);
          const shortTPHit = !isLong && last.low <= entryPrice * (1 - config.takeProfitPct/100);
          const shortSLHit = !isLong && last.high >= entryPrice * (1 + config.stopLossPct/100);

          if (longTPHit || shortTPHit) finalCloseReason = '固定止盈触发';
          else if (longSLHit || shortSLHit) finalCloseReason = '固定止损触发';
      }

      // 3. Trailing Stop
      if (config.useTrailingStop && !finalCloseReason) {
         if (isLong) {
            nextPos.highestPrice = Math.max(nextPos.highestPrice, last.high);
            const stopPrice = nextPos.highestPrice * (1 - config.trailDistance / 100);
            const activationPrice = entryPrice * (1 + config.trailActivation / 100);
            if (nextPos.highestPrice >= activationPrice && last.low <= stopPrice) {
               finalCloseReason = '追踪止盈触发';
            }
         } else {
            nextPos.lowestPrice = Math.min(nextPos.lowestPrice, last.low);
            const stopPrice = nextPos.lowestPrice * (1 + config.trailDistance / 100);
            const activationPrice = entryPrice * (1 - config.trailActivation / 100);
            if (nextPos.lowestPrice <= activationPrice && last.high >= stopPrice) {
              finalCloseReason = '追踪止盈触发';
            }
         }
      }

      // 4. Multi-Level TP/SL
      if (config.useMultiTPSL && !config.useTrailingStop && !finalCloseReason) {
          // Take Profits
          config.tpLevels.forEach((tp, idx) => {
              if (!tp.active || nextPos.tpLevelsHit[idx] || nextPos.remainingQuantity <= 0.000001) return;
              
              const targetPrice = isLong 
                 ? entryPrice * (1 + tp.pct / 100)
                 : entryPrice * (1 - tp.pct / 100);
              
              const hit = isLong ? last.high >= targetPrice : last.low <= targetPrice;

              if (hit) {
                  const qtyToSell = nextPos.initialQuantity * (tp.qtyPct / 100);
                  const actualQty = Math.min(qtyToSell, nextPos.remainingQuantity);
                  const tradeValue = actualQty * currentPrice;
                  const action = isLong ? 'sell' : 'buy'; 
                  actions.push(createPayload(action, nextPos.direction.toLowerCase(), `止盈${idx+1}触发`, tradeValue, actualQty));
                  
                  nextPos.remainingQuantity = Math.max(0, nextPos.remainingQuantity - actualQty);
                  const newHits = [...nextPos.tpLevelsHit];
                  newHits[idx] = true;
                  nextPos.tpLevelsHit = newHits;
              }
          });

          // Stop Losses
          config.slLevels.forEach((sl, idx) => {
             if (!sl.active || nextPos.slLevelsHit[idx] || nextPos.remainingQuantity <= 0.000001) return;
             
             const targetPrice = isLong 
                 ? entryPrice * (1 - sl.pct / 100)
                 : entryPrice * (1 + sl.pct / 100);

             const hit = isLong ? last.low <= targetPrice : last.high >= targetPrice;

             if (hit) {
                  const qtyToSell = nextPos.initialQuantity * (sl.qtyPct / 100);
                  const actualQty = Math.min(qtyToSell, nextPos.remainingQuantity);
                  const tradeValue = actualQty * currentPrice;
                  const action = isLong ? 'sell' : 'buy';
                  actions.push(createPayload(action, nextPos.direction.toLowerCase(), `止损${idx+1}触发`, tradeValue, actualQty));

                  nextPos.remainingQuantity = Math.max(0, nextPos.remainingQuantity - actualQty);
                  const newHits = [...nextPos.slLevelsHit];
                  newHits[idx] = true;
                  nextPos.slLevelsHit = newHits;
             }
          });
      }

      if (nextPos.remainingQuantity <= 0.000001 && !finalCloseReason) {
           finalCloseReason = "全部止盈/止损完成";
      }

      // EXECUTE FULL CLOSE
      if (finalCloseReason) {
          if (nextPos.remainingQuantity > 0.000001) {
             const qtyToClose = nextPos.remainingQuantity;
             const tradeValue = qtyToClose * currentPrice;
             const actionStr = isLong ? 'sell' : 'buy';
             actions.push(createPayload(actionStr, 'flat', finalCloseReason, tradeValue, qtyToClose));
          }
          
          nextPos = {
            direction: 'FLAT',
            initialQuantity: 0,
            remainingQuantity: 0,
            entryPrice: 0,
            highestPrice: 0,
            lowestPrice: 0,
            openTime: 0,
            tpLevelsHit: [],
            slLevelsHit: []
          };
          nextStats.dailyTradeCount++;
          
          // REVERSE LOGIC
          const isSignalExit = (isLong && finalCloseReason === exitLongReason) || 
                               (!isLong && finalCloseReason === exitShortReason);

          if (config.useReverse && isSignalExit && !config.manualTakeover && priceReturnAllowed) { // Added price return check to reverse
             let newQty = 0;
             let tradeVal = 0;

             // Only Crypto Supported
             newQty = config.tradeAmount / last.close;
             tradeVal = config.tradeAmount;

             if (isLong && config.reverseLongToShort && canOpen) {
                // Open Short
                actions.push(createPayload('sell', 'short', '反手开空', tradeVal, newQty));
                nextPos = {
                  direction: 'SHORT',
                  initialQuantity: newQty,
                  remainingQuantity: newQty,
                  entryPrice: last.close,
                  highestPrice: 0,
                  lowestPrice: last.low,
                  openTime: now.getTime(),
                  tpLevelsHit: [],
                  slLevelsHit: []
                };
             } else if (!isLong && config.reverseShortToLong && canOpen) {
                // Open Long
                actions.push(createPayload('buy', 'long', '反手开多', tradeVal, newQty));
                nextPos = {
                  direction: 'LONG',
                  initialQuantity: newQty,
                  remainingQuantity: newQty,
                  entryPrice: last.close,
                  highestPrice: last.high,
                  lowestPrice: 0,
                  openTime: now.getTime(),
                  tpLevelsHit: [],
                  slLevelsHit: []
                };
             }
          }
      }
  }

  // B. Check Entries
  if (nextPos.direction === 'FLAT' && canOpen && !config.manualTakeover 
      && tradeStats.lastActionCandleTime !== currentCandleTime 
      && actions.length === 0) {
      
      if (longEntryReason || shortEntryReason) {
          
          let qty = 0;
          let tradeVal = 0;

          // Only Crypto Supported
          qty = config.tradeAmount / last.close;
          tradeVal = config.tradeAmount;

          if (longEntryReason) {
              actions.push(createPayload('buy', 'long', longEntryReason, tradeVal, qty));
              nextPos = {
                direction: 'LONG',
                initialQuantity: qty,
                remainingQuantity: qty,
                entryPrice: last.close,
                highestPrice: last.high,
                lowestPrice: 0,
                openTime: now.getTime(),
                tpLevelsHit: [],
                slLevelsHit: []
              };
          } else if (shortEntryReason) {
              actions.push(createPayload('sell', 'short', shortEntryReason, tradeVal, qty));
              nextPos = {
                direction: 'SHORT',
                initialQuantity: qty,
                remainingQuantity: qty,
                entryPrice: last.close,
                highestPrice: 0,
                lowestPrice: last.low,
                openTime: now.getTime(),
                tpLevelsHit: [],
                slLevelsHit: []
              };
          }
      }
  }

  if (actions.length > 0) {
      nextStats.lastActionCandleTime = currentCandleTime;
  }

  return { newPositionState: nextPos, newTradeStats: nextStats, actions };
};
