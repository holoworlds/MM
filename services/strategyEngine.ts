
import { Candle, StrategyConfig, PositionState, TradeStats, WebhookPayload, StrategyState, SignalSourceType } from "../types";

// --- 交叉事件辅助函数 ---
const crossOver = (currA: number, currB: number, prevA: number, prevB: number) => prevA <= prevB && currA > currB;
const crossUnder = (currA: number, currB: number, prevA: number, prevB: number) => prevA >= prevB && currA < currB;

/**
 * 扫描所有启用的信号，返回触发的“交叉事件”
 */
const scanSignals = (config: StrategyConfig, last: Candle, prev: Candle): { 
    openDir: 'LONG' | 'SHORT' | 'NONE', 
    closeDir: 'LONG' | 'SHORT' | 'NONE',
    type: SignalSourceType 
} => {
    // 1. EMA 7/25
    if (config.useEMA7_25 && last.ema7 && last.ema25 && prev.ema7 && prev.ema25) {
        if (crossOver(last.ema7, last.ema25, prev.ema7, prev.ema25)) {
            return { openDir: config.ema7_25_Long ? 'LONG' : 'NONE', closeDir: config.ema7_25_ExitShort ? 'SHORT' : 'NONE', type: 'EMA7_25' };
        }
        if (crossUnder(last.ema7, last.ema25, prev.ema7, prev.ema25)) {
            return { openDir: config.ema7_25_Short ? 'SHORT' : 'NONE', closeDir: config.ema7_25_ExitLong ? 'LONG' : 'NONE', type: 'EMA7_25' };
        }
    }
    // 2. EMA 7/99
    if (config.useEMA7_99 && last.ema7 && last.ema99 && prev.ema7 && prev.ema99) {
        if (crossOver(last.ema7, last.ema99, prev.ema7, prev.ema99)) {
            return { openDir: config.ema7_99_Long ? 'LONG' : 'NONE', closeDir: config.ema7_99_ExitShort ? 'SHORT' : 'NONE', type: 'EMA7_99' };
        }
        if (crossUnder(last.ema7, last.ema99, prev.ema7, prev.ema99)) {
            return { openDir: config.ema7_99_Short ? 'SHORT' : 'NONE', closeDir: config.ema7_99_ExitLong ? 'LONG' : 'NONE', type: 'EMA7_99' };
        }
    }
    // 3. EMA 25/99
    if (config.useEMA25_99 && last.ema25 && last.ema99 && prev.ema25 && prev.ema99) {
        if (crossOver(last.ema25, last.ema99, prev.ema25, prev.ema99)) {
            return { openDir: config.ema25_99_Long ? 'LONG' : 'NONE', closeDir: config.ema25_99_ExitShort ? 'SHORT' : 'NONE', type: 'EMA25_99' };
        }
        if (crossUnder(last.ema25, last.ema99, prev.ema25, prev.ema99)) {
            return { openDir: config.ema25_99_Short ? 'SHORT' : 'NONE', closeDir: config.ema25_99_ExitLong ? 'LONG' : 'NONE', type: 'EMA25_99' };
        }
    }
    // 4. Double EMA (7/25) vs 99
    if (config.useEMADouble && last.ema7 && last.ema25 && last.ema99 && prev.ema7 && prev.ema25 && prev.ema99) {
        const lastShort = (last.ema7 + last.ema25) / 2;
        const prevShort = (prev.ema7 + prev.ema25) / 2;
        if (crossOver(lastShort, last.ema99, prevShort, prev.ema99)) {
            return { openDir: config.emaDoubleLong ? 'LONG' : 'NONE', closeDir: config.emaDoubleExitShort ? 'SHORT' : 'NONE', type: 'DOUBLE_EMA' };
        }
        if (crossUnder(lastShort, last.ema99, prevShort, prev.ema99)) {
            return { openDir: config.emaDoubleShort ? 'SHORT' : 'NONE', closeDir: config.emaDoubleExitLong ? 'LONG' : 'NONE', type: 'DOUBLE_EMA' };
        }
    }
    // 5. MACD
    if (config.useMACD && last.macdLine !== undefined && last.macdSignal !== undefined && prev.macdLine !== undefined && prev.macdSignal !== undefined) {
        if (crossOver(last.macdLine, last.macdSignal, prev.macdLine, prev.macdSignal)) {
            return { openDir: config.macdLong ? 'LONG' : 'NONE', closeDir: config.macdExitShort ? 'SHORT' : 'NONE', type: 'MACD' };
        }
        if (crossUnder(last.macdLine, last.macdSignal, prev.macdLine, prev.macdSignal)) {
            return { openDir: config.macdShort ? 'SHORT' : 'NONE', closeDir: config.macdExitLong ? 'LONG' : 'NONE', type: 'MACD' };
        }
    }

    return { openDir: 'NONE', closeDir: 'NONE', type: 'NONE' };
};

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

  if (candles.length < 50 || !config.isActive) return { newPositionState: nextPos, newTradeStats: nextStats, actions };

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  
  const isEventTriggered = config.triggerOnClose ? last.isClosed : true;
  if (!isEventTriggered) return { newPositionState: nextPos, newTradeStats: nextStats, actions };

  switch (nextPos.state) {
    case StrategyState.IDLE: {
      if (config.manualTakeover) break;
      const { openDir, type } = scanSignals(config, last, prev);
      
      if (openDir !== 'NONE') {
        // --- 全局趋势拦截过滤 (基于负向逻辑) ---
        // 做多拦截：当排列为 7 < 25 < 99 时，拦截一切做多信号
        if (openDir === 'LONG' && config.trendFilterBlockLong) {
            if (last.ema7! < last.ema25! && last.ema25! < last.ema99!) break;
        }
        // 做空拦截：当排列为 7 > 25 > 99 时，拦截一切做空信号
        if (openDir === 'SHORT' && config.trendFilterBlockShort) {
            if (last.ema7! > last.ema25! && last.ema25! > last.ema99!) break;
        }
        
        // 信号锁定
        nextPos.pendingSignal = openDir;
        nextPos.pendingSignalType = type;
        nextPos.pendingSignalSource = type;
        nextPos.pendingSignalCandleTime = last.time;
        
        if (config.usePriceReturnEMA7) {
          nextPos.state = StrategyState.ENTRY_ARMED;
        } else {
          executeOpen(actions, config, nextPos, nextStats, last);
        }
      }
      break;
    }

    case StrategyState.ENTRY_ARMED: {
      if (config.manualTakeover) { nextPos.state = StrategyState.IDLE; break; }
      
      // 检查原交叉信号是否已经因为反向交叉失效
      const { openDir, type } = scanSignals(config, last, prev);
      if (openDir !== 'NONE' && type === nextPos.pendingSignalType && openDir !== nextPos.pendingSignal) {
          nextPos.state = StrategyState.IDLE;
          nextPos.pendingSignal = 'NONE';
          break;
      }

      // 回归开仓判定 (穿越逻辑)
      if (last.ema7 && prev.ema7) {
        const currDiff = (last.ema7 - last.close) / last.ema7 * 100;
        const prevDiff = (prev.ema7 - prev.close) / prev.ema7 * 100;
        const target = config.priceReturnBelowEma7Pct;
        
        let reached = false;
        if (target >= 0) {
            reached = prevDiff < target && currDiff >= target;
        } else {
            reached = prevDiff > target && currDiff <= target;
        }
        
        if (reached) {
            executeOpen(actions, config, nextPos, nextStats, last, `回归触发(${nextPos.pendingSignalSource})`);
        }
      }
      break;
    }

    case StrategyState.IN_POSITION_LONG:
    case StrategyState.IN_POSITION_SHORT:
    case StrategyState.MANUAL_TAKEOVER_LONG:
    case StrategyState.MANUAL_TAKEOVER_SHORT: {
      updateTrailingHighLow(nextPos, last);
      const isLong = nextPos.direction === 'LONG';
      const pnlPct = isLong 
        ? (last.close - nextPos.entryPrice) / nextPos.entryPrice * 100
        : (nextPos.entryPrice - last.close) / nextPos.entryPrice * 100;
      
      let exitReason = '';
      let reverseDir: 'LONG' | 'SHORT' | 'NONE' = 'NONE';
      let reverseType: SignalSourceType = 'NONE';

      if (config.useTrailingStop) {
        const actPrice = isLong ? nextPos.entryPrice * (1 + config.trailActivation/100) : nextPos.entryPrice * (1 - config.trailActivation/100);
        if ((isLong && nextPos.highestPrice >= actPrice) || (!isLong && nextPos.lowestPrice <= actPrice)) {
            const stopPrice = isLong ? nextPos.highestPrice * (1 - config.trailDistance/100) : nextPos.lowestPrice * (1 + config.trailDistance/100);
            if ((isLong && last.close <= stopPrice) || (!isLong && last.close >= stopPrice)) exitReason = '追踪止盈';
        }
      }

      if (!exitReason && config.useMultiTPSL) {
        for (let i = 0; i < config.tpLevels.length; i++) {
          if (config.tpLevels[i].active && !nextPos.tpLevelsHit[i] && pnlPct >= config.tpLevels[i].pct) {
            executePartialClose(actions, config, nextPos, nextStats, last, `分批止盈#${i+1}`, i, 'TP');
            if ((nextPos.state as any) === StrategyState.EXIT_PENDING) break;
          }
        }
        if ((nextPos.state as any) !== StrategyState.EXIT_PENDING) {
          for (let i = 0; i < config.slLevels.length; i++) {
            if (config.slLevels[i].active && !nextPos.slLevelsHit[i] && pnlPct <= -config.slLevels[i].pct) {
                executePartialClose(actions, config, nextPos, nextStats, last, `分批止损#${i+1}`, i, 'SL');
                if ((nextPos.state as any) === StrategyState.EXIT_PENDING) break;
            }
          }
        }
      }

      if (!exitReason && (nextPos.state as any) !== StrategyState.EXIT_PENDING && config.useFixedTPSL) {
        if (pnlPct >= config.takeProfitPct) exitReason = '全仓固定止盈';
        else if (pnlPct <= -config.stopLossPct) exitReason = '全仓固定止损';
      }

      if (!exitReason && (nextPos.state as any) !== StrategyState.EXIT_PENDING) {
        const { openDir, closeDir, type } = scanSignals(config, last, prev);
        const isCloseSignal = (isLong && closeDir === 'LONG') || (!isLong && closeDir === 'SHORT');
        
        if (isCloseSignal) {
          exitReason = `指标平仓(${type})`;
          if (config.useReverse && !config.manualTakeover) {
            if ((isLong && openDir === 'SHORT' && config.reverseLongToShort) || (!isLong && openDir === 'LONG' && config.reverseShortToLong)) {
                reverseDir = openDir as any;
                reverseType = type;
                exitReason = `反手信号(${type})`;
            }
          }
        }
      }

      if (exitReason) {
        executeClose(actions, config, nextPos, nextStats, last, exitReason, reverseDir, reverseType);
      }
      break;
    }

    case StrategyState.EXIT_PENDING: {
      if (nextPos.pendingSignal !== 'NONE') {
        executeOpen(actions, config, nextPos, nextStats, last, `[反手开仓]${nextPos.pendingSignalSource}`);
      } else {
        nextPos.state = StrategyState.IDLE;
        nextPos.direction = 'FLAT';
      }
      break;
    }
  }

  return { newPositionState: nextPos, newTradeStats: nextStats, actions };
};

function executeOpen(actions: WebhookPayload[], config: StrategyConfig, nextPos: PositionState, nextStats: TradeStats, last: Candle, reason?: string) {
  if (nextStats.dailyTradeCount >= config.maxDailyTrades) return;
  const dir = nextPos.pendingSignal;
  const qty = config.tradeAmount / last.close;
  actions.push({
    secret: config.secret,
    action: dir === 'LONG' ? 'buy' : 'sell',
    position: dir!.toLowerCase(),
    symbol: config.symbol,
    quantity: qty.toFixed(8),
    trade_amount: qty * last.close,
    timestamp: new Date().toISOString(),
    strategy_name: config.name,
    tp_level: reason || `信号触发(${nextPos.pendingSignalSource})`,
    execution_price: last.close,
    execution_quantity: qty
  });
  nextPos.state = dir === 'LONG' ? StrategyState.IN_POSITION_LONG : StrategyState.IN_POSITION_SHORT;
  nextPos.direction = dir as any;
  nextPos.entryPrice = last.close;
  nextPos.initialQuantity = qty;
  nextPos.remainingQuantity = qty;
  nextPos.openTime = Date.now();
  nextPos.highestPrice = last.close;
  nextPos.lowestPrice = last.close;
  nextPos.pendingSignal = 'NONE';
  nextPos.tpLevelsHit = new Array(4).fill(false);
  nextPos.slLevelsHit = new Array(4).fill(false);
  nextStats.dailyTradeCount++;
}

function executePartialClose(actions: WebhookPayload[], config: StrategyConfig, nextPos: PositionState, nextStats: TradeStats, last: Candle, reason: string, levelIdx: number, type: 'TP'|'SL') {
  const isLong = nextPos.direction === 'LONG';
  const level = type === 'TP' ? config.tpLevels[levelIdx] : config.slLevels[levelIdx];
  let qtyToClose = nextPos.initialQuantity * (level.qtyPct / 100);
  if (qtyToClose > nextPos.remainingQuantity) qtyToClose = nextPos.remainingQuantity;
  actions.push({
    secret: config.secret,
    action: isLong ? 'sell' : 'buy',
    position: 'partial',
    symbol: config.symbol,
    quantity: qtyToClose.toFixed(8),
    trade_amount: qtyToClose * last.close,
    timestamp: new Date().toISOString(),
    strategy_name: config.name,
    tp_level: reason,
    execution_price: last.close,
    execution_quantity: qtyToClose
  });
  nextPos.remainingQuantity -= qtyToClose;
  if (type === 'TP') nextPos.tpLevelsHit[levelIdx] = true; else nextPos.slLevelsHit[levelIdx] = true;
  if (nextPos.remainingQuantity < nextPos.initialQuantity * 0.01) {
    nextPos.state = StrategyState.EXIT_PENDING;
    nextPos.direction = 'FLAT';
  }
}

function executeClose(actions: WebhookPayload[], config: StrategyConfig, nextPos: PositionState, nextStats: TradeStats, last: Candle, reason: string, reverseDir: 'LONG'|'SHORT'|'NONE', reverseType: SignalSourceType) {
  const isLong = nextPos.direction === 'LONG';
  actions.push({
    secret: config.secret,
    action: isLong ? 'sell' : 'buy',
    position: 'flat',
    symbol: config.symbol,
    quantity: nextPos.remainingQuantity.toFixed(8),
    trade_amount: nextPos.remainingQuantity * last.close,
    timestamp: new Date().toISOString(),
    strategy_name: config.name,
    tp_level: reason,
    execution_price: last.close,
    execution_quantity: nextPos.remainingQuantity
  });
  nextPos.state = StrategyState.EXIT_PENDING;
  nextPos.direction = 'FLAT';
  nextPos.pendingSignal = reverseDir;
  nextPos.pendingSignalType = reverseType;
  nextPos.pendingSignalSource = reason;
}

function updateTrailingHighLow(pos: PositionState, last: Candle) {
    if (pos.direction === 'LONG') pos.highestPrice = Math.max(pos.highestPrice || last.close, last.high);
    else if (pos.direction === 'SHORT') pos.lowestPrice = (!pos.lowestPrice || pos.lowestPrice === 0) ? last.low : Math.min(pos.lowestPrice, last.low);
}
