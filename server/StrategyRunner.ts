
import { StrategyConfig, StrategyRuntime, Candle, PositionState, TradeStats, WebhookPayload, StrategyState } from "../types";
import { enrichCandlesWithIndicators } from "../services/indicatorService";
import { evaluateStrategy } from "../services/strategyEngine";
import { dataEngine } from "./DataEngine";

const INITIAL_POS_STATE: PositionState = {
    state: StrategyState.IDLE,
    direction: 'FLAT', 
    pendingSignal: 'NONE',
    pendingSignalSource: '',
    pendingSignalType: 'NONE',
    pendingSignalCandleTime: 0,
    initialQuantity: 0,
    remainingQuantity: 0,
    entryPrice: 0, 
    highestPrice: 0, 
    lowestPrice: 0, 
    openTime: 0, 
    tpLevelsHit: new Array(4).fill(false), 
    slLevelsHit: new Array(4).fill(false)
};

const INITIAL_STATS: TradeStats = { 
    dailyTradeCount: 0, 
    lastTradeDate: new Date().toISOString().split('T')[0],
    lastActionCandleTime: 0 
};

export class StrategyRunner {
    public runtime: StrategyRuntime;
    private onUpdate: (id: string, runtime: StrategyRuntime) => void;
    private onLog: (log: any) => void;
    private isRunning: boolean = false;
    private subscriptionId: number = 0;
    private isWarmupPhase: boolean = true; 
    private validSymbols: string[] = [];

    constructor(
        config: StrategyConfig, 
        onUpdate: (id: string, runtime: StrategyRuntime) => void, 
        onLog: (log: any) => void,
        validSymbols: string[] = []
    ) {
        this.onUpdate = onUpdate;
        this.onLog = onLog;
        this.validSymbols = validSymbols;
        this.runtime = {
            config: config,
            candles: [],
            positionState: { ...INITIAL_POS_STATE },
            tradeStats: { ...INITIAL_STATS },
            lastPrice: 0
        };
    }

    private isValid(symbol: string): boolean {
        // 如果名单为空，说明还没获取到，默认放行一次（或者可以严格拦截）
        if (this.validSymbols.length === 0) return symbol.length > 5; 
        return this.validSymbols.includes(symbol);
    }

    public async start() {
        if (this.isRunning) return;
        
        // 核对币种合法性
        if (!this.isValid(this.runtime.config.symbol)) {
            console.log(`[Runner] ${this.runtime.config.symbol} is not a valid symbol. Wait for correct name.`);
            return;
        }

        this.isRunning = true;
        this.isWarmupPhase = true;
        this.subscriptionId++;
        const currentSid = this.subscriptionId;
        
        console.log(`[Runner] Starting subscription for ${this.runtime.config.symbol} (${this.runtime.config.interval})`);
        
        await dataEngine.subscribe(
            this.runtime.config.id,
            this.runtime.config.symbol,
            this.runtime.config.interval,
            this.runtime.config.market,
            (candles) => {
                if (this.subscriptionId !== currentSid) return;
                this.handleDataUpdate(candles);
            }
        );
    }

    public stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        console.log(`[Runner] Stopping subscription for ${this.runtime.config.symbol}`);
        dataEngine.unsubscribe(this.runtime.config.id, this.runtime.config.symbol, this.runtime.config.interval, this.runtime.config.market);
    }

    public updateConfig(newConfig: StrategyConfig) {
        const symbolChanged = newConfig.symbol !== this.runtime.config.symbol;
        const intervalChanged = newConfig.interval !== this.runtime.config.interval;

        if (newConfig.isActive && !this.runtime.config.isActive) {
            newConfig.activationTime = Date.now();
        }

        if (newConfig.manualTakeover && !this.runtime.config.manualTakeover) {
            this.runtime.positionState = {
                ...this.runtime.positionState,
                state: newConfig.takeoverDirection === 'LONG' ? StrategyState.MANUAL_TAKEOVER_LONG : StrategyState.MANUAL_TAKEOVER_SHORT,
                direction: newConfig.takeoverDirection,
                entryPrice: newConfig.takeoverEntryPrice || 0,
                initialQuantity: newConfig.takeoverQuantity || 0,
                remainingQuantity: newConfig.takeoverQuantity || 0,
                openTime: Date.now()
            };
        } else if (!newConfig.manualTakeover && this.runtime.config.manualTakeover) {
            this.runtime.positionState = { ...INITIAL_POS_STATE };
        }

        // 核心修复逻辑：只有当新币种是合法的，才进行切换
        if (symbolChanged || intervalChanged) {
            this.stop(); 
            this.runtime.candles = []; 
            this.runtime.config = newConfig; 
            
            // 只有合法时才重新启动订阅
            if (this.isValid(newConfig.symbol)) {
                this.start(); 
            } else {
                console.log(`[Runner] New symbol ${newConfig.symbol} is invalid, pausing subscription.`);
            }
        } else {
            this.runtime.config = newConfig;
        }

        this.emitUpdate();
    }

    public restoreState(position: PositionState, stats: TradeStats) {
        this.runtime.positionState = { ...INITIAL_POS_STATE, ...position };
        this.runtime.tradeStats = stats;
    }

    public getSnapshot() {
        return { config: this.runtime.config, positionState: this.runtime.positionState, tradeStats: this.runtime.tradeStats };
    }

    private handleDataUpdate(candles: Candle[]) {
        if (candles.length === 0) return;
        this.runtime.lastPrice = candles[candles.length - 1].close;
        const enriched = enrichCandlesWithIndicators(candles, {
            macdFast: this.runtime.config.macdFast,
            macdSlow: this.runtime.config.macdSlow,
            macdSignal: this.runtime.config.macdSignal
        });
        this.runtime.candles = enriched;
        
        const result = evaluateStrategy(enriched, this.runtime.config, this.runtime.positionState, this.runtime.tradeStats);
        
        if (this.isWarmupPhase) { 
            result.actions = []; 
            this.isWarmupPhase = false; 
        }

        this.runtime.positionState = result.newPositionState;
        this.runtime.tradeStats = result.newTradeStats;

        if (result.actions.length > 0) {
            result.actions.forEach(action => this.sendWebhook(action));
        }
        this.emitUpdate();
    }

    public handleManualOrder(type: 'LONG' | 'SHORT' | 'FLAT') {
        const price = this.runtime.lastPrice;
        if (price === 0) return;
        const qty = this.runtime.config.tradeAmount / price;
        const payload: WebhookPayload = {
            secret: this.runtime.config.secret,
            action: type === 'LONG' ? 'buy' : type === 'SHORT' ? 'sell' : 'flat',
            position: type.toLowerCase(),
            symbol: this.runtime.config.symbol,
            quantity: qty.toFixed(8),
            leverage: this.runtime.config.leverage, 
            timestamp: new Date().toISOString(),
            tv_exchange: "BINANCE", 
            strategy_name: this.runtime.config.name,
            trade_amount: qty * price,
            tp_level: '手动面板指令',
            execution_price: price,
            execution_quantity: qty
        };
        
        if (type === 'FLAT') {
            this.runtime.positionState = { ...INITIAL_POS_STATE };
        } else {
            this.runtime.positionState = {
                ...INITIAL_POS_STATE,
                state: type === 'LONG' ? StrategyState.MANUAL_TAKEOVER_LONG : StrategyState.MANUAL_TAKEOVER_SHORT,
                direction: type,
                initialQuantity: qty,
                remainingQuantity: qty,
                entryPrice: price,
                openTime: Date.now()
            };
            this.runtime.tradeStats.dailyTradeCount++;
        }
        this.sendWebhook(payload);
        this.emitUpdate();
    }

    private async sendWebhook(payload: any) {
        const logEntry = {
            id: Math.random().toString(36).substr(2, 9),
            strategyId: this.runtime.config.id,
            strategyName: this.runtime.config.name,
            timestamp: Date.now(),
            payload, 
            status: 'sent', 
            type: payload.tp_level?.includes('手动') ? 'Manual' : 'Strategy'
        };
        this.onLog(logEntry);
        if (this.runtime.config.webhookUrl) {
            fetch(this.runtime.config.webhookUrl, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(payload) 
            }).catch(e => console.error("[Webhook Error]", e));
        }
    }

    private emitUpdate() { this.onUpdate(this.runtime.config.id, this.runtime); }
}
