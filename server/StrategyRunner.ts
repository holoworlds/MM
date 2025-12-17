
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
    
    // Safety ID to prevent processing stale callbacks from previous interval subscriptions
    private subscriptionId: number = 0;

    // Prevents "catch-up" trades when strategy is toggled ON
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
        
        console.log(`[${this.runtime.config.name}] Starting Strategy (${this.runtime.config.market})...`);
        this.isRunning = true;
        this.isWarmupPhase = true; // Reset warmup on start

        this.subscriptionId++;
        const currentSid = this.subscriptionId;

        // Subscribe to Data Engine with Market Type
        await dataEngine.subscribe(
            this.runtime.config.id,
            this.runtime.config.symbol,
            this.runtime.config.interval,
            this.runtime.config.market, // Pass Market Type
            (candles) => {
                if (this.subscriptionId !== currentSid) return;
                this.handleDataUpdate(candles);
            }
        );
    }

    public stop() {
        console.log(`[${this.runtime.config.name}] Stopping...`);
        this.isRunning = false;
        
        dataEngine.unsubscribe(
            this.runtime.config.id, 
            this.runtime.config.symbol, 
            this.runtime.config.interval,
            this.runtime.config.market
        );
    }

    public updateConfig(newConfig: StrategyConfig) {
        const oldSymbol = this.runtime.config.symbol;
        const oldInterval = this.runtime.config.interval;
        const oldMarket = this.runtime.config.market; // Check market change
        const wasManual = this.runtime.config.manualTakeover;
        const wasActive = this.runtime.config.isActive;
        
        this.runtime.config = newConfig;

        if (!wasManual && newConfig.manualTakeover) {
             this.initializeManualPosition(newConfig);
        }

        // If toggling from INACTIVE -> ACTIVE, trigger warmup to suppress existing signal states
        if (newConfig.isActive && !wasActive) {
            console.log(`[${newConfig.name}] Strategy Activated: Entering warmup phase to skip stale signals.`);
            this.isWarmupPhase = true;
        }

        // If symbol, interval or market changed, restart
        if (newConfig.symbol !== oldSymbol || newConfig.interval !== oldInterval || newConfig.market !== oldMarket) {
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
        console.log(`[${this.runtime.config.name}] State Restored: ${position.direction}, Today's Trades: ${stats.dailyTradeCount}`);
    }

    private initializeManualPosition(config: StrategyConfig) {
        const direction = config.takeoverDirection || 'FLAT';
        const qty = config.takeoverQuantity || 0;

        if (direction === 'FLAT') {
            this.runtime.positionState = INITIAL_POS_STATE;
            console.log(`[${config.name}] Manual Takeover: Reset to FLAT`);
        } else {
            const price = this.runtime.lastPrice; 
            
            this.runtime.positionState = {
                direction: direction,
                initialQuantity: qty,
                remainingQuantity: qty,
                entryPrice: price,
                highestPrice: direction === 'LONG' ? price : 0,
                lowestPrice: direction === 'SHORT' ? price : 0,
                openTime: Date.now(), 
                tpLevelsHit: [],
                slLevelsHit: []
            };

            const payload = this.generatePayload(
                direction === 'LONG' ? 'buy' : 'sell',
                direction.toLowerCase(),
                qty,
                price,
                'Manual_Takeover_Init'
            );
            
            this.sendWebhook(payload, true);
            console.log(`[${config.name}] Manual Takeover: Initialized ${direction} ${qty}`);
        }
    }

    public handleManualOrder(type: 'LONG' | 'SHORT' | 'FLAT') {
        const price = this.runtime.lastPrice;
        if (price === 0) return;

        const now = new Date();
        const currentCandleTime = this.runtime.candles.length > 0 
            ? this.runtime.candles[this.runtime.candles.length - 1].time 
            : 0;

        let act = '';
        let pos = '';
        let quantity = 0;

        // Calculate Quantity logic
        if (type === 'LONG' || type === 'SHORT') { 
            quantity = this.runtime.config.tradeAmount / price;
        }
        if (type === 'FLAT') { 
             quantity = this.runtime.positionState.remainingQuantity; 
        }

        // Determine Action String
        if (type === 'LONG') { act = 'buy'; pos = 'long'; }
        if (type === 'SHORT') { act = 'sell'; pos = 'short'; }
        if (type === 'FLAT') { 
            act = this.runtime.positionState.direction === 'LONG' ? 'sell' : 'buy'; 
            pos = 'flat'; 
        }

        // Update State Manually
        let newStats = { ...this.runtime.tradeStats };
        let newState: PositionState;

        if (type === 'FLAT') {
            newState = INITIAL_POS_STATE;
        } else {
            newState = {
                direction: type,
                initialQuantity: quantity,
                remainingQuantity: quantity,
                entryPrice: price,
                highestPrice: type === 'LONG' ? price : 0,
                lowestPrice: type === 'SHORT' ? price : 0,
                openTime: now.getTime(),
                tpLevelsHit: [],
                slLevelsHit: []
            };
            newStats.dailyTradeCount += 1;
        }

        // IMPORTANT: Update lastActionCandleTime to prevent auto-strategy 
        // from immediately fighting the manual order in the same candle.
        if (currentCandleTime > 0) {
            newStats.lastActionCandleTime = currentCandleTime;
        }

        this.runtime.positionState = newState;
        this.runtime.tradeStats = newStats;

        const payload = this.generatePayload(act, pos, quantity, price, '手动操作');
        this.sendWebhook(payload, true);
        this.emitUpdate();
    }

    // --- Core Logic ---
    private handleDataUpdate(candles: Candle[]) {
        if (candles.length === 0) return;

        // Zero Tolerance: Check Symbol
        const incomingSymbol = candles[0].symbol;
        if (incomingSymbol && incomingSymbol.toUpperCase() !== this.runtime.config.symbol.toUpperCase()) {
             return;
        }

        this.runtime.lastPrice = candles[candles.length - 1].close;

        const enriched = enrichCandlesWithIndicators(candles, {
            macdFast: this.runtime.config.macdFast,
            macdSlow: this.runtime.config.macdSlow,
            macdSignal: this.runtime.config.macdSignal
        });
        
        this.runtime.candles = enriched;

        const result = evaluateStrategy(
            enriched, 
            this.runtime.config, 
            this.runtime.positionState, 
            this.runtime.tradeStats
        );

        // --- WARMUP CHECK ---
        // If we are in warmup phase (just started or enabled), we UPDATE STATE but DISCARD ACTIONS.
        // This prevents executing stale signals (e.g. price was already below Bollinger Band before we turned it on).
        if (this.isWarmupPhase) {
            if (result.actions.length > 0) {
                console.log(`[${this.runtime.config.name}] Warmup: Suppressed ${result.actions.length} stale signals.`);
                result.actions = [];
            }
            this.isWarmupPhase = false; // Warmup done, next tick is live
        }

        this.runtime.positionState = result.newPositionState;
        this.runtime.tradeStats = result.newTradeStats;

        if (result.actions.length > 0) {
            // Re-generate payload to ensure it matches the current Market Type format
            result.actions.forEach(action => {
                const finalPayload = this.generatePayload(
                    action.action,
                    action.position,
                    parseFloat(action.quantity),
                    action.execution_price || 0,
                    action.tp_level || ''
                );
                
                this.sendWebhook(finalPayload);
            });
        }

        this.emitUpdate();
    }

    // --- Payload Generator Factory ---
    private generatePayload(
        action: string, 
        position: string, 
        quantity: number, 
        price: number, 
        msg: string
    ): any {
        const config = this.runtime.config;

        // Binance / Default Crypto Format
        return {
            secret: config.secret || '',
            action: action,
            position: position,
            symbol: config.symbol,
            quantity: quantity.toString(),
            trade_amount: quantity * price,
            leverage: 5,
            timestamp: new Date().toISOString(),
            tv_exchange: "BINANCE",
            strategy_name: config.name,
            tp_level: msg,
            execution_price: price,
            execution_quantity: quantity
        };
    }

    private async sendWebhook(payload: any, isManual: boolean = false) {
        const logEntry = {
            id: Math.random().toString(36).substr(2, 9),
            strategyId: this.runtime.config.id,
            strategyName: this.runtime.config.name,
            timestamp: Date.now(),
            payload,
            status: 'sent',
            type: isManual ? 'Manual' : 'Strategy'
        };
        this.onLog(logEntry);

        // Determine URL based on market (Always use webhookUrl since stocks are gone)
        const url = this.runtime.config.webhookUrl;

        if (url) {
            try {
                await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                console.log(`[${this.runtime.config.name}] Webhook Sent to ${url}`);
            } catch (e) {
                console.error(`[${this.runtime.config.name}] Webhook Failed`, e);
            }
        }
    }

    private emitUpdate() {
        this.onUpdate(this.runtime.config.id, this.runtime);
    }
}