
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

  if (last.ema7 === undefined || last.ema25 === undefined || last.ema99 === undefined) {
    return { newPositionState: nextPos, newTradeStats: nextStats, actions };
  }
  
  // --- 指标状态 ---
  const isMACD_Long = last.macdLine !== undefined && last.macdSignal !== undefined && last.macdLine > last.macdSignal;
  const isMACD_Short = last.macdLine !== undefined && last.macdSignal !== undefined && last.macdLine < last.macdSignal;
  const isEMA7_25_Up = last.ema7 > last.ema25;
  const isEMA7_25_Down = last.ema7 < last.ema25;
  const isEMA7_99_Up = last.ema7 > last.ema99;
  const isEMA7_99_Down = last.ema7 < last.ema99;
  const isDoubleLongZone = last.ema7 > last.ema99 && last.ema25 > last.ema99;
  const isDoubleShortZone = last.ema7 < last.ema99 && last.ema25 < last.ema99;

  // --- 回归判定逻辑 ---
  const checkPullbackTouch = (ema7: number, distPct: number): boolean => {
      const buffer = ema7 * (distPct / 100);
      return (last.low <= ema7 + buffer && last.high >= ema7 - buffer);
  };

  const isPriceTooFar = (ema7: number, distPct: number): boolean => {
      const dist = Math.abs(last.close - ema7) / ema7 * 100;
      return dist > distPct;
  };

  // --- 1. 挂起信号的更新与失效逻辑 ---
  if (nextPos.direction === 'FLAT' && nextPos.pendingSignal !== 'NONE') {
      // 检查趋势是否依然存续，如果趋势反转，则撤销挂起信号
      if (nextPos.pendingSignal === 'LONG') {
          const trendInvalid = (config.useEMA7_25 && last.ema7 < last.ema25) || (config.useMACD && !isMACD_Long);
          if (trendInvalid) nextPos.pendingSignal = 'NONE';
      } else {
          const trendInvalid = (config.useEMA7_25 && last.ema7 > last.ema25) || (config.useMACD && !isMACD_Short);
          if (trendInvalid) nextPos.pendingSignal = 'NONE';
      }
  }

  // --- 2. 开仓状态机 ---
  let entryReason = '';
  const canTrade = nextStats.dailyTradeCount < config.maxDailyTrades && tradeStats.lastActionCandleTime !== currentCandleTime;

  if (canTrade && !config.manualTakeover && nextPos.direction === 'FLAT') {
      
      // A. 如果使用了“回归开仓”模式
      if (config.usePriceReturnEMA7) {
          
          // 如果还没有挂起的信号，寻找“第一阶段：趋势确认+价格偏离”
          if (nextPos.pendingSignal === 'NONE') {
              let trendConfirmed = false;
              if (config.useMACD && config.macdLong && isMACD_Long) trendConfirmed = true;
              else if (config.useEMA7_25 && config.ema7_25_Long && isEMA7_25_Up) trendConfirmed = true;
              else if (config.useEMA7_99 && config.ema7_99_Long && isEMA7_99_Up) trendConfirmed = true;
              else if (config.useEMADouble && config.emaDoubleLong && isDoubleLongZone) trendConfirmed = true;

              if (trendConfirmed) {
                  // 如果此时价格已经偏离，标记为挂起等待回归
                  if (isPriceTooFar(last.ema7, config.priceReturnDist)) {
                      nextPos.pendingSignal = 'LONG';
                  } else if (checkPullbackTouch(last.ema7, config.priceReturnDist)) {
                      // 如果确认趋势时价格刚好就在回归区，直接开仓
                      entryReason = '趋势确认(回踩中)';
                  }
              }

              // 空头检测
              if (!trendConfirmed && nextPos.pendingSignal === 'NONE') {
                  let trendConfirmedShort = false;
                  if (config.useMACD && config.macdShort && isMACD_Short) trendConfirmedShort = true;
                  else if (config.useEMA7_25 && config.ema7_25_Short && isEMA7_25_Down) trendConfirmedShort = true;
                  else if (config.useEMA7_99 && config.ema7_99_Short && isEMA7_99_Down) trendConfirmedShort = true;
                  else if (config.useEMADouble && config.emaDoubleShort && isDoubleShortZone) trendConfirmedShort = true;

                  if (trendConfirmedShort) {
                      if (isPriceTooFar(last.ema7, config.priceReturnDist)) {
                          nextPos.pendingSignal = 'SHORT';
                      } else if (checkPullbackTouch(last.ema7, config.priceReturnDist)) {
                          entryReason = '空头趋势确认(回踩中)';
                      }
                  }
              }
          } 
          
          // 如果已经有挂起的信号，执行“第二阶段：触碰 EMA7”
          if (nextPos.pendingSignal !== 'NONE' && entryReason === '') {
              if (nextPos.pendingSignal === 'LONG' && checkPullbackTouch(last.ema7, config.priceReturnDist)) {
                  entryReason = 'EMA7回归确认(多)';
              } else if (nextPos.pendingSignal === 'SHORT' && checkPullbackTouch(last.ema7, config.priceReturnDist)) {
                  entryReason = 'EMA7回归确认(空)';
              }
          }

      } else {
          // B. 标准瞬间交叉模式
          if (config.useMACD && config.macdLong && crossOver(last.macdLine!, last.macdSignal!, prev.macdLine!, prev.macdSignal!)) entryReason = 'MACD金叉';
          else if (config.useEMA7_25 && config.ema7_25_Long && crossOver(last.ema7, last.ema25, prev.ema7!, prev.ema25!)) entryReason = 'EMA7上穿25';
          else if (config.useEMA7_99 && config.ema7_99_Long && crossOver(last.ema7, last.ema99, prev.ema7!, prev.ema99!)) entryReason = 'EMA7上穿99';
          
          if (!entryReason) {
              if (config.useMACD && config.macdShort && crossUnder(last.macdLine!, last.macdSignal!, prev.macdLine!, prev.macdSignal!)) entryReason = 'MACD死叉';
              else if (config.useEMA7_25 && config.ema7_25_Short && crossUnder(last.ema7, last.ema25, prev.ema7!, prev.ema25!)) entryReason = 'EMA7下穿25';
          }
      }
  }

  // --- 3. 执行交易动作 ---
  const createPayload = (act: string, pos: string, comment: string, qty: number): WebhookPayload => ({
    secret: config.secret,
    action: act,
    position: pos,
    symbol: config.symbol,
    quantity: qty.toString(),
    trade_amount: qty * last.close,
    leverage: 5,
    timestamp: now.toISOString(),
    tv_exchange: "BINANCE",
    strategy_name: config.name,
    tp_level: comment,
    execution_price: last.close,
    execution_quantity: qty
  });

  // 处理平仓
  if (nextPos.direction !== 'FLAT') {
      const isLong = nextPos.direction === 'LONG';
      let exitReason = '';
      if (isLong) {
          if (config.useEMA7_25 && config.ema7_25_ExitLong && crossUnder(last.ema7, last.ema25, prev.ema7!, prev.ema25!)) exitReason = '趋势反转平多';
      } else {
          if (config.useEMA7_25 && config.ema7_25_ExitShort && crossOver(last.ema7, last.ema25, prev.ema7!, prev.ema25!)) exitReason = '趋势反转平空';
      }

      if (exitReason) {
          actions.push(createPayload(isLong ? 'sell' : 'buy', 'flat', exitReason, nextPos.remainingQuantity));
          // Fix: Ensure all properties of PositionState are present when resetting to FLAT
          // This fixes the Error on line 175
          nextPos = { 
            direction: 'FLAT', 
            pendingSignal: 'NONE',
            initialQuantity: 0, 
            remainingQuantity: 0, 
            entryPrice: 0, 
            highestPrice: 0, 
            lowestPrice: 0, 
            openTime: 0, 
            tpLevelsHit: [], 
            slLevelsHit: [],
            delayedEntryCurrentCount: 0,
            lastCountedSignalTime: 0
          };
          nextStats.dailyTradeCount++;
          nextStats.lastActionCandleTime = currentCandleTime;
      }
  }

  // 处理开仓执行
  if (nextPos.direction === 'FLAT' && entryReason !== '') {
      const direction = entryReason.includes('空') || entryReason.includes('死叉') ? 'SHORT' : 'LONG';
      const qty = config.tradeAmount / last.close;
      
      actions.push(createPayload(direction === 'LONG' ? 'buy' : 'sell', direction.toLowerCase(), entryReason, qty));
      
      // Fix: Ensure all properties of PositionState are present when creating a new position
      // This fixes the Error on line 200
      nextPos = {
          direction,
          pendingSignal: 'NONE', // 执行后清空挂起
          initialQuantity: qty,
          remainingQuantity: qty,
          entryPrice: last.close,
          highestPrice: direction === 'LONG' ? last.high : 0,
          lowestPrice: direction === 'SHORT' ? last.low : 0,
          openTime: now.getTime(),
          tpLevelsHit: [],
          slLevelsHit: [],
          delayedEntryCurrentCount: 0,
          lastCountedSignalTime: 0
      };
      nextStats.lastActionCandleTime = currentCandleTime;
  }

  return { newPositionState: nextPos, newTradeStats: nextStats, actions };
};
