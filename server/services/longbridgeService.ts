
import { Candle, IntervalType, SymbolType } from "../../types";

// Mock Data Generator for US Stocks
// Since we don't have actual Longbridge API keys configured, we simulate data
// to allow the strategy engine and webhooks to be tested.

export const fetchHistoricalCandlesLB = async (
  symbol: SymbolType, 
  interval: IntervalType, 
  startTime?: number, 
  endTime?: number
): Promise<Candle[]> => {
    // Generate 500 candles ending at 'now'
    const now = Date.now();
    const count = 500;
    const candles: Candle[] = [];
    
    // Simulate base price based on symbol hash (so it's consistent)
    const hash = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    let price = (hash % 200) + 100; // Price between 100 and 300
    
    // 1m interval default
    let timeStep = 60 * 1000; 
    
    // Simple start time calculation
    let currentTime = now - (count * timeStep);

    for (let i = 0; i < count; i++) {
        const volatility = price * 0.001; // 0.1% volatility per bar
        const change = (Math.random() - 0.5) * volatility * 2;
        const open = price;
        const close = price + change;
        const high = Math.max(open, close) + Math.random() * volatility;
        const low = Math.min(open, close) - Math.random() * volatility;
        
        candles.push({
            symbol: symbol,
            time: currentTime,
            open: parseFloat(open.toFixed(2)),
            high: parseFloat(high.toFixed(2)),
            low: parseFloat(low.toFixed(2)),
            close: parseFloat(close.toFixed(2)),
            volume: Math.floor(Math.random() * 10000),
            isClosed: true
        });

        price = close;
        currentTime += timeStep;
    }

    return candles;
};

// Simulated Socket Connection
type TickCallback = (candle: Candle) => void;

export class LongbridgeSocketMock {
    private symbol: string;
    private interval: ReturnType<typeof setInterval> | null = null;
    private lastPrice: number = 150;
    private callback: TickCallback;

    constructor(symbol: string, callback: TickCallback) {
        this.symbol = symbol;
        this.callback = callback;
    }

    public connect() {
        console.log(`[LongbridgeMock] Connecting to simulated stream for ${this.symbol}...`);
        
        // Push a new tick every 1 seconds
        this.interval = setInterval(() => {
            const volatility = this.lastPrice * 0.0005;
            const change = (Math.random() - 0.5) * volatility;
            const newPrice = this.lastPrice + change;
            
            const now = Date.now();
            // Snap to nearest minute
            const time = Math.floor(now / 60000) * 60000;

            const candle: Candle = {
                symbol: this.symbol,
                time: time,
                open: this.lastPrice, // Simplified: Open = Prev Close
                high: Math.max(this.lastPrice, newPrice),
                low: Math.min(this.lastPrice, newPrice),
                close: newPrice,
                volume: Math.floor(Math.random() * 100),
                isClosed: false // In real life, check time boundaries
            };

            this.lastPrice = newPrice;
            this.callback(candle);
        }, 1000);
    }

    public terminate() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        console.log(`[LongbridgeMock] Disconnected ${this.symbol}`);
    }
}
