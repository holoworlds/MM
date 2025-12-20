
import WebSocket from 'ws';
import { Candle, IntervalType, SymbolType, MarketType, SystemConfig } from "../types";
import { BINANCE_WS_BASE, AVAILABLE_INTERVALS } from "../constants";
import { fetchHistoricalCandles, parseSocketMessage } from "../services/binanceService";
import { determineBaseConfig, resampleCandles } from "../services/resampleService";
import { FileStore } from "./FileStore";

type DataCallback = (candles: Candle[]) => void;

interface Subscription {
    id: string;
    targetInterval: IntervalType;
    callback: DataCallback;
}

class StreamHandler {
    private symbol: SymbolType;
    private baseInterval: IntervalType;
    private market: MarketType;
    private ws: WebSocket | null = null;
    private isConnected: boolean = false;
    private baseCandles: Candle[] = []; 
    private derivedBuffers: Map<string, Candle[]> = new Map();
    private subscribers: Map<string, Subscription[]> = new Map();
    private activeTargetIntervals: Set<IntervalType> = new Set();
    private destroyTimeout: ReturnType<typeof setTimeout> | null = null;
    private readonly KEEP_ALIVE_MS = 60000; 
    private lastSaveTime: number = 0;
    private readonly SAVE_INTERVAL_MS = 60000; 
    private readonly MAX_CANDLES = 5000; 
    public isAlwaysActive: boolean = false;
    private systemConfig: SystemConfig | null = null;
    private reconnectAttempts: number = 0;

    constructor(symbol: SymbolType, baseInterval: IntervalType, market: MarketType) {
        this.symbol = symbol;
        this.baseInterval = baseInterval;
        this.market = market;
    }

    public updateSystemConfig(config: SystemConfig) {
        this.systemConfig = config;
    }

    public setAlwaysActive(active: boolean) {
        this.isAlwaysActive = active;
        if (active && this.destroyTimeout) {
            clearTimeout(this.destroyTimeout);
            this.destroyTimeout = null;
        }
    }

    public addActiveTargetInterval(interval: IntervalType) {
        this.activeTargetIntervals.add(interval);
    }

    private getStoreKey(): string {
        return `${this.market}_${this.symbol}_${this.baseInterval}`;
    }

    public async initialize(initialConfig: SystemConfig | null) {
        this.systemConfig = initialConfig;
        let localData = FileStore.load<Candle[]>(this.getStoreKey()) || [];
        
        try {
            if (localData.length > 0) {
                localData.sort((a, b) => a.time - b.time);
                this.baseCandles = localData;
                const lastTime = localData[localData.length - 1].time;
                const newData = await fetchHistoricalCandles(this.symbol, this.baseInterval, lastTime + 1);
                if (newData.length > 0) {
                    const combined = [...this.baseCandles, ...newData];
                    const uniqueMap = new Map();
                    combined.forEach(c => uniqueMap.set(c.time, c));
                    this.baseCandles = Array.from(uniqueMap.values()).sort((a: any, b: any) => a.time - b.time);
                }
            } else {
                console.log(`[DataEngine] Deep fetching 1m/base history for ${this.symbol}...`);
                let allFetched: Candle[] = [];
                let endTime: number | undefined = undefined; 
                for (let i = 0; i < 5; i++) {
                    const batch = await fetchHistoricalCandles(this.symbol, this.baseInterval, undefined, endTime);
                    if (batch.length === 0) break;
                    allFetched = [...batch, ...allFetched];
                    endTime = batch[0].time - 1;
                    if (batch.length < 500) break; 
                }
                const uniqueMap = new Map();
                allFetched.forEach(c => uniqueMap.set(c.time, c));
                this.baseCandles = Array.from(uniqueMap.values()).sort((a: any, b: any) => a.time - b.time);
            }
        } catch (err) {
            console.error(`[DataEngine] History fetch error for ${this.symbol}:`, err);
            // Even if history fails, we continue so the live stream can start
        }

        if (this.baseCandles.length > this.MAX_CANDLES) {
            this.baseCandles = this.baseCandles.slice(-this.MAX_CANDLES);
        }
        this.saveToDisk();
        this.connect();
    }

    private saveToDisk() {
        if (this.baseCandles.length === 0) return;
        FileStore.save(this.getStoreKey(), this.baseCandles);
        this.lastSaveTime = Date.now();
    }

    public subscribe(subId: string, targetInterval: IntervalType, callback: DataCallback) {
        if (this.destroyTimeout) { clearTimeout(this.destroyTimeout); this.destroyTimeout = null; }
        if (!this.subscribers.has(targetInterval)) this.subscribers.set(targetInterval, []);
        this.subscribers.get(targetInterval)!.push({ id: subId, targetInterval, callback });
        const currentData = this.getOrCalculateDerivedData(targetInterval);
        callback(currentData);
    }

    public unsubscribe(subId: string) {
        for (const [interval, subs] of this.subscribers.entries()) {
            const idx = subs.findIndex(s => s.id === subId);
            if (idx !== -1) {
                subs.splice(idx, 1);
                if (subs.length === 0) {
                    this.derivedBuffers.delete(interval);
                    this.subscribers.delete(interval);
                }
            }
        }
    }

    public hasSubscribers(): boolean { return this.subscribers.size > 0; }

    public scheduleDestroy(callback: () => void) {
        if (this.isAlwaysActive || this.hasSubscribers()) return;
        this.destroyTimeout = setTimeout(() => {
            if (!this.hasSubscribers() && !this.isAlwaysActive) {
                this.destroy(); callback(); 
            }
        }, this.KEEP_ALIVE_MS);
    }

    public destroy() {
        this.destroyConnection();
        this.saveToDisk();
        this.baseCandles = [];
        this.derivedBuffers.clear();
        this.subscribers.clear();
        this.activeTargetIntervals.clear();
    }

    private destroyConnection() {
        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.terminate();
            this.ws = null;
        }
        this.isConnected = false;
    }

    private connect() {
        this.destroyConnection();
        const streamName = `${this.symbol.toLowerCase()}@kline_${this.baseInterval}`;
        const wsUrl = `${BINANCE_WS_BASE}${streamName}`;
        
        console.log(`[DataEngine] Connecting to Binance WebSocket: ${wsUrl}`);
        this.ws = new WebSocket(wsUrl);
        
        this.ws.on('open', () => { 
            console.log(`[DataEngine] WebSocket Connected for ${this.symbol}`);
            this.isConnected = true; 
            this.reconnectAttempts = 0;
        });

        this.ws.on('message', (data: WebSocket.Data) => {
            try {
                const msg = JSON.parse(data.toString());
                const kline = msg.data ? parseSocketMessage(msg.data) : null;
                if (kline) this.processNewCandle(kline);
            } catch (e) {
                console.error("[DataEngine] Message parse error", e);
            }
        });

        this.ws.on('error', (err) => {
            console.error(`[DataEngine] WebSocket Error for ${this.symbol}:`, err.message);
            this.isConnected = false;
        });

        this.ws.on('close', (code, reason) => {
            console.warn(`[DataEngine] WebSocket Closed for ${this.symbol}. Code: ${code}, Reason: ${reason}`);
            this.isConnected = false;
            
            // Reconnect if needed
            if ((this.hasSubscribers() || this.isAlwaysActive) && !this.destroyTimeout) {
                const delay = Math.min(30000, 5000 * Math.pow(1.5, this.reconnectAttempts));
                this.reconnectAttempts++;
                console.log(`[DataEngine] Scheduling reconnect for ${this.symbol} in ${delay}ms...`);
                setTimeout(() => this.connect(), delay);
            }
        });
    }

    private processNewCandle(newCandle: Candle) {
        const lastBase = this.baseCandles[this.baseCandles.length - 1];
        if (lastBase && lastBase.time === newCandle.time) {
            this.baseCandles[this.baseCandles.length - 1] = newCandle;
        } else {
            this.baseCandles.push(newCandle);
        }
        if (Date.now() - this.lastSaveTime > this.SAVE_INTERVAL_MS) this.saveToDisk();
        if (this.baseCandles.length > this.MAX_CANDLES) this.baseCandles = this.baseCandles.slice(-this.MAX_CANDLES);
        
        this.derivedBuffers.clear();
        for (const [interval, subs] of this.subscribers.entries()) {
            const candles = this.getOrCalculateDerivedData(interval as IntervalType);
            subs.forEach(sub => sub.callback(candles));
        }
        
        if (this.isAlwaysActive) {
            for (const interval of this.activeTargetIntervals) {
                if (!this.subscribers.has(interval)) this.getOrCalculateDerivedData(interval);
            }
        }
    }

    private getOrCalculateDerivedData(targetInterval: IntervalType): Candle[] {
        if (targetInterval === this.baseInterval) return this.baseCandles.slice(-1000); 
        if (this.derivedBuffers.has(targetInterval)) return this.derivedBuffers.get(targetInterval)!;
        const resampled = resampleCandles(this.baseCandles, targetInterval, this.baseInterval);
        const trimmed = resampled.slice(-1000);
        this.derivedBuffers.set(targetInterval, trimmed);
        return trimmed;
    }
}

class DataEngine {
    private static instance: DataEngine;
    private streams: Map<string, StreamHandler> = new Map();
    private systemConfig: SystemConfig | null = null;
    private constructor() {}
    public static getInstance(): DataEngine {
        if (!DataEngine.instance) DataEngine.instance = new DataEngine();
        return DataEngine.instance;
    }
    public updateSystemConfig(config: SystemConfig) {
        this.systemConfig = config;
        this.streams.forEach(stream => stream.updateSystemConfig(config));
    }
    public async ensureActive(symbol: SymbolType, market: MarketType = 'CRYPTO') {
         for (const interval of AVAILABLE_INTERVALS) {
             const { baseInterval } = determineBaseConfig(interval);
             const streamKey = `${market}_${symbol}_${baseInterval}`;
             let stream = this.streams.get(streamKey);
             if (!stream) {
                stream = new StreamHandler(symbol, baseInterval, market);
                this.streams.set(streamKey, stream);
                stream.initialize(this.systemConfig).catch((err) => {
                    console.error(`[DataEngine] Failed to initialize stream ${streamKey}:`, err);
                });
             }
             stream.setAlwaysActive(true);
             stream.addActiveTargetInterval(interval);
         }
    }
    public async subscribe(strategyId: string, symbol: SymbolType, interval: IntervalType, market: MarketType, callback: DataCallback) {
        const { baseInterval } = determineBaseConfig(interval);
        const streamKey = `${market}_${symbol}_${baseInterval}`;
        let stream = this.streams.get(streamKey);
        if (!stream) {
            stream = new StreamHandler(symbol, baseInterval, market);
            this.streams.set(streamKey, stream);
            await stream.initialize(this.systemConfig);
        }
        stream.subscribe(strategyId, interval, callback);
    }
    public unsubscribe(strategyId: string, symbol: SymbolType, interval: IntervalType, market: MarketType) {
        const { baseInterval } = determineBaseConfig(interval);
        const streamKey = `${market}_${symbol}_${baseInterval}`;
        const stream = this.streams.get(streamKey);
        if (stream) {
            stream.unsubscribe(strategyId);
            stream.scheduleDestroy(() => {
                if (!stream.hasSubscribers() && !stream.isAlwaysActive) this.streams.delete(streamKey);
            });
        }
    }
}

export const dataEngine = DataEngine.getInstance();
