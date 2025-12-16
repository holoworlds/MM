
import WebSocket from 'ws';
import { Candle, IntervalType, SymbolType, MarketType, SystemConfig } from "../types";
import { BINANCE_WS_BASE, AVAILABLE_INTERVALS } from "../constants";
import { fetchHistoricalCandles, parseSocketMessage } from "../services/binanceService";
import { fetchHistoricalCandlesLB, LongbridgeSocketMock, LongbridgeRealtimePoller } from "../services/longbridgeService";
import { determineBaseConfig, resampleCandles } from "../services/resampleService";
import { FileStore } from "./FileStore";

type DataCallback = (candles: Candle[]) => void;

interface Subscription {
    id: string;
    targetInterval: IntervalType;
    callback: DataCallback;
}

/**
 * StreamHandler manages a SINGLE WebSocket connection for a specific Symbol + BaseInterval.
 */
class StreamHandler {
    private symbol: SymbolType;
    private baseInterval: IntervalType;
    private market: MarketType;
    private ws: WebSocket | null = null;
    private lbMock: LongbridgeSocketMock | null = null;
    private lbPoller: LongbridgeRealtimePoller | null = null;
    private isConnected: boolean = false;
    
    // The Source of Truth: Buffer of Base Interval Candles (e.g., 1m)
    private baseCandles: Candle[] = []; 
    
    // Cache for derived/resampled data
    private derivedBuffers: Map<string, Candle[]> = new Map();

    // Subscribers grouped by Target Interval
    private subscribers: Map<string, Subscription[]> = new Map();

    // Active Monitoring
    private activeTargetIntervals: Set<IntervalType> = new Set();

    // Keep-Alive Mechanism
    private destroyTimeout: ReturnType<typeof setTimeout> | null = null;
    private readonly KEEP_ALIVE_MS = 60000; 

    // Persistence
    private lastSaveTime: number = 0;
    private readonly SAVE_INTERVAL_MS = 60000; 
    
    // Limits
    private readonly MAX_CANDLES = 5000; 

    public isAlwaysActive: boolean = false;

    // Current System Config (for API keys)
    private systemConfig: SystemConfig | null = null;

    constructor(symbol: SymbolType, baseInterval: IntervalType, market: MarketType) {
        this.symbol = symbol;
        this.baseInterval = baseInterval;
        this.market = market;
    }

    public updateSystemConfig(config: SystemConfig) {
        const oldConfig = this.systemConfig?.longbridge;
        const newConfig = config.longbridge;
        
        this.systemConfig = config;
        
        // Check if we need to reconnect due to credential changes
        if (this.market === 'US_STOCK' && this.isConnected) {
            const modeChanged = oldConfig?.enableRealtime !== newConfig.enableRealtime;
            const tokenChanged = oldConfig?.accessToken !== newConfig.accessToken;
            const keyChanged = oldConfig?.appKey !== newConfig.appKey;
            
            // Reconnect if: Mode toggled OR (Realtime is ON and keys changed)
            if (modeChanged || (newConfig.enableRealtime && (tokenChanged || keyChanged))) {
                console.log(`[DataEngine] Credentials changed for ${this.symbol}. Reconnecting...`);
                this.destroyConnection();
                this.connect();
            }
        }
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
        
        // 1. Try Load from Disk
        let localData = FileStore.load<Candle[]>(this.getStoreKey()) || [];
        
        if (localData.length > 0) {
            localData.sort((a, b) => a.time - b.time);
            this.baseCandles = localData;
            
            // 2. Fetch Incremental History
            const lastTime = localData[localData.length - 1].time;
            try {
                let newData: Candle[] = [];
                if (this.market === 'CRYPTO') {
                    newData = await fetchHistoricalCandles(this.symbol, this.baseInterval, lastTime + 1);
                } else {
                    // Pass config to LB service
                    const lbConfig = this.systemConfig?.longbridge;
                    newData = await fetchHistoricalCandlesLB(this.symbol, this.baseInterval, lastTime + 1, undefined, lbConfig);
                }
                
                if (newData.length > 0) {
                    console.log(`[DataEngine] Fetched ${newData.length} new candles for ${this.symbol}`);
                    this.baseCandles = [...this.baseCandles, ...newData];
                }
            } catch (e) {
                console.error("[DataEngine] Failed incremental fetch", e);
            }
        } else {
            // 3. Deep Fetch
            console.log(`[DataEngine] Deep fetching history for ${this.symbol} (${this.market})...`);
            
            if (this.market === 'CRYPTO') {
                let allFetched: Candle[] = [];
                let endTime: number | undefined = undefined; 
                for (let i = 0; i < 3; i++) {
                    try {
                        const batch = await fetchHistoricalCandles(this.symbol, this.baseInterval, undefined, endTime);
                        if (batch.length === 0) break;
                        allFetched = [...batch, ...allFetched];
                        endTime = batch[0].time - 1;
                        if (batch.length < 500) break; 
                    } catch (e) { break; }
                }
                const uniqueMap = new Map();
                allFetched.forEach(c => uniqueMap.set(c.time, c));
                this.baseCandles = Array.from(uniqueMap.values()).sort((a: any, b: any) => a.time - b.time);
            } else {
                // US Stock Initial Fetch with Config
                const lbConfig = this.systemConfig?.longbridge;
                this.baseCandles = await fetchHistoricalCandlesLB(this.symbol, this.baseInterval, undefined, undefined, lbConfig);
            }
            
            console.log(`[DataEngine] Initialized ${this.symbol} with ${this.baseCandles.length} candles.`);
        }

        // Trim to Max Limit
        if (this.baseCandles.length > this.MAX_CANDLES) {
            this.baseCandles = this.baseCandles.slice(-this.MAX_CANDLES);
        }
        
        // Initial Save
        this.saveToDisk();

        // 4. Connect WebSocket (or Mock)
        this.connect();
    }

    private saveToDisk() {
        if (this.baseCandles.length === 0) return;
        FileStore.save(this.getStoreKey(), this.baseCandles);
        this.lastSaveTime = Date.now();
    }

    public subscribe(subId: string, targetInterval: IntervalType, callback: DataCallback) {
        if (this.destroyTimeout) {
            clearTimeout(this.destroyTimeout);
            this.destroyTimeout = null;
        }

        if (!this.subscribers.has(targetInterval)) {
            this.subscribers.set(targetInterval, []);
        }
        this.subscribers.get(targetInterval)!.push({ id: subId, targetInterval, callback });

        // Send current data immediately
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

    public hasSubscribers(): boolean {
        return this.subscribers.size > 0;
    }

    public scheduleDestroy(callback: () => void) {
        if (this.isAlwaysActive) return;
        if (this.hasSubscribers()) return;

        console.log(`[DataEngine] Stream ${this.symbol} has no subscribers. Destroying in ${this.KEEP_ALIVE_MS / 1000}s...`);
        this.destroyTimeout = setTimeout(() => {
            if (!this.hasSubscribers() && !this.isAlwaysActive) {
                this.destroy();
                callback(); 
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
        console.log(`[DataEngine] Destroying Connection: ${this.symbol}`);
        if (this.ws) {
            this.ws.terminate();
            this.ws = null;
        }
        if (this.lbMock) {
            this.lbMock.terminate();
            this.lbMock = null;
        }
        if (this.lbPoller) {
            this.lbPoller.terminate();
            this.lbPoller = null;
        }
        this.isConnected = false;
    }

    private connect() {
        if (this.market === 'CRYPTO') {
            this.connectBinance();
        } else {
            this.connectLongbridge();
        }
    }

    private connectLongbridge() {
        const lbConfig = this.systemConfig?.longbridge;
        
        // Decide: Real vs Mock
        if (lbConfig && lbConfig.enableRealtime && lbConfig.accessToken) {
             console.log(`[DataEngine] Connecting to Longbridge REALTIME API for ${this.symbol}`);
             this.lbPoller = new LongbridgeRealtimePoller(
                 this.symbol, 
                 lbConfig.accessToken, 
                 (candle) => this.processNewCandle(candle),
                 lbConfig.appKey // Pass App Key
             );
             this.lbPoller.connect();
        } else {
             // Fallback to Mock
             const lastCandle = this.baseCandles.length > 0 ? this.baseCandles[this.baseCandles.length - 1] : null;
             const startPrice = lastCandle ? lastCandle.close : 0;
             
             this.lbMock = new LongbridgeSocketMock(this.symbol, startPrice, (candle) => {
                  this.processNewCandle(candle);
             });
             this.lbMock.connect();
        }
        this.isConnected = true;
    }

    private connectBinance() {
        const streamName = `${this.symbol.toLowerCase()}@kline_${this.baseInterval}`;
        const wsUrl = `${BINANCE_WS_BASE}${streamName}`;

        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
            this.isConnected = true;
        });

        this.ws.on('message', (data: WebSocket.Data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.data) {
                    const kline = parseSocketMessage(msg.data);
                    if (kline) {
                        this.processNewCandle(kline);
                    }
                }
            } catch (e) {
                console.error(`[DataEngine] Error parsing message`, e);
            }
        });

        this.ws.on('close', () => {
            this.isConnected = false;
            // Reconnect
            if ((this.hasSubscribers() || this.isAlwaysActive) && !this.destroyTimeout) {
                setTimeout(() => this.connectBinance(), 5000);
            }
        });
        
        this.ws.on('error', (err) => {
             console.error(`[DataEngine] WS Error: ${streamName}`, err);
        });
    }

    private processNewCandle(newCandle: Candle) {
        const lastBase = this.baseCandles[this.baseCandles.length - 1];
        if (lastBase && lastBase.time === newCandle.time) {
            this.baseCandles[this.baseCandles.length - 1] = newCandle;
        } else {
            this.baseCandles.push(newCandle);
        }
        
        if (Date.now() - this.lastSaveTime > this.SAVE_INTERVAL_MS) {
            this.saveToDisk();
        }

        if (this.baseCandles.length > this.MAX_CANDLES) {
            this.baseCandles = this.baseCandles.slice(-this.MAX_CANDLES);
        }

        this.derivedBuffers.clear();

        // 1. Process Active Subscribers
        for (const [interval, subs] of this.subscribers.entries()) {
            const candles = this.getOrCalculateDerivedData(interval as IntervalType);
            subs.forEach(sub => sub.callback(candles));
        }

        // 2. Process Active Monitoring
        if (this.isAlwaysActive) {
            for (const interval of this.activeTargetIntervals) {
                if (!this.subscribers.has(interval)) {
                    this.getOrCalculateDerivedData(interval);
                }
            }
        }
    }

    private getOrCalculateDerivedData(targetInterval: IntervalType): Candle[] {
        if (targetInterval === this.baseInterval) {
            return this.baseCandles.slice(-1000); 
        }

        if (this.derivedBuffers.has(targetInterval)) {
            return this.derivedBuffers.get(targetInterval)!;
        }

        const resampled = resampleCandles(this.baseCandles, targetInterval, this.baseInterval);
        const trimmed = resampled.slice(-1000);
        
        this.derivedBuffers.set(targetInterval, trimmed);
        return trimmed;
    }
}

/**
 * Singleton Data Engine
 */
class DataEngine {
    private static instance: DataEngine;
    private streams: Map<string, StreamHandler> = new Map();
    private systemConfig: SystemConfig | null = null;

    private constructor() {}

    public static getInstance(): DataEngine {
        if (!DataEngine.instance) {
            DataEngine.instance = new DataEngine();
        }
        return DataEngine.instance;
    }

    public updateSystemConfig(config: SystemConfig) {
        this.systemConfig = config;
        // Propagate to all existing streams
        this.streams.forEach(stream => stream.updateSystemConfig(config));
    }

    public async ensureActive(symbol: SymbolType, market: MarketType = 'CRYPTO') {
         // console.log(`[DataEngine] === Pre-warming ALL cycles for ${symbol} (${market}) ===`);
         
         for (const interval of AVAILABLE_INTERVALS) {
             const { baseInterval } = determineBaseConfig(interval);
             const streamKey = `${market}_${symbol}_${baseInterval}`;

             let stream = this.streams.get(streamKey);
             if (!stream) {
                stream = new StreamHandler(symbol, baseInterval, market);
                this.streams.set(streamKey, stream);
                stream.initialize(this.systemConfig).catch(e => console.error(`[DataEngine] Failed to init stream ${streamKey}`, e));
             }

             stream.setAlwaysActive(true);
             stream.addActiveTargetInterval(interval);
         }
         // console.log(`[DataEngine] === Completed setup for ${symbol} ===\n`);
    }

    public async subscribe(
        strategyId: string, 
        symbol: SymbolType, 
        interval: IntervalType, 
        market: MarketType,
        callback: DataCallback
    ) {
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
                if (!stream.hasSubscribers() && !stream.isAlwaysActive) {
                    this.streams.delete(streamKey);
                }
            });
        }
    }
}

export const dataEngine = DataEngine.getInstance();
