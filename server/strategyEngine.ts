
import { Candle, StrategyConfig, PositionState, TradeStats, WebhookPayload } from "../types";

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

  if (nextPos.direction === 'LONG') {
      nextPos.highestPrice = Math.max(nextPos.highestPrice || last.close, last.high);
  } else if (nextPos.direction === 'SHORT') {
      if (nextPos.lowestPrice === 0) nextPos.lowestPrice = last.low;
      nextPos.lowestPrice = Math.min(nextPos.lowestPrice, last.low);
  }

  const isSignalTrigger = config.triggerOnClose ? last.isClosed : true;
  if (!isSignalTrigger) {
      return { newPositionState: nextPos, newTradeStats: nextStats, actions };
  }

  if (last.ema7 === undefined || last.ema25 === undefined || last.ema99 === undefined) {
    return { newPositionState: nextPos, newTradeStats: nextStats, actions };
  }

  const canTrade = nextStats.dailyTradeCount < config.maxDailyTrades && 
                   tradeStats.lastActionCandleTime !== currentCandleTime;

  let exitReason = '';
  let entryReason = '';
  let intendedDirection: 'LONG' | 'SHORT' | 'NONE' = 'NONE';
  let exitQuantity = 0;

  if (!config.manualTakeover) {
      
      // --- A. 平仓逻辑 ---
      if (nextPos.direction !== 'FLAT') {
          const isLong = nextPos.direction === 'LONG';
          const pnlPct = isLong 
              ? (last.close - nextPos.entryPrice) / nextPos.entryPrice * 100
              : (nextPos.entryPrice - last.close) / nextPos.entryPrice * 100;

          if (config.useFixedTPSL) {
              if (pnlPct >= config.takeProfitPct) exitReason = `固定止盈(${config.takeProfitPct}%)`;
              else if (pnlPct <= -config.stopLossPct) exitReason = `固定止损(-${config.stopLossPct}%)`;
          }

          if (!exitReason && config.useMultiTPSL) {
              for (let i = 0; i < config.tpLevels.length; i++) {
                  const tp = config.tpLevels[i];
                  if (tp.active && !nextPos.tpLevelsHit[i]) {
                      const trigger = isLong ? (pnlPct >= tp.pct) : (pnlPct <= -tp.pct);
                      if (trigger) {
                          exitReason = `多级止盈#${i+1}(${tp.pct}%)`;
                          exitQuantity = (nextPos.initialQuantity * tp.qtyPct) / 100;
                          nextPos.tpLevelsHit[i] = true;
                          break;
                      }
                  }
              }
          }

          if (!exitReason && config.useTrailingStop) {
              const activationReached = isLong 
                  ? (nextPos.highestPrice - nextPos.entryPrice) / nextPos.entryPrice * 100 >= config.trailActivation
                  : (nextPos.entryPrice - nextPos.lowestPrice) / nextPos.entryPrice * 100 >= config.trailActivation;
              
              if (activationReached) {
                  const dropFromPeak = isLong
                      ? (nextPos.highestPrice - last.close) / nextPos.highestPrice * 100
                      : (last.close - nextPos.lowestPrice) / nextPos.lowestPrice * 100;
                  if (dropFromPeak >= config.trailDistance) exitReason = `追踪止盈(回撤${config.trailDistance}%)`;
              }
          }

          if (!exitReason) {
              if (isLong) {
                  if (config.useEMA7_25 && config.ema7_25_ExitLong && crossUnder(last.ema7, last.ema25, prev.ema7!, prev.ema25!)) exitReason = 'EMA死叉平多';
                  else if (config.useEMA7_99 && config.ema7_99_ExitLong && crossUnder(last.ema7, last.ema99, prev.ema7!, prev.ema99!)) exitReason = 'EMA7/99死叉平多';
                  else if (config.useEMA25_99 && config.ema25_99_ExitLong && crossUnder(last.ema25, last.ema99, prev.ema25!, prev.ema99!)) exitReason = 'EMA25/99死叉平多';
              } else {
                  if (config.useEMA7_25 && config.ema7_25_ExitShort && crossOver(last.ema7, last.ema25, prev.ema7!, prev.ema25!)) exitReason = 'EMA金叉平空';
                  else if (config.useEMA7_99 && config.ema7_99_ExitShort && crossOver(last.ema7, last.ema99, prev.ema7!, prev.ema99!)) exitReason = 'EMA7/99金叉平空';
                  else if (config.useEMA25_99 && config.ema25_99_ExitShort && crossOver(last.ema25, last.ema99, prev.ema25!, prev.ema99!)) exitReason = 'EMA25/99金叉平空';
              }
          }

          if (exitReason) {
              const isFullExit = exitQuantity === 0 || exitQuantity >= nextPos.remainingQuantity;
              const actualQty = isFullExit ? nextPos.remainingQuantity : exitQuantity;
              actions.push({
                secret: config.secret,
                action: isLong ? 'sell' : 'buy',
                position: isFullExit ? 'flat' : isLong ? 'long' : 'short',
                symbol: config.symbol,
                quantity: actualQty.toFixed(8),
                trade_amount: actualQty * last.close,
                timestamp: now.toISOString(),
                strategy_name: config.name,
                tp_level: exitReason,
                execution_price: last.close,
                execution_quantity: actualQty
              });
              if (isFullExit) {
                  nextPos = { 
                    ...nextPos, direction: 'FLAT', initialQuantity: 0, remainingQuantity: 0, 
                    entryPrice: 0, highestPrice: 0, lowestPrice: 0, openTime: 0, 
                    tpLevelsHit: new Array(4).fill(false), slLevelsHit: new Array(4).fill(false),
                    delayedEntryCurrentCount: 0, lastCountedSignalTime: 0
                  };
                  nextStats.lastActionCandleTime = currentCandleTime;
              } else {
                  nextPos.remainingQuantity -= actualQty;
              }
          }
      }

      // --- B. 常规开仓逻辑 ---
      if (canTrade && nextPos.direction === 'FLAT' && intendedDirection === 'NONE') {
          let rawDirection: 'LONG' | 'SHORT' | 'NONE' = 'NONE';
          let rawReason = '';

          // 1. 信号检测 (EMA 组合)
          if (config.useEMA7_25) {
              if (config.ema7_25_Long && crossOver(last.ema7, last.ema25, prev.ema7!, prev.ema25!)) { rawDirection = 'LONG'; rawReason = 'EMA金叉(7/25)'; }
              else if (config.ema7_25_Short && crossUnder(last.ema7, last.ema25, prev.ema7!, prev.ema25!)) { rawDirection = 'SHORT'; rawReason = 'EMA死叉(7/25)'; }
          }
          if (rawDirection === 'NONE' && config.useEMA7_99) {
              if (config.ema7_99_Long && crossOver(last.ema7, last.ema99, prev.ema7!, prev.ema99!)) { rawDirection = 'LONG'; rawReason = 'EMA金叉(7/99)'; }
              else if (config.ema7_99_Short && crossUnder(last.ema7, last.ema99, prev.ema7!, prev.ema99!)) { rawDirection = 'SHORT'; rawReason = 'EMA死叉(7/99)'; }
          }
          if (rawDirection === 'NONE' && config.useEMA25_99) {
              if (config.ema25_99_Long && crossOver(last.ema25, last.ema99, prev.ema25!, prev.ema99!)) { rawDirection = 'LONG'; rawReason = 'EMA金叉(25/99)'; }
              else if (config.ema25_99_Short && crossUnder(last.ema25, last.ema99, prev.ema25!, prev.ema99!)) { rawDirection = 'SHORT'; rawReason = 'EMA死叉(25/99)'; }
          }

          // 2. 信号处理 (包含延后逻辑)
          if (rawDirection !== 'NONE') {
              if (config.useDelayedEntry) {
                  const isMatch = config.delayedEntryType === 'BOTH' || 
                                (config.delayedEntryType === 'LONG' && rawDirection === 'LONG') ||
                                (config.delayedEntryType === 'SHORT' && rawDirection === 'SHORT');
                  
                  // 重要：确保 activationTime 是包含性的 (inclusive)
                  if (last.time >= config.delayedEntryActivationTime && isMatch) {
                      // 仅在新的信号周期累加计数
                      if (nextPos.lastCountedSignalTime !== last.time) {
                          nextPos.delayedEntryCurrentCount++;
                          nextPos.lastCountedSignalTime = last.time;
                      }
                      
                      // N=1 或 达到目标值，立即触发
                      if (nextPos.delayedEntryCurrentCount >= config.delayedEntryTargetCount) {
                          intendedDirection = rawDirection;
                          entryReason = `延后触发#${nextPos.delayedEntryCurrentCount}: ${rawReason}`;
                      }
                  }
              } else {
                  // 无延迟直接执行
                  intendedDirection = rawDirection;
                  entryReason = rawReason;
              }
          }
      }
  }

  // --- C. 执行最终开仓指令 ---
  if (intendedDirection !== 'NONE') {
      const qty = config.tradeAmount / last.close;
      if (qty > 0) {
          actions.push({
            secret: config.secret, action: intendedDirection === 'LONG' ? 'buy' : 'sell',
            position: intendedDirection.toLowerCase(), symbol: config.symbol,
            quantity: qty.toFixed(8), trade_amount: qty * last.close,
            timestamp: now.toISOString(), strategy_name: config.name,
            tp_level: entryReason, execution_price: last.close, execution_quantity: qty
          });
          nextPos = {
              ...nextPos, direction: intendedDirection, pendingSignal: 'NONE',
              initialQuantity: qty, remainingQuantity: qty, entryPrice: last.close,
              highestPrice: last.high, lowestPrice: last.low, openTime: now.getTime(),
              tpLevelsHit: new Array(4).fill(false), slLevelsHit: new Array(4).fill(false),
              delayedEntryCurrentCount: 0, lastCountedSignalTime: 0
          };
          nextStats.dailyTradeCount++;
          nextStats.lastActionCandleTime = currentCandleTime;
      }
  }

  return { newPositionState: nextPos, newTradeStats: nextStats, actions };
};
