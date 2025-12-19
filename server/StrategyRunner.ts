
import { StrategyConfig, StrategyRuntime, Candle, PositionState, TradeStats, WebhookPayload } from "../types";
import { enrichCandlesWithIndicators } from "../services/indicatorService";
import { evaluateStrategy } from "../services/strategyEngine";
import { dataEngine } from "./DataEngine";

const INITIAL_POS_STATE: PositionState = {
    direction: 'FLAT', 
    initialQuantity: 0,
    remainingQuantity: 0,
    entryPrice: 0, 
    highestPrice: 0, 
    lowestPrice: 0, 
    openTime: 0, 
    tpLevelsHit: [], 
    slLevelsHit: []
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
            positionState: INITIAL_POS_STATE,
            tradeStats: INITIAL_STATS,
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
        const wasActive = this.runtime.config.isActive;
        
        this.runtime.config = newConfig;

        if (newConfig.isActive && !wasActive) {
            this.isWarmupPhase = true;
        }

        if (newConfig.symbol !== oldSymbol || newConfig.interval !== oldInterval) {
            this.stop();
            this.runtime.candles = []; 
            this.emitUpdate(); 
            this.start();
        } else {
            this.emitUpdate();
        }
    }

    public getSnapshot() {
        return {
            config: this.runtime.config,
            positionState: this.runtime.positionState,
            tradeStats: this.runtime.tradeStats
        };
    }

    public restoreState(position: PositionState, stats: TradeStats) {
        this.runtime.positionState = position;
        this.runtime.tradeStats = stats;
    }

    public handleManualOrder(type: 'LONG' | 'SHORT' | 'FLAT') {
        const price = this.runtime.lastPrice;
        if (price === 0) return;

        const currentCandleTime = this.runtime.candles.length > 0 ? this.runtime.candles[this.runtime.candles.length - 1].time : 0;
        let quantity = 0;

        if (type === 'LONG' || type === 'SHORT') quantity = this.runtime.config.tradeAmount / price;
        if (type === 'FLAT') quantity = this.runtime.positionState.remainingQuantity;

        if (type === 'FLAT') {
            this.runtime.positionState = INITIAL_POS_STATE;
        } else {
            this.runtime.positionState = {
                direction: type, initialQuantity: quantity, remainingQuantity: quantity,
                entryPrice: price, highestPrice: type === 'LONG' ? price : 0, lowestPrice: type === 'SHORT' ? price : 0,
                openTime: Date.now(), tpLevelsHit: [], slLevelsHit: []
            };
            this.runtime.tradeStats.dailyTradeCount += 1;
        }

        if (currentCandleTime > 0) this.runtime.tradeStats.lastActionCandleTime = currentCandleTime;

        const action = type === 'LONG' ? 'buy' : type === 'SHORT' ? 'sell' : (this.runtime.positionState.direction === 'LONG' ? 'sell' : 'buy');
        const pos = type === 'FLAT' ? 'flat' : type.toLowerCase();
        
        const payload = this.generatePayload(action, pos, quantity, price, '手动操作');
        this.sendWebhook(payload, true);
        this.emitUpdate();
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

        // CRITICAL: Update local state immediately before processing webhooks
        this.runtime.positionState = result.newPositionState;
        this.runtime.tradeStats = result.newTradeStats;

        if (result.actions.length > 0) {
            // Immediate broadcast of state change to prevent double-firing in UI
            this.emitUpdate();
            
            result.actions.forEach(action => {
                this.sendWebhook(action);
            });
        } else {
            // Regular update for price movements
            this.emitUpdate();
        }
    }

    private generatePayload(action: string, position: string, quantity: number, price: number, msg: string): any {
        return {
            secret: this.runtime.config.secret || '',
            action, position, symbol: this.runtime.config.symbol,
            quantity: quantity.toString(), trade_amount: quantity * price,
            leverage: 5, timestamp: new Date().toISOString(), tv_exchange: "BINANCE",
            strategy_name: this.runtime.config.name, tp_level: msg,
            execution_price: price, execution_quantity: quantity
        };
    }

    private async sendWebhook(payload: any, isManual: boolean = false) {
        const logEntry = {
            id: Math.random().toString(36).substr(2, 9),
            strategyId: this.runtime.config.id,
            strategyName: this.runtime.config.name,
            timestamp: Date.now(),
            payload, status: 'sent', type: isManual ? 'Manual' : 'Strategy'
        };
        this.onLog(logEntry);

        const url = this.runtime.config.webhookUrl;
        if (url) {
            fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            .catch(e => console.error(`[Webhook] Failed`, e));
        }
    }

    private emitUpdate() {
        this.onUpdate(this.runtime.config.id, this.runtime);
    }
}
