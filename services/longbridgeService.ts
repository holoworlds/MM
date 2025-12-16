
import { Candle, IntervalType, SymbolType, LongbridgeConfig } from "../types";
import { createRequire } from 'module';

// Robustly load longport SDK (Handles cases where package is missing or CJS/ESM mismatch)
const require = createRequire(import.meta.url);

let Config: any;
let QuoteContext: any;
let SubType: any;
let isSdkLoaded = false;

try {
    const lp = require('longport');
    Config = lp.Config;
    QuoteContext = lp.QuoteContext;
    SubType = lp.SubType;
    isSdkLoaded = true;
} catch (e) {
    console.warn("[LongbridgeService] 'longport' package not found or failed to load. Realtime features will fall back to mock data.");
}

// --- Realistic Mock Configuration ---
const MOCK_BASE_PRICES: Record<string, number> = {
    'AAPL.US': 232.00, 'TSLA.US': 265.00, 'NVDA.US': 145.00, 'AMD.US':  165.00, 'MSFT.US': 425.00,
    'COIN.US': 280.00, 'MSTR.US': 1700.00, 'GOOGL.US': 185.00, 'AMZN.US': 200.00, 'META.US': 560.00,
};

const getBasePrice = (symbol: string): number => {
    // Try both with and without .US
    if (MOCK_BASE_PRICES[symbol]) return MOCK_BASE_PRICES[symbol];
    if (MOCK_BASE_PRICES[`${symbol}.US`]) return MOCK_BASE_PRICES[`${symbol}.US`];
    
    const hash = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return (hash % 500) + 50; 
};

// --- REAL API UTILS ---
const LB_API_HOST = "https://openapi.longportapp.com"; 

// Helper: Ensure US symbols have .US suffix
const normalizeSymbol = (symbol: string): string => {
    if (!symbol) return '';
    const s = symbol.toUpperCase();
    
    if (s.length < 2) return s;
    if (s.includes('.')) return s;
    if (/^[A-Z]{1,5}$/.test(s)) return `${s}.US`;
    
    return s;
}

// Fetch Quote via HTTP Snapshot (Pull Mode) - Used for History alignment only
async function fetchQuoteReal(symbolRaw: string, token: string, appKey?: string): Promise<number | null> {
    const symbol = normalizeSymbol(symbolRaw);
    try {
        const headers: Record<string, string> = {
            'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json' 
        };
        
        const url = `${LB_API_HOST}/v1/quote/quote?symbol=${symbol}`;
        const response = await fetch(url, { headers });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`[LB API DEBUG] HTTP ${response.status} for ${symbol}. Response:`, errorBody);
            return null;
        }

        const data = await response.json();
        
        if (data.code !== 0) {
             console.error(`[LB API DEBUG] Business Error Code ${data.code}: ${data.message}`);
             return null;
        }

        let targetItem = null;
        if (data.data) {
             // Priority 1: secu_quote
             if (Array.isArray(data.data.secu_quote) && data.data.secu_quote.length > 0) {
                 targetItem = data.data.secu_quote[0];
             } 
             // Priority 2: list
             else if (Array.isArray(data.data.list) && data.data.list.length > 0) {
                targetItem = data.data.list[0];
            } 
            // Priority 3: quote
            else if (Array.isArray(data.data.quote) && data.data.quote.length > 0) {
                targetItem = data.data.quote[0];
            }
        }

        if (targetItem) {
             const price = parseFloat(targetItem.last_done || targetItem.current_price || targetItem.close);
             if (!isNaN(price)) return price;
        }
        
        return null;
    } catch (e) {
        console.error(`[LB API DEBUG] Network/Parse Error for ${symbol}:`, e);
        return null;
    }
}

export const fetchHistoricalCandlesLB = async (
  symbol: SymbolType, 
  interval: IntervalType, 
  startTime?: number, 
  endTime?: number,
  config?: LongbridgeConfig
): Promise<Candle[]> => {
    
    let endPrice = getBasePrice(symbol);
    
    // Attempt to align history with real current price using HTTP snapshot
    if (config?.enableRealtime && config?.accessToken) {
        const realPrice = await fetchQuoteReal(symbol, config.accessToken, config.appKey);
        if (realPrice) {
            endPrice = realPrice;
        }
    }

    // Generate Mock History ending at endPrice
    const now = Date.now();
    const count = 500;
    const candles: Candle[] = [];
    
    let price = endPrice;
    let timeStep = 60 * 1000; 
    let currentTime = now; 

    for (let i = 0; i < count; i++) {
        const volatility = price * 0.002; 
        const change = (Math.random() - 0.5) * volatility * 2;
        
        const close = price;
        const open = price - change;
        const high = Math.max(open, close) + Math.random() * volatility * 0.5;
        const low = Math.min(open, close) - Math.random() * volatility * 0.5;

        candles.push({
            symbol: symbol,
            time: currentTime,
            open: parseFloat(open.toFixed(2)),
            high: parseFloat(high.toFixed(2)),
            low: parseFloat(low.toFixed(2)),
            close: parseFloat(close.toFixed(2)),
            volume: Math.floor(Math.random() * 50000 + 1000),
            isClosed: true
        });

        price = open;
        currentTime -= timeStep;
    }

    return candles.reverse();
};

// --- REALTIME POLLER (SDK Based) ---
export class LongbridgeRealtimePoller {
    private symbol: string;
    private appKey: string;
    private appSecret: string;
    private accessToken: string;
    private callback: (candle: Candle) => void;
    
    private ctx: any = null; // Use any to avoid TS errors if SDK is missing
    private mockInterval: ReturnType<typeof setInterval> | null = null;
    
    private currentCandle: Candle | null = null;
    private lastPrice: number = 0;

    constructor(symbol: string, accessToken: string, callback: (candle: Candle) => void, appKey: string, appSecret?: string) {
        this.symbol = symbol;
        this.accessToken = accessToken;
        this.callback = callback;
        this.appKey = appKey; 
        this.appSecret = appSecret || '';
    }

    public async connect() {
        if (!isSdkLoaded || !Config || !QuoteContext) {
            console.log(`[LB SDK] SDK module not available. Starting mock fallback for ${this.symbol}.`);
            this.startMockFallback();
            return;
        }

        console.log(`[LB SDK] Initializing SDK for ${this.symbol}...`);
        
        try {
            // Configure SDK
            const config = new Config({
                appKey: this.appKey,
                appSecret: this.appSecret,
                accessToken: this.accessToken,
                enablePrintQuotePackages: false
            });

            this.ctx = new QuoteContext(config);

            // Handle Quote Updates
            this.ctx.setOnQuote((symbol: any, quote: any) => {
                if (symbol !== this.symbol) return;
                
                // Quote data usually has last_done, open, high, low, volume
                const q: any = quote;
                const price = parseFloat(q.lastDone || q.last_done);
                
                if (!isNaN(price)) {
                    this.updateCandle(price, q.volume ? parseInt(q.volume) : 0);
                }
            });

            // Subscribe
            await this.ctx.subscribe([this.symbol], [SubType.Quote], true);
            console.log(`[LB SDK] Subscribed to ${this.symbol} successfully.`);

        } catch (error) {
            console.error(`[LB SDK] Connection failed for ${this.symbol}. Falling back to Mock.`, error);
            this.startMockFallback();
        }
    }

    private updateCandle(price: number, volumeTick: number = 0) {
        const now = Date.now();
        const timeSlot = Math.floor(now / 60000) * 60000;

        if (!this.currentCandle || this.currentCandle.time !== timeSlot) {
            // Close previous
            if (this.currentCandle) {
                this.currentCandle.isClosed = true;
                this.callback(this.currentCandle);
            }
            // Open new
            this.currentCandle = {
                symbol: this.symbol,
                time: timeSlot,
                open: price,
                high: price,
                low: price,
                close: price,
                volume: volumeTick,
                isClosed: false
            };
        } else {
            // Update current
            this.currentCandle.close = price;
            this.currentCandle.high = Math.max(this.currentCandle.high, price);
            this.currentCandle.low = Math.min(this.currentCandle.low, price);
        }

        this.callback(this.currentCandle);
        this.lastPrice = price;
    }

    private startMockFallback() {
        if (this.mockInterval) return;
        
        console.log(`[LB Mock] Starting fallback simulation for ${this.symbol}`);
        this.lastPrice = getBasePrice(this.symbol);

        this.mockInterval = setInterval(() => {
            const volatility = this.lastPrice * 0.0005; 
            const change = (Math.random() - 0.5) * volatility * 2;
            const newPrice = this.lastPrice + change;
            
            this.updateCandle(newPrice, Math.floor(Math.random() * 50));
        }, 1000);
    }

    public terminate() {
        if (this.ctx) {
            try {
                // this.ctx.unsubscribe([this.symbol], ['Quote']);
            } catch(e) {}
            this.ctx = null;
        }
        if (this.mockInterval) {
            clearInterval(this.mockInterval);
            this.mockInterval = null;
        }
    }
}

// Keeping Mock Class for consistency if used elsewhere
export class LongbridgeSocketMock {
    private symbol: string;
    private interval: ReturnType<typeof setInterval> | null = null;
    private currentPrice: number;
    private callback: (candle: Candle) => void;

    constructor(symbol: string, startPrice: number, callback: (candle: Candle) => void) {
        this.symbol = symbol;
        this.callback = callback;
        this.currentPrice = startPrice > 0 ? startPrice : getBasePrice(symbol);
    }

    public connect() {
        console.log(`[LB Mock] Starting SIMULATED data for ${this.symbol}`);
        this.interval = setInterval(() => {
            const volatility = this.currentPrice * 0.0005; 
            const change = (Math.random() - 0.5) * volatility * 3; 
            const newPrice = this.currentPrice + change;
            
            const now = Date.now();
            const time = Math.floor(now / 60000) * 60000;

            const candle: Candle = {
                symbol: this.symbol,
                time: time,
                open: this.currentPrice, 
                high: Math.max(this.currentPrice, newPrice),
                low: Math.min(this.currentPrice, newPrice),
                close: parseFloat(newPrice.toFixed(2)),
                volume: Math.floor(Math.random() * 500 + 10),
                isClosed: false 
            };

            this.currentPrice = newPrice;
            this.callback(candle);
        }, 1000);
    }

    public terminate() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
}
