
export type SymbolType = string;
export type IntervalType = 
  | '1m' | '2m' | '3m' | '5m' | '6m' | '10m' | '15m' | '20m' | '30m' | '45m' 
  | '1h' | '2h' | '3h' | '4h' | '6h' | '8h' | '10h' | '12h' 
  | '1d' | '2d' | '3d' | '1w' | '1M';

export type MarketType = 'CRYPTO';

export interface Candle {
  symbol: string;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
  ema7?: number;
  ema25?: number;
  ema99?: number;
  macdLine?: number;
  macdSignal?: number;
  macdHist?: number;
}

export interface WebhookPayload {
  secret?: string;
  action: string;
  position: string;
  symbol: string;
  quantity: string; 
  trade_amount?: number; 
  leverage?: number;
  timestamp?: string;
  tv_exchange?: string;
  strategy_name?: string;
  tp_level?: string;
  execution_price?: number;
  execution_quantity?: number;
}

export interface AlertLog {
  id: string;
  strategyId: string;
  strategyName: string;
  timestamp: number;
  payload: WebhookPayload;
  status: 'sent' | 'pending';
  type: string;
}

export interface SystemConfig {}

export interface StrategyConfig {
  id: string;
  name: string;
  isActive: boolean;
  market: MarketType;
  symbol: SymbolType;
  interval: IntervalType;
  tradeAmount: number;
  webhookUrl: string;
  secret: string;
  triggerOnClose: boolean;
  manualTakeover: boolean;
  takeoverDirection: 'LONG' | 'SHORT' | 'FLAT';
  takeoverQuantity: number;
  takeoverEntryPrice: number; // 新增：显式手动入场价格
  takeoverTimestamp: string;
  trendFilterBlockShort: boolean;
  trendFilterBlockLong: boolean;
  useMACD: boolean;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  macdLong: boolean;
  macdShort: boolean;
  macdExitLong: boolean;
  macdExitShort: boolean;
  usePriceReturnEMA7: boolean;
  priceReturnDist: number;
  useEMA7_25: boolean; 
  ema7_25_Long: boolean;
  ema7_25_Short: boolean;
  ema7_25_ExitLong: boolean;
  ema7_25_ExitShort: boolean;
  useEMA7_99: boolean;
  ema7_99_Long: boolean;
  ema7_99_Short: boolean;
  ema7_99_ExitLong: boolean;
  ema7_99_ExitShort: boolean;
  useEMA25_99: boolean;
  ema25_99_Long: boolean;
  ema25_99_Short: boolean;
  ema25_99_ExitLong: boolean;
  ema25_99_ExitShort: boolean;
  useEMADouble: boolean; 
  emaDoubleLong: boolean;
  emaDoubleShort: boolean;
  emaDoubleExitLong: boolean;
  emaDoubleExitShort: boolean;
  useTrailingStop: boolean;
  trailActivation: number; 
  trailDistance: number; 
  useFixedTPSL: boolean;
  takeProfitPct: number;
  stopLossPct: number;
  useMultiTPSL: boolean;
  tpLevels: { pct: number; qtyPct: number; active: boolean }[];
  slLevels: { pct: number; qtyPct: number; active: boolean }[];
  useReverse: boolean;
  reverseLongToShort: boolean;
  reverseShortToLong: boolean;
  maxDailyTrades: number;
  useDelayedEntry: boolean;
  delayedEntryTargetCount: number;
  delayedEntryActivationTime: number; 
  delayedEntryType: 'LONG' | 'SHORT' | 'BOTH';
}

export interface PositionState {
  direction: 'LONG' | 'SHORT' | 'FLAT';
  pendingSignal: 'LONG' | 'SHORT' | 'NONE'; 
  pendingSignalSource?: string;
  initialQuantity: number; 
  remainingQuantity: number; 
  entryPrice: number;
  highestPrice: number; 
  lowestPrice: number;
  openTime: number;
  tpLevelsHit: boolean[]; 
  slLevelsHit: boolean[]; 
  delayedEntryCurrentCount: number;
  lastCountedSignalTime: number; 
}

export interface TradeStats {
  dailyTradeCount: number;
  lastTradeDate: string;
  lastActionCandleTime: number;
}

export interface StrategyRuntime {
  config: StrategyConfig;
  candles: Candle[];
  positionState: PositionState;
  tradeStats: TradeStats;
  lastPrice: number;
}
