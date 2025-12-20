
import { StrategyConfig, StrategyRuntime, Candle, PositionState, TradeStats, WebhookPayload } from "../types";
import { enrichCandlesWithIndicators } from "../services/indicatorService";
import { evaluateStrategy } from "../services/strategyEngine";
import { dataEngine } from "./DataEngine";

const INITIAL_POS_STATE: PositionState = {
    direction: 'FLAT', 
    pendingSignal: 'NONE',
    pendingSignalSource: '',
    initialQuantity: 0,
    remainingQuantity: 0,
    entryPrice: 0, 
    highestPrice: 0, 
    lowestPrice: 0, 
    openTime: 0, 
    tpLevelsHit: new Array(4).fill(false), 
    slLevelsHit: new Array(4).fill(false),
    delayedEntryCurrentCount: 0,
    lastCountedSignalTime: 0
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

    constructor(config: StrategyConfig, onUpdate: (id: string, runtime: StrategyRuntime) => void, onLog: (log: any) => void) {
        this.onUpdate = onUpdate;
        this.onLog = onLog;
        this.runtime = {
            config: config,
            candles: [],
            positionState: { ...INITIAL_POS_STATE },
            tradeStats: { ...INITIAL_STATS },
            lastPrice: 0
        };
    }

    public async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.isWarmupPhase = true;
        this.subscriptionId++;
        const currentSid = this.subscriptionId;

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
        this.isRunning = false;
        dataEngine.unsubscribe(this.runtime.config.id, this.runtime.config.symbol, this.runtime.config.interval, this.runtime.config.market);
    }

    public updateConfig(newConfig: StrategyConfig) {
        const oldSymbol = this.runtime.config.symbol;
        const oldInterval = this.runtime.config.interval;
        
        // 特殊处理：如果延后开仓功能刚开启，重置计数并设置激活时间
        if (newConfig.useDelayedEntry && !this.runtime.config.useDelayedEntry) {
            this.runtime.positionState.delayedEntryCurrentCount = 0;
            this.runtime.positionState.lastCountedSignalTime = 0;
            
            // 修正：将激活时间对齐到当前最后一根K线的时间戳，确保 inclusive 判定生效
            const lastCandle = this.runtime.candles[this.runtime.candles.length - 1];
            newConfig.delayedEntryActivationTime = lastCandle ? lastCandle.time : Date.now();
        } else if (!newConfig.useDelayedEntry) {
            newConfig.delayedEntryActivationTime = 0;
            this.runtime.positionState.delayedEntryCurrentCount = 0;
        }

        // 手动接管同步：如果 UI 开启手动接管，尝试同步 UI 传入的仓位状态到 runtime
        if (newConfig.manualTakeover) {
            this.runtime.positionState.direction = newConfig.takeoverDirection;
            // 只有当方向不为 FLAT 时，初始化一些基础值防止报错
            if (newConfig.takeoverDirection !== 'FLAT' && this.runtime.positionState.entryPrice === 0) {
                this.runtime.positionState.entryPrice = this.runtime.lastPrice;
                this.runtime.positionState.initialQuantity = newConfig.takeoverQuantity;
                this.runtime.positionState.remainingQuantity = newConfig.takeoverQuantity;
            }
        }

        this.runtime.config = newConfig;

        if (newConfig.symbol !== oldSymbol || newConfig.interval !== oldInterval) {
            this.stop();
            this.runtime.candles = []; 
            this.emitUpdate(); 
            this.start();
        } else {
            this.emitUpdate();
        }
    }

    public restoreState(position: PositionState, stats: TradeStats) {
        this.runtime.positionState = { 
            ...INITIAL_POS_STATE,
            ...position, 
            pendingSignal: position.pendingSignal || 'NONE' 
        };
        this.runtime.tradeStats = stats;
    }

    public getSnapshot() {
        return {
            config: this.runtime.config,
            positionState: this.runtime.positionState,
            tradeStats: this.runtime.tradeStats
        };
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
            this.emitUpdate(); 
            result.actions.forEach(action => this.sendWebhook(action));
        } else {
            this.emitUpdate();
        }
    }

    public handleManualOrder(type: 'LONG' | 'SHORT' | 'FLAT') {
        const price = this.runtime.lastPrice;
        if (price === 0) return;
        const qty = this.runtime.config.tradeAmount / price;
        
        // 发送成交记录
        const payload: WebhookPayload = {
            secret: this.runtime.config.secret,
            action: type === 'LONG' ? 'buy' : type === 'SHORT' ? 'sell' : 'flat',
            position: type.toLowerCase(),
            symbol: this.runtime.config.symbol,
            quantity: qty.toFixed(8),
            trade_amount: qty * price,
            timestamp: new Date().toISOString(),
            strategy_name: this.runtime.config.name,
            tp_level: '手动下单 (Manual Order)',
            execution_price: price,
            execution_quantity: qty
        };

        if (type === 'FLAT') {
            this.runtime.positionState = { ...INITIAL_POS_STATE };
        } else {
            this.runtime.positionState = {
                ...INITIAL_POS_STATE,
                direction: type,
                pendingSignal: 'NONE', 
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
            payload, status: 'sent', type: payload.tp_level?.includes('手动') ? 'Manual' : 'Strategy'
        };
        this.onLog(logEntry);
        if (this.runtime.config.webhookUrl) {
            fetch(this.runtime.config.webhookUrl, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(payload) 
            }).catch(e => console.error("[Webhook] Error", e));
        }
    }

    private emitUpdate() {
        this.onUpdate(this.runtime.config.id, this.runtime);
    }
}
