
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

  const isEMA7_25_Up = last.ema7 > last.ema25;
  const isEMA7_25_Down = last.ema7 < last.ema25;

  const checkPullbackTouch = (ema7: number, distPct: number, trend: 'UP' | 'DOWN'): boolean => {
      const buffer = ema7 * (distPct / 100);
      return trend === 'UP' 
        ? (last.low <= ema7 + buffer && last.close >= ema7 - buffer)
        : (last.high >= ema7 - buffer && last.close <= ema7 + buffer);
  };

  const isPriceTooFar = (ema7: number, distPct: number): boolean => {
      const dist = Math.abs(last.close - ema7) / ema7 * 100;
      return dist > distPct;
  };

  const canTrade = nextStats.dailyTradeCount < config.maxDailyTrades && 
                   tradeStats.lastActionCandleTime !== currentCandleTime;

  if (!canTrade && nextPos.direction === 'FLAT') {
      nextPos.pendingSignal = 'NONE';
      nextPos.pendingSignalSource = '';
  }

  let exitReason = '';
  let entryReason = '';
  let intendedDirection: 'LONG' | 'SHORT' | 'NONE' = 'NONE';
  let exitQuantity = 0;
  let isSignalExit = false; 

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
              const levels = isLong ? config.tpLevels : config.slLevels;
              const hits = isLong ? nextPos.tpLevelsHit : nextPos.slLevelsHit;
              
              for (let i = 0; i < levels.length; i++) {
                  if (levels[i].active && !hits[i]) {
                      const trigger = isLong ? (pnlPct >= levels[i].pct) : (pnlPct <= -levels[i].pct);
                      if (trigger) {
                          exitReason = `多级${isLong ? '止盈' : '止损'}#${i+1}(${levels[i].pct}%)`;
                          exitQuantity = (nextPos.initialQuantity * levels[i].qtyPct) / 100;
                          hits[i] = true;
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
                  if (config.useEMA7_25 && config.ema7_25_ExitLong && crossUnder(last.ema7, last.ema25, prev.ema7!, prev.ema25!)) {
                      exitReason = 'EMA死叉平多';
                      isSignalExit = true;
                  } else if (config.useMACD && config.macdExitLong && crossUnder(last.macdLine!, last.macdSignal!, prev.macdLine!, prev.macdSignal!)) {
                      exitReason = 'MACD死叉平多';
                      isSignalExit = true;
                  }
              } else {
                  if (config.useEMA7_25 && config.ema7_25_ExitShort && crossOver(last.ema7, last.ema25, prev.ema7!, prev.ema25!)) {
                      exitReason = 'EMA金叉平空';
                      isSignalExit = true;
                  } else if (config.useMACD && config.macdExitShort && crossOver(last.macdLine!, last.macdSignal!, prev.macdLine!, prev.macdSignal!)) {
                      exitReason = 'MACD金叉平空';
                      isSignalExit = true;
                  }
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
                    ...nextPos,
                    direction: 'FLAT', pendingSignal: 'NONE', pendingSignalSource: '', initialQuantity: 0, remainingQuantity: 0, 
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
          const isLongBlocked = config.trendFilterBlockLong && (last.ema7 < last.ema25 || last.ema25 < last.ema99);
          const isShortBlocked = config.trendFilterBlockShort && (last.ema7 > last.ema25 || last.ema25 > last.ema99);

          let rawEntryReason = '';
          let rawDirection: 'LONG' | 'SHORT' | 'NONE' = 'NONE';
          let isEMA7_25_BaseEvent = false; // 此变量标记：本次信号是否属于 EMA7/25 体系（金叉、死叉、或基于它们的回归）

          if (config.usePriceReturnEMA7) {
              if (nextPos.pendingSignal === 'NONE') {
                  let source = '';
                  if (config.useEMA7_25 && config.ema7_25_Long && crossOver(last.ema7, last.ema25, prev.ema7!, prev.ema25!)) { source = 'EMA金叉'; }
                  else if (config.useMACD && config.macdLong && crossOver(last.macdLine!, last.macdSignal!, prev.macdLine!, prev.macdSignal!)) source = 'MACD金叉';

                  if (source && !isLongBlocked) {
                      if (isPriceTooFar(last.ema7, config.priceReturnDist)) {
                          nextPos.pendingSignal = 'LONG';
                          nextPos.pendingSignalSource = source;
                      } else if (checkPullbackTouch(last.ema7, config.priceReturnDist, 'UP')) {
                          rawDirection = 'LONG';
                          rawEntryReason = `${source} + EMA7回归确认`;
                          if (source.includes('EMA')) isEMA7_25_BaseEvent = true;
                      }
                  } else {
                      if (config.useEMA7_25 && config.ema7_25_Short && crossUnder(last.ema7, last.ema25, prev.ema7!, prev.ema25!)) { source = 'EMA死叉'; }
                      else if (config.useMACD && config.macdShort && crossUnder(last.macdLine!, last.macdSignal!, prev.macdLine!, prev.macdSignal!)) source = 'MACD死叉';

                      if (source && !isShortBlocked) {
                          if (isPriceTooFar(last.ema7, config.priceReturnDist)) {
                              nextPos.pendingSignal = 'SHORT';
                              nextPos.pendingSignalSource = source;
                          } else if (checkPullbackTouch(last.ema7, config.priceReturnDist, 'DOWN')) {
                              rawDirection = 'SHORT';
                              rawEntryReason = `${source} + EMA7回归确认`;
                              if (source.includes('EMA')) isEMA7_25_BaseEvent = true;
                          }
                      }
                  }
              } else {
                  // 已有挂起信号，监测回踩
                  if (nextPos.pendingSignal === 'LONG' && isEMA7_25_Up && !isLongBlocked) {
                      if (checkPullbackTouch(last.ema7, config.priceReturnDist, 'UP')) {
                          rawDirection = 'LONG';
                          rawEntryReason = `${nextPos.pendingSignalSource || 'EMA金叉'} + EMA7回归确认`;
                          if (rawEntryReason.includes('EMA')) isEMA7_25_BaseEvent = true;
                      }
                  } else if (nextPos.pendingSignal === 'SHORT' && isEMA7_25_Down && !isShortBlocked) {
                      if (checkPullbackTouch(last.ema7, config.priceReturnDist, 'DOWN')) {
                          rawDirection = 'SHORT';
                          rawEntryReason = `${nextPos.pendingSignalSource || 'EMA死叉'} + EMA7回归确认`;
                          if (rawEntryReason.includes('EMA')) isEMA7_25_BaseEvent = true;
                      }
                  }
                  // 趋势失效检测
                  if (nextPos.pendingSignal === 'LONG' && isEMA7_25_Down) nextPos.pendingSignal = 'NONE';
                  if (nextPos.pendingSignal === 'SHORT' && isEMA7_25_Up) nextPos.pendingSignal = 'NONE';
              }
          } else {
              // 普通模式
              if (config.useEMA7_25) {
                  if (config.ema7_25_Long && !isLongBlocked && crossOver(last.ema7, last.ema25, prev.ema7!, prev.ema25!)) { rawDirection = 'LONG'; rawEntryReason = 'EMA金叉'; isEMA7_25_BaseEvent = true; }
                  else if (config.ema7_25_Short && !isShortBlocked && crossUnder(last.ema7, last.ema25, prev.ema7!, prev.ema25!)) { rawDirection = 'SHORT'; rawEntryReason = 'EMA死叉'; isEMA7_25_BaseEvent = true; }
              }
              if (rawDirection === 'NONE' && config.useMACD) {
                  if (config.macdLong && !isLongBlocked && crossOver(last.macdLine!, last.macdSignal!, prev.macdLine!, prev.macdSignal!)) { rawDirection = 'LONG'; rawEntryReason = 'MACD金叉'; }
                  else if (config.macdShort && !isShortBlocked && crossUnder(last.macdLine!, last.macdSignal!, prev.macdLine!, prev.macdSignal!)) { rawDirection = 'SHORT'; rawEntryReason = 'MACD死叉'; }
              }
          }

          // --- 核心：延后开仓执行 ---
          if (rawDirection !== 'NONE') {
              if (config.useDelayedEntry && isEMA7_25_BaseEvent) {
                  const isDirectionMatch = 
                      config.delayedEntryType === 'BOTH' || 
                      (config.delayedEntryType === 'LONG' && rawDirection === 'LONG') ||
                      (config.delayedEntryType === 'SHORT' && rawDirection === 'SHORT');

                  // 时间检测：信号时间 >= 开启延后后的激活时间
                  if (last.time >= config.delayedEntryActivationTime && isDirectionMatch) {
                      // 1. 计数累加（同一根K线只计一次）
                      if (nextPos.lastCountedSignalTime !== last.time) {
                          nextPos.delayedEntryCurrentCount++;
                          nextPos.lastCountedSignalTime = last.time;
                      }
                      
                      // 2. 检查是否达到目标值
                      if (nextPos.delayedEntryCurrentCount >= config.delayedEntryTargetCount) {
                          intendedDirection = rawDirection;
                          entryReason = `延后触发(#${nextPos.delayedEntryCurrentCount}): ${rawEntryReason}`;
                      } else {
                          // 未达次数，必须清除 pendingSignal 状态以便监听下一次
                          nextPos.pendingSignal = 'NONE';
                          nextPos.pendingSignalSource = '';
                      }
                  } else {
                      // 信号不匹配方向或时间未到，清理状态，不计数
                      nextPos.pendingSignal = 'NONE';
                      nextPos.pendingSignalSource = '';
                  }
              } else {
                  // 非延迟模式或非 EMA7/25 事件（如 MACD 信号），直接执行
                  intendedDirection = rawDirection;
                  entryReason = rawEntryReason;
              }
          }
      }
  }

  if (intendedDirection !== 'NONE') {
      const qty = config.tradeAmount / last.close;
      if (qty > 0) {
          actions.push({
            secret: config.secret,
            action: intendedDirection === 'LONG' ? 'buy' : 'sell',
            position: intendedDirection.toLowerCase(),
            symbol: config.symbol,
            quantity: qty.toFixed(8),
            trade_amount: qty * last.close,
            timestamp: now.toISOString(),
            strategy_name: config.name,
            tp_level: entryReason,
            execution_price: last.close,
            execution_quantity: qty
          });
          
          nextPos = {
              ...nextPos,
              direction: intendedDirection,
              pendingSignal: 'NONE',
              pendingSignalSource: '',
              initialQuantity: qty,
              remainingQuantity: qty,
              entryPrice: last.close,
              highestPrice: last.high,
              lowestPrice: last.low,
              openTime: now.getTime(),
              tpLevelsHit: new Array(4).fill(false),
              slLevelsHit: new Array(4).fill(false),
              delayedEntryCurrentCount: 0,
              lastCountedSignalTime: 0
          };
          nextStats.dailyTradeCount++;
          nextStats.lastActionCandleTime = currentCandleTime;
      }
  }

  return { newPositionState: nextPos, newTradeStats: nextStats, actions };
};
