
import { Candle, IntervalType, SymbolType, LongbridgeConfig } from "../types";

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
// UPDATED HOST: Use Global endpoint as suggested
const LB_API_HOST = "https://openapi.longbridge.global"; 

// Helper: Ensure US symbols have .US suffix
const normalizeSymbol = (symbol: string): string => {
    if (!symbol) return '';
    const s = symbol.toUpperCase();
    
    // Safety check: if symbol is extremely short (likely polling artifact), ignore it or return as is to fail gracefully
    if (s.length < 2) return s;

    // Check if it already has a dot suffix (e.g. .US, .HK)
    if (s.includes('.')) {
        return s;
    }

    // Heuristic: 1-5 letters usually US stock
    if (/^[A-Z]{1,5}$/.test(s)) {
        return `${s}.US`;
    }
    
    return s;
}

async function fetchQuoteReal(symbolRaw: string, token: string, appKey?: string): Promise<number | null> {
    const symbol = normalizeSymbol(symbolRaw);
    try {
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json' 
        };
        
        if (appKey) {
            headers['x-api-key'] = appKey;
        }

        // Endpoint: /v1/quote/quote
        const url = `${LB_API_HOST}/v1/quote/quote?symbol=${symbol}`;
        
        const response = await fetch(url, { headers });

        if (!response.ok) {
            const errorText = await response.text();
            // Don't log 404s for common polling artifacts if possible, but do log real errors
            if (response.status !== 404) {
                 console.error(`[LB API Error] ${symbol} Status: ${response.status}`, errorText);
            } else {
                 console.warn(`[LB API 404] Symbol not found or API path invalid for: ${symbol} (${url})`);
            }
            throw new Error(`LB API Error: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.code !== 0) {
            console.error(`[LB API Business Error] Code: ${data.code}, Msg: ${data.message}`);
            return null;
        }

        // Extract price
        // Logic simplified to handle standard V2 response structure more gracefully
        // Expected: data: { quote: [ { last_done: ... } ] } OR data: { last_done: ... }
        
        let targetItem = null;
        
        if (data.data) {
            if (Array.isArray(data.data.quote)) {
                targetItem = data.data.quote[0];
            } else if (Array.isArray(data.data.list)) {
                targetItem = data.data.list[0];
            } else if (data.data.last_done !== undefined || data.data.current_price !== undefined || data.data.close !== undefined) {
                targetItem = data.data;
            }
        }

        if (targetItem) {
             const price = targetItem.last_done ?? targetItem.current_price ?? targetItem.close;
             if (typeof price === 'number') return price;
        }
        
        console.warn(`[LB API] Could not extract price for ${symbol}. Data:`, JSON.stringify(data));
        return null;

    } catch (e) {
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
    
    // Attempt to align history with real current price
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

// --- REALTIME POLLER ---
export class LongbridgeRealtimePoller {
    private symbol: string;
    private accessToken: string;
    private appKey?: string;
    private callback: (candle: Candle) => void;
    private intervalId: ReturnType<typeof setInterval> | null = null;
    
    private currentCandle: Candle | null = null;
    private lastPrice: number = 0;
    private consecutiveErrors: number = 0;

    constructor(symbol: string, accessToken: string, callback: (candle: Candle) => void, appKey?: string) {
        this.symbol = symbol;
        this.accessToken = accessToken;
        this.appKey = appKey;
        this.callback = callback;
    }

    public async connect() {
        console.log(`[LB Poller] Starting REALTIME connection for ${this.symbol} to ${LB_API_HOST}...`);
        
        // Initial fetch
        const price = await fetchQuoteReal(this.symbol, this.accessToken, this.appKey);
        if (price) {
            console.log(`[LB Poller] Connected! Initial Price: ${price}`);
            this.lastPrice = price;
            this.consecutiveErrors = 0;
        } else {
            console.warn(`[LB Poller] Initial fetch failed for ${this.symbol}. Check credentials/network.`);
            this.lastPrice = getBasePrice(this.symbol);
        }

        this.intervalId = setInterval(async () => {
            const now = Date.now();
            const timeSlot = Math.floor(now / 60000) * 60000;

            const realPrice = await fetchQuoteReal(this.symbol, this.accessToken, this.appKey);
            
            let currentP = this.lastPrice;

            if (realPrice) {
                currentP = realPrice;
                this.lastPrice = realPrice;
                this.consecutiveErrors = 0;
            } else {
                this.consecutiveErrors++;
                if (this.consecutiveErrors > 10) {
                   if (this.consecutiveErrors % 20 === 0) console.warn(`[LB Poller] Persistent API failure for ${this.symbol} (${this.consecutiveErrors}x)`);
                }
                currentP = this.lastPrice; 
            }

            // Construct/Update Candle
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
                    open: currentP,
                    high: currentP,
                    low: currentP,
                    close: currentP,
                    volume: 0,
                    isClosed: false
                };
            } else {
                // Update current
                this.currentCandle.close = currentP;
                this.currentCandle.high = Math.max(this.currentCandle.high, currentP);
                this.currentCandle.low = Math.min(this.currentCandle.low, currentP);
                this.currentCandle.volume += 10;
            }

            this.callback(this.currentCandle);

        }, 1000); 
    }

    public terminate() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
}

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
