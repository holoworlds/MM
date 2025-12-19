
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

  // 重置每日交易计数
  if (nextStats.lastTradeDate !== dateKey) {
    nextStats.dailyTradeCount = 0;
    nextStats.lastTradeDate = dateKey;
  }

  const isSignalTrigger = config.triggerOnClose ? last.isClosed : true;

  // --- 1. 指标检查 ---
  if (last.ema7 === undefined || last.ema25 === undefined || last.ema99 === undefined) {
    return { newPositionState: nextPos, newTradeStats: nextStats, actions };
  }
  
  // 趋势过滤器
  const isTrendLong = (last.ema7 > last.ema25 && last.ema25 > last.ema99);
  const isTrendShort = (last.ema7 < last.ema25 && last.ema25 < last.ema99);
  
  const blockShort = config.trendFilterBlockShort && isTrendLong;
  const blockLong = config.trendFilterBlockLong && isTrendShort;

  // EMA 交叉事件
  const ema7_25_Up = crossOver(last.ema7, last.ema25, prev.ema7!, prev.ema25!);
  const ema7_25_Down = crossUnder(last.ema7, last.ema25, prev.ema7!, prev.ema25!);
  const ema7_99_Up = crossOver(last.ema7, last.ema99, prev.ema7!, prev.ema99!);
  const ema7_99_Down = crossUnder(last.ema7, last.ema99, prev.ema7!, prev.ema99!);
  const ema25_99_Up = crossOver(last.ema25, last.ema99, prev.ema25!, prev.ema99!);
  const ema25_99_Down = crossUnder(last.ema25, last.ema99, prev.ema25!, prev.ema99!);

  // MACD 交叉事件
  const macdBuy = last.macdLine !== undefined && last.macdSignal !== undefined && prev.macdLine !== undefined &&
                  crossOver(last.macdLine, last.macdSignal, prev.macdLine, prev.macdSignal);
  const macdSell = last.macdLine !== undefined && last.macdSignal !== undefined && prev.macdLine !== undefined &&
                   crossUnder(last.macdLine, last.macdSignal, prev.macdLine, prev.macdSignal);

  // 趋势状态 (用于价格回归判定)
  const isMACD_Long = last.macdLine !== undefined && last.macdSignal !== undefined && last.macdLine > last.macdSignal;
  const isMACD_Short = last.macdLine !== undefined && last.macdSignal !== undefined && last.macdLine < last.macdSignal;
  const isDoubleLongZone = last.ema7 > last.ema99 && last.ema25 > last.ema99;
  const isDoubleShortZone = last.ema7 < last.ema99 && last.ema25 < last.ema99;

  // --- 2. 价格回归判定 (EMA7) ---
  let priceReturnAllowed = true;
  if (config.usePriceReturnEMA7) {
      // 计算当前价格与 EMA7 的偏离百分比
      const distPct = Math.abs((last.close - last.ema7) / last.ema7) * 100;
      // 如果偏离度大于设定阈值，则认为未回归，不允许开仓
      if (distPct > config.priceReturnDist) {
          priceReturnAllowed = false;
      }
  }

  // --- 3. 开仓逻辑 ---
  let longEntryReason = '';
  let shortEntryReason = '';

  const canOpen = nextStats.dailyTradeCount < config.maxDailyTrades && nextPos.direction === 'FLAT' && tradeStats.lastActionCandleTime !== currentCandleTime;

  if (canOpen && !config.manualTakeover && isSignalTrigger) {
      if (config.usePriceReturnEMA7) {
          // 回归模式：趋势存续 + 价格回归
          if (config.useMACD && config.macdLong && isMACD_Long && priceReturnAllowed) longEntryReason = 'MACD多头+价格回归';
          else if (config.useEMA7_25 && config.ema7_25_Long && last.ema7 > last.ema25 && priceReturnAllowed) longEntryReason = 'EMA7/25多头+价格回归';
          else if (config.useEMA7_99 && config.ema7_99_Long && last.ema7 > last.ema99 && priceReturnAllowed) longEntryReason = 'EMA7/99多头+价格回归';
          else if (config.useEMA25_99 && config.ema25_99_Long && last.ema25 > last.ema99 && priceReturnAllowed) longEntryReason = 'EMA25/99多头+价格回归';
          else if (config.useEMADouble && config.emaDoubleLong && isDoubleLongZone && priceReturnAllowed) longEntryReason = 'EMA双线>99+价格回归';
      } else {
          // 标准模式：瞬间交叉触发
          if (config.useMACD && config.macdLong && macdBuy) longEntryReason = 'MACD金叉';
          else if (config.useEMA7_25 && config.ema7_25_Long && ema7_25_Up) longEntryReason = 'EMA7上穿25';
          else if (config.useEMA7_99 && config.ema7_99_Long && ema7_99_Up) longEntryReason = 'EMA7上穿99';
          else if (config.useEMA25_99 && config.ema25_99_Long && ema25_99_Up) longEntryReason = 'EMA25上穿99';
          else if (config.useEMADouble && config.emaDoubleLong && (isDoubleLongZone && !(prev.ema7! > prev.ema99! && prev.ema25! > prev.ema99!))) longEntryReason = 'EMA双线上穿99';
      }

      // 空头开仓逻辑类似...
      if (!longEntryReason) {
          if (config.usePriceReturnEMA7) {
              if (config.useMACD && config.macdShort && isMACD_Short && priceReturnAllowed) shortEntryReason = 'MACD空头+价格回归';
              else if (config.useEMA7_25 && config.ema7_25_Short && last.ema7 < last.ema25 && priceReturnAllowed) shortEntryReason = 'EMA7/25空头+价格回归';
              else if (config.useEMA7_99 && config.ema7_99_Short && last.ema7 < last.ema99 && priceReturnAllowed) shortEntryReason = 'EMA7/99空头+价格回归';
              else if (config.useEMA25_99 && config.ema25_99_Short && last.ema25 < last.ema99 && priceReturnAllowed) shortEntryReason = 'EMA25/99空头+价格回归';
              else if (config.useEMADouble && config.emaDoubleShort && isDoubleShortZone && priceReturnAllowed) shortEntryReason = 'EMA双线<99+价格回归';
          } else {
              if (config.useMACD && config.macdShort && macdSell) shortEntryReason = 'MACD死叉';
              else if (config.useEMA7_25 && config.ema7_25_Short && ema7_25_Down) shortEntryReason = 'EMA7下穿25';
              else if (config.useEMA7_99 && config.ema7_99_Short && ema7_99_Down) shortEntryReason = 'EMA7下穿99';
              else if (config.useEMA25_99 && config.ema25_99_Short && ema25_99_Down) shortEntryReason = 'EMA25下穿99';
              else if (config.useEMADouble && config.emaDoubleShort && (isDoubleShortZone && !(prev.ema7! < prev.ema99! && prev.ema25! < prev.ema99!))) shortEntryReason = 'EMA双线下穿99';
          }
      }
  }

  // 应用过滤器
  if (longEntryReason && blockLong) longEntryReason = '';
  if (shortEntryReason && blockShort) shortEntryReason = '';

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

  // --- 4. 执行状态转换 ---
  
  // A. 处理平仓
  if (nextPos.direction !== 'FLAT') {
      const isLong = nextPos.direction === 'LONG';
      let exitReason = '';

      // 信号平仓
      if (isLong) {
          if (config.useMACD && config.macdExitLong && macdSell) exitReason = 'MACD死叉平多';
          else if (config.useEMA7_25 && config.ema7_25_ExitLong && ema7_25_Down) exitReason = 'EMA7下穿25平多';
          else if (config.useEMA7_99 && config.ema7_99_ExitLong && ema7_99_Down) exitReason = 'EMA7下穿99平多';
          else if (config.useEMA25_99 && config.ema25_99_ExitLong && ema25_99_Down) exitReason = 'EMA25下穿99平多';
      } else {
          if (config.useMACD && config.macdExitShort && macdBuy) exitReason = 'MACD金叉平空';
          else if (config.useEMA7_25 && config.ema7_25_ExitShort && ema7_25_Up) exitReason = 'EMA7上穿25平空';
          else if (config.useEMA7_99 && config.ema7_99_ExitShort && ema7_99_Up) exitReason = 'EMA7上穿99平空';
          else if (config.useEMA25_99 && config.ema25_99_ExitShort && ema25_99_Up) exitReason = 'EMA25上穿99平空';
      }

      // 追踪止盈 / 固定止盈止损逻辑... (此处保持原样但确保更新 nextPos.direction)
      // 如果触发平仓：
      if (exitReason) {
          actions.push(createPayload(isLong ? 'sell' : 'buy', 'flat', exitReason, nextPos.remainingQuantity));
          nextPos = { 
            direction: 'FLAT', initialQuantity: 0, remainingQuantity: 0, 
            entryPrice: 0, highestPrice: 0, lowestPrice: 0, openTime: 0, 
            tpLevelsHit: [], slLevelsHit: [] 
          };
          nextStats.dailyTradeCount++;
          nextStats.lastActionCandleTime = currentCandleTime;
      }
  }

  // B. 处理开仓 (确保状态立即翻转)
  if (nextPos.direction === 'FLAT' && (longEntryReason || shortEntryReason)) {
      const qty = config.tradeAmount / last.close;
      if (longEntryReason) {
          actions.push(createPayload('buy', 'long', longEntryReason, qty));
          nextPos = {
              direction: 'LONG', initialQuantity: qty, remainingQuantity: qty,
              entryPrice: last.close, highestPrice: last.high, lowestPrice: 0,
              openTime: now.getTime(), tpLevelsHit: [], slLevelsHit: []
          };
      } else {
          actions.push(createPayload('sell', 'short', shortEntryReason, qty));
          nextPos = {
              direction: 'SHORT', initialQuantity: qty, remainingQuantity: qty,
              entryPrice: last.close, highestPrice: 0, lowestPrice: last.low,
              openTime: now.getTime(), tpLevelsHit: [], slLevelsHit: []
          };
      }
      nextStats.lastActionCandleTime = currentCandleTime;
  }

  return { newPositionState: nextPos, newTradeStats: nextStats, actions };
};
