
export type SymbolType = string;
export type IntervalType = 
  | '1m' | '2m' | '3m' | '5m' | '6m' | '10m' | '15m' | '20m' | '30m' | '45m' 
  | '1h' | '2h' | '3h' | '4h' | '6h' | '8h' | '10h' | '12h' 
  | '1d' | '2d' | '3d' | '1w' | '1M';

export type MarketType = 'CRYPTO';

export enum StrategyState {
  IDLE = 'IDLE',
  SIGNAL_QUALIFIED = 'SIGNAL_QUALIFIED',
  ENTRY_ARMED = 'ENTRY_ARMED',
  IN_POSITION_LONG = 'IN_POSITION_LONG',
  IN_POSITION_SHORT = 'IN_POSITION_SHORT',
  MANUAL_TAKEOVER_LONG = 'MANUAL_TAKEOVER_LONG',
  MANUAL_TAKEOVER_SHORT = 'MANUAL_TAKEOVER_SHORT',
  EXIT_PENDING = 'EXIT_PENDING'
}

export type SignalSourceType = 'EMA7_25' | 'EMA7_99' | 'EMA25_99' | 'MACD' | 'DOUBLE_EMA' | 'NONE';

export interface SystemConfig {}

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
  leverage: number;
  timestamp: string;
  tv_exchange: string;
  strategy_name: string;
  trade_amount?: number; 
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

export interface StrategyConfig {
  id: string;
  name: string;
  isActive: boolean;
  activationTime?: number;
  market: MarketType;
  symbol: SymbolType;
  interval: IntervalType;
  tradeAmount: number;
  leverage: number; // 用户新增需求
  webhookUrl: string;
  secret: string;
  triggerOnClose: boolean;
  manualTakeover: boolean;
  takeoverDirection: 'LONG' | 'SHORT';
  takeoverQuantity: number;
  takeoverEntryPrice: number; 
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
  priceReturnBelowEma7Pct: number; 
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
}

export interface PositionState {
  state: StrategyState;
  direction: 'LONG' | 'SHORT' | 'FLAT';
  pendingSignal: 'LONG' | 'SHORT' | 'NONE'; 
  pendingSignalSource?: string;
  pendingSignalType: SignalSourceType;
  pendingSignalCandleTime?: number;
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
