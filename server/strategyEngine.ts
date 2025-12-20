
import { Candle, StrategyConfig, PositionState, TradeStats, WebhookPayload } from "../types";

// --- 基础辅助函数 ---
const crossOver = (currA: number, currB: number, prevA: number, prevB: number) => prevA <= prevB && currA > currB;
const crossUnder = (currA: number, currB: number, prevA: number, prevB: number) => prevA >= prevB && currA < currB;

export interface StrategyResult {
  newPositionState: PositionState;
  newTradeStats: TradeStats;
  actions: WebhookPayload[];
}

/**
 * 核心策略引擎：采用“信号-闸门-执行”三段式架构
 */
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

  // 1. 基础状态更新
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

  // ---------------------------------------------------------
  // 第一层：闸门预检 (Gate Layer - Pre-check)
  // ---------------------------------------------------------

  // A. 收盘触发检查
  const isSignalTrigger = config.triggerOnClose ? last.isClosed : true;
  if (!isSignalTrigger) {
    return { newPositionState: nextPos, newTradeStats: nextStats, actions };
  }

  // B. 每日限额检查
  const isAtTradeLimit = nextStats.dailyTradeCount >= config.maxDailyTrades;
  const isSameCandleAction = tradeStats.lastActionCandleTime === currentCandleTime;

  if (last.ema7 === undefined || last.ema25 === undefined || last.ema99 === undefined) {
    return { newPositionState: nextPos, newTradeStats: nextStats, actions };
  }

  // ---------------------------------------------------------
  // 第二层：平仓逻辑 (Exit Execution Layer)
  // ---------------------------------------------------------
  // 即使在 manualTakeover 模式下，也要运行平仓逻辑，除非手动接管是指“全手动”
  // 这里实现为：手动接管开启后，系统不再自动开仓，但会根据注入的持仓参数继续运行风控与自动平仓
  
  let exitReason = '';
  let exitQuantity = 0;
  let forceReverse = false;

  if (nextPos.direction !== 'FLAT') {
    const isLong = nextPos.direction === 'LONG';
    const pnlPct = isLong 
        ? (last.close - nextPos.entryPrice) / nextPos.entryPrice * 100
        : (nextPos.entryPrice - last.close) / nextPos.entryPrice * 100;

    // 1. 固定止盈止损
    if (config.useFixedTPSL) {
        if (pnlPct >= config.takeProfitPct) exitReason = `固定止盈(${config.takeProfitPct}%)`;
        else if (pnlPct <= -config.stopLossPct) exitReason = `固定止损(-${config.stopLossPct}%)`;
    }

    // 2. 多级止盈
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

    // 3. 追踪止盈
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

    // 4. 指标反转平仓 (组合判断)
    if (!exitReason) {
        if (isLong) {
            if (config.useEMA7_25 && config.ema7_25_ExitLong && crossUnder(last.ema7, last.ema25, prev.ema7!, prev.ema25!)) {
                exitReason = 'EMA7/25死叉平多';
                if (config.useReverse && config.reverseLongToShort) forceReverse = true;
            }
            else if (config.useEMA7_99 && config.ema7_99_ExitLong && crossUnder(last.ema7, last.ema99, prev.ema7!, prev.ema99!)) exitReason = 'EMA7/99死叉平多';
            else if (config.useEMA25_99 && config.ema25_99_ExitLong && crossUnder(last.ema25, last.ema99, prev.ema25!, prev.ema99!)) exitReason = 'EMA25/99死叉平多';
            else if (config.useEMADouble && config.emaDoubleExitLong && (last.ema7 < last.ema99 || last.ema25 < last.ema99)) exitReason = '双EMA跌破过滤线平多';
            else if (config.useMACD && config.macdExitLong && last.macdLine! < last.macdSignal!) exitReason = 'MACD死叉平多';
        } else {
            if (config.useEMA7_25 && config.ema7_25_ExitShort && crossOver(last.ema7, last.ema25, prev.ema7!, prev.ema25!)) {
                exitReason = 'EMA7/25金叉平空';
                if (config.useReverse && config.reverseShortToLong) forceReverse = true;
            }
            else if (config.useEMA7_99 && config.ema7_99_ExitShort && crossOver(last.ema7, last.ema99, prev.ema7!, prev.ema99!)) exitReason = 'EMA7/99金叉平空';
            else if (config.useEMA25_99 && config.ema25_99_ExitShort && crossOver(last.ema25, last.ema99, prev.ema25!, prev.ema99!)) exitReason = 'EMA25/99金叉平空';
            else if (config.useEMADouble && config.emaDoubleExitShort && (last.ema7 > last.ema99 || last.ema25 > last.ema99)) exitReason = '双EMA上破过滤线平空';
            else if (config.useMACD && config.macdExitShort && last.macdLine! > last.macdSignal!) exitReason = 'MACD金叉平空';
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
              pendingSignal: 'NONE' 
            };
            nextStats.lastActionCandleTime = currentCandleTime;
            // 平仓也计入每日限制
            nextStats.dailyTradeCount++;
        } else {
            nextPos.remainingQuantity -= actualQty;
        }
    }
  }

  // ---------------------------------------------------------
  // 第三层：信号产生层 (Signal Layer)
  // ---------------------------------------------------------
  let detectedDir: 'LONG' | 'SHORT' | 'NONE' = 'NONE';
  let detectedReason = '';

  // 关键修正：如果开启手动接管，屏蔽所有自动信号的开仓
  const entryBlockedByManual = config.manualTakeover;

  if (nextPos.direction === 'FLAT' && !isAtTradeLimit && !entryBlockedByManual) {
      // 允许在平仓后的同一根K线执行反手
      const canEntryNow = (tradeStats.lastActionCandleTime !== currentCandleTime) || forceReverse;

      if (canEntryNow) {
          // EMA 7/25 交叉
          if (config.useEMA7_25) {
              if (config.ema7_25_Long && crossOver(last.ema7, last.ema25, prev.ema7!, prev.ema25!)) { detectedDir = 'LONG'; detectedReason = 'EMA7/25金叉'; }
              else if (config.ema7_25_Short && crossUnder(last.ema7, last.ema25, prev.ema7!, prev.ema25!)) { detectedDir = 'SHORT'; detectedReason = 'EMA7/25死叉'; }
          }
          // EMA 7/99 交叉
          if (detectedDir === 'NONE' && config.useEMA7_99) {
              if (config.ema7_99_Long && crossOver(last.ema7, last.ema99, prev.ema7!, prev.ema99!)) { detectedDir = 'LONG'; detectedReason = 'EMA7/99金叉'; }
              else if (detectedDir === 'NONE' && config.ema7_99_Short && crossUnder(last.ema7, last.ema99, prev.ema7!, prev.ema99!)) { detectedDir = 'SHORT'; detectedReason = 'EMA7/99死叉'; }
          }
          // EMA 25/99 交叉
          if (detectedDir === 'NONE' && config.useEMA25_99) {
              if (config.ema25_99_Long && crossOver(last.ema25, last.ema99, prev.ema25!, prev.ema99!)) { detectedDir = 'LONG'; detectedReason = 'EMA25/99金叉'; }
              else if (detectedDir === 'NONE' && config.ema25_99_Short && crossUnder(last.ema25, last.ema99, prev.ema25!, prev.ema99!)) { detectedDir = 'SHORT'; detectedReason = 'EMA25/99死叉'; }
          }
          // MACD 交叉
          if (detectedDir === 'NONE' && config.useMACD) {
              if (config.macdLong && crossOver(last.macdLine!, last.macdSignal!, prev.macdLine!, prev.macdSignal!)) { detectedDir = 'LONG'; detectedReason = 'MACD金叉'; }
              else if (detectedDir === 'NONE' && config.macdShort && crossUnder(last.macdLine!, last.macdSignal!, prev.macdLine!, prev.macdSignal!)) { detectedDir = 'SHORT'; detectedReason = 'MACD死叉'; }
          }
          
          if (forceReverse) {
              detectedReason = `[反手] ${detectedReason}`;
          }
      }
  }

  // ---------------------------------------------------------
  // 第四层：开仓闸门层 (Entry Gate Layer)
  // ---------------------------------------------------------
  
  if (detectedDir === 'LONG' && config.trendFilterBlockLong) {
      const isTrendBullish = last.ema7 > last.ema25 && last.ema25 > last.ema99;
      if (!isTrendBullish) detectedDir = 'NONE';
  }
  if (detectedDir === 'SHORT' && config.trendFilterBlockShort) {
      const isTrendBearish = last.ema7 < last.ema25 && last.ema25 < last.ema99;
      if (!isTrendBearish) detectedDir = 'NONE';
  }

  if (detectedDir !== 'NONE' && config.useDelayedEntry) {
      const isTypeMatch = config.delayedEntryType === 'BOTH' || 
                         (config.delayedEntryType === 'LONG' && detectedDir === 'LONG') ||
                         (config.delayedEntryType === 'SHORT' && detectedDir === 'SHORT');
      
      if (last.time >= config.delayedEntryActivationTime && isTypeMatch) {
          if (nextPos.lastCountedSignalTime !== last.time) {
              nextPos.delayedEntryCurrentCount++;
              nextPos.lastCountedSignalTime = last.time;
          }
          if (nextPos.delayedEntryCurrentCount < config.delayedEntryTargetCount) {
              detectedDir = 'NONE';
          }
      } else {
          detectedDir = 'NONE';
      }
  }

  if (detectedDir !== 'NONE' && config.usePriceReturnEMA7) {
      const distPct = Math.abs(last.close - last.ema7) / last.ema7 * 100;
      if (distPct > config.priceReturnDist) {
          nextPos.pendingSignal = detectedDir;
          nextPos.pendingSignalSource = detectedReason;
          detectedDir = 'NONE';
      }
  }

  if (nextPos.pendingSignal !== 'NONE' && detectedDir === 'NONE' && !entryBlockedByManual) {
      const distPct = Math.abs(last.close - last.ema7) / last.ema7 * 100;
      if (distPct <= config.priceReturnDist) {
          detectedDir = nextPos.pendingSignal;
          detectedReason = `[回归确认] ${nextPos.pendingSignalSource}`;
          nextPos.pendingSignal = 'NONE';
          nextPos.pendingSignalSource = '';
      } else {
          const isInvalid = (nextPos.pendingSignal === 'LONG' && last.ema7 < last.ema25) || 
                            (nextPos.pendingSignal === 'SHORT' && last.ema7 > last.ema25);
          if (isInvalid) nextPos.pendingSignal = 'NONE';
      }
  }

  // ---------------------------------------------------------
  // 第五层：最终执行层 (Final Execution Layer)
  // ---------------------------------------------------------
  if (detectedDir !== 'NONE') {
      const qty = config.tradeAmount / last.close;
      if (qty > 0) {
          actions.push({
            secret: config.secret,
            action: detectedDir === 'LONG' ? 'buy' : 'sell',
            position: detectedDir.toLowerCase(),
            symbol: config.symbol,
            quantity: qty.toFixed(8),
            trade_amount: qty * last.close,
            timestamp: now.toISOString(),
            strategy_name: config.name,
            tp_level: detectedReason,
            execution_price: last.close,
            execution_quantity: qty
          });

          nextPos = {
              ...nextPos,
              direction: detectedDir,
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
