
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { StrategyRunner } from './StrategyRunner';
import { DEFAULT_CONFIG, PRELOAD_SYMBOLS } from '../constants';
import { StrategyConfig, StrategyRuntime, SystemConfig } from '../types';
import { FileStore } from './FileStore';
import { dataEngine } from './DataEngine';
import { fetchValidSymbols } from '../services/binanceService';

const app = express();
app.use(cors() as any);
app.use(express.json() as any);

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

const PORT = 3001;

// --- Server State ---
const strategies: Record<string, StrategyRunner> = {};
let logs: any[] = [];
let validSymbols: string[] = [];

function saveSystemState() {
    try {
        const validStrats = Object.values(strategies).filter(s => s && typeof s.getSnapshot === 'function');
        const strategySnapshots = validStrats.map(s => s.getSnapshot());
        if (strategySnapshots.length > 0) {
            FileStore.save('strategies', strategySnapshots);
        }
        FileStore.save('logs', logs);
    } catch (e) {
        console.error('[System] Error saving state:', e);
    }
}

async function initializeSystem() {
    console.log('[System] Initializing...');
    
    // 获取合法交易对名单
    validSymbols = await fetchValidSymbols();
    console.log(`[System] Loaded ${validSymbols.length} valid symbols from Binance.`);

    for (const symbol of PRELOAD_SYMBOLS) {
        dataEngine.ensureActive(symbol).catch(err => console.error(`[System] Pre-warm failed for ${symbol}`, err)); 
    }
    const savedLogs = FileStore.load<any[]>('logs');
    if (savedLogs && Array.isArray(savedLogs)) logs = savedLogs;

    const savedSnapshots = FileStore.load<any[]>('strategies');
    if (savedSnapshots && Array.isArray(savedSnapshots) && savedSnapshots.length > 0) {
        for (const snapshot of savedSnapshots) {
            try {
                const sanitizedConfig = { ...DEFAULT_CONFIG, ...snapshot.config, market: 'CRYPTO' };
                const runner = new StrategyRunner(
                    sanitizedConfig,
                    (id, runtime) => broadcastUpdate(id, runtime),
                    (log) => { addLog(log); saveSystemState(); },
                    validSymbols // 传入合法名单
                );
                if (snapshot.positionState && snapshot.tradeStats) runner.restoreState(snapshot.positionState, snapshot.tradeStats);
                strategies[sanitizedConfig.id] = runner;
                await runner.start();
            } catch (err) {
                console.error(`[System] Failed to restore strategy:`, err);
            }
        }
    } else {
        const defaultRunner = new StrategyRunner(
            DEFAULT_CONFIG, 
            (id, runtime) => broadcastUpdate(id, runtime),
            (log) => { addLog(log); saveSystemState(); },
            validSymbols
        );
        strategies[DEFAULT_CONFIG.id] = defaultRunner;
        defaultRunner.start();
    }
}

function broadcastUpdate(id: string, runtime: StrategyRuntime) {
    io.emit('state_update', { id, runtime });
}

function broadcastFullState(socketId?: string) {
    const fullState: Record<string, StrategyRuntime> = {};
    Object.keys(strategies).forEach(id => {
        if (strategies[id]) fullState[id] = strategies[id].runtime;
    });
    if (socketId) {
        io.to(socketId).emit('full_state', fullState);
        io.to(socketId).emit('logs_update', logs);
    } else {
        io.emit('full_state', fullState);
        io.emit('logs_update', logs);
    }
}

function addLog(log: any) {
    logs = [log, ...logs].slice(0, 500);
    io.emit('log_new', log);
}

io.on('connection', (socket) => {
    broadcastFullState(socket.id);
    socket.on('cmd_sync_state', () => broadcastFullState(socket.id));
    socket.on('cmd_update_config', ({ id, updates }: { id: string, updates: Partial<StrategyConfig> }) => {
        const runner = strategies[id];
        if (runner) {
            runner.updateConfig({ ...runner.runtime.config, ...updates });
            saveSystemState();
        }
    });
    socket.on('cmd_add_strategy', () => {
        const newId = Math.random().toString(36).substr(2, 9);
        const newConfig = { ...DEFAULT_CONFIG, id: newId, name: `策略 #${Object.keys(strategies).length + 1}` };
        const newRunner = new StrategyRunner(
            newConfig,
            (id, runtime) => broadcastUpdate(id, runtime),
            (log) => { addLog(log); saveSystemState(); },
            validSymbols
        );
        strategies[newId] = newRunner;
        newRunner.start();
        saveSystemState(); 
        broadcastFullState();
        socket.emit('strategy_added', newId);
    });
    socket.on('cmd_remove_strategy', (id: string) => {
        if (strategies[id]) {
            strategies[id].stop();
            delete strategies[id];
            saveSystemState();
            broadcastFullState();
        }
    });
    socket.on('cmd_manual_order', ({ id, type }: { id: string, type: 'LONG'|'SHORT'|'FLAT' }) => {
        if (strategies[id]) {
            strategies[id].handleManualOrder(type);
            saveSystemState();
        }
    });
});

setInterval(() => saveSystemState(), 60000);
initializeSystem().then(() => {
    server.listen(PORT, () => console.log(`Backend Server running on port ${PORT}`));
}).catch(err => console.error(err));
