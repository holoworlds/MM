
export type SymbolType = string;
export type IntervalType = 
  | '1m' | '2m' | '3m' | '5m' | '6m' | '10m' | '15m' | '20m' | '30m' | '45m' 
  | '1h' | '2h' | '3h' | '4h' | '6h' | '8h' | '10h' | '12h' 
  | '1d' | '2d' | '3d' | '1w' | '1M';

export type MarketType = 'CRYPTO' | 'US_STOCK';

export interface Candle {
  symbol: string;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
  // Indicators
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

// --- System Configuration ---
export interface LongbridgeConfig {
  enableRealtime: boolean;
  appKey: string;
  appSecret: string;
  accessToken: string;
}

export interface SystemConfig {
  longbridge: LongbridgeConfig;
}

// --- Strategy Configuration Interfaces ---

export interface StrategyConfig {
  id: string;
  name: string;
  isActive: boolean;

  // General
  market: MarketType;
  symbol: SymbolType;
  interval: IntervalType;
  
  // Sizing
  tradeAmount: number;
  tradeQuantity?: number;

  webhookUrl: string;
  secret: string;

  // Signal Trigger Mode
  triggerOnClose: boolean;

  // Manual Control
  manualTakeover: boolean;
  takeoverDirection: 'LONG' | 'SHORT' | 'FLAT';
  takeoverQuantity: number;
  takeoverTimestamp: string;

  // Trend Filter
  trendFilterBlockShort: boolean;
  trendFilterBlockLong: boolean;

  // --- SIGNALS ---

  // 1. MACD
  useMACD: boolean;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  macdLong: boolean;
  macdShort: boolean;
  macdExitLong: boolean;
  macdExitShort: boolean;

  // 2. Price Return to EMA7
  usePriceReturnEMA7: boolean;
  priceReturnDist: number;

  // 3. EMA 7/25
  useEMA7_25: boolean;
  ema7_25_Long: boolean;
  ema7_25_Short: boolean;
  ema7_25_ExitLong: boolean;
  ema7_25_ExitShort: boolean;

  // 4. EMA 7/99
  useEMA7_99: boolean;
  ema7_99_Long: boolean;
  ema7_99_Short: boolean;
  ema7_99_ExitLong: boolean;
  ema7_99_ExitShort: boolean;

  // 5. EMA 25/99
  useEMA25_99: boolean;
  ema25_99_Long: boolean;
  ema25_99_Short: boolean;
  ema25_99_ExitLong: boolean;
  ema25_99_ExitShort: boolean;

  // 6. EMA Double (7 & 25 vs 99)
  useEMADouble: boolean; 
  emaDoubleLong: boolean;
  emaDoubleShort: boolean;
  emaDoubleExitLong: boolean;
  emaDoubleExitShort: boolean;

  // --- EXITS ---

  // Trailing Stop
  useTrailingStop: boolean;
  trailActivation: number; 
  trailDistance: number; 

  // Fixed TP/SL
  useFixedTPSL: boolean;
  takeProfitPct: number;
  stopLossPct: number;

  // Multi Level TP/SL (4 Levels)
  useMultiTPSL: boolean;
  tpLevels: { pct: number; qtyPct: number; active: boolean }[];
  slLevels: { pct: number; qtyPct: number; active: boolean }[];

  // Reverse
  useReverse: boolean;
  reverseLongToShort: boolean;
  reverseShortToLong: boolean;

  // Risk / Limits
  maxDailyTrades: number;
}

// --- Internal State ---

export interface PositionState {
  direction: 'LONG' | 'SHORT' | 'FLAT';
  initialQuantity: number; 
  remainingQuantity: number; 
  entryPrice: number;
  highestPrice: number; 
  lowestPrice: number;
  openTime: number;
  tpLevelsHit: boolean[]; 
  slLevelsHit: boolean[]; 
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
