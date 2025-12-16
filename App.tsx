
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { StrategyConfig, AlertLog, PositionState, TradeStats, StrategyRuntime, Candle, SystemConfig } from './types';
import { DEFAULT_CONFIG } from './constants';
import Chart from './components/Chart';
import ControlPanel from './components/ControlPanel';
import LogPanel from './components/LogPanel';
import { enrichCandlesWithIndicators } from './services/indicatorService';

// Determine Socket URL based on environment
const isEnvDefined = import.meta && import.meta.env;
const isProduction = isEnvDefined ? import.meta.env.PROD : true;

const SERVER_URL = isProduction 
  ? `${window.location.protocol}//${window.location.hostname}:3001`
  : undefined;

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
const INITIAL_STATS: TradeStats = { dailyTradeCount: 0, lastTradeDate: '', lastActionCandleTime: 0 };

const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
    longbridge: {
        enableRealtime: false,
        appKey: '',
        appSecret: '',
        accessToken: ''
    }
};

// --- Mock Data Generator for Demo Mode ---
const generateMockCandles = (count: number, startPrice: number): Candle[] => {
    const candles: Candle[] = [];
    let currentPrice = startPrice;
    let time = Date.now() - count * 60 * 1000; // Start 'count' minutes ago

    for (let i = 0; i < count; i++) {
        const volatility = currentPrice * 0.002; // 0.2% volatility
        const change = (Math.random() - 0.5) * volatility;
        const open = currentPrice;
        const close = currentPrice + change;
        const high = Math.max(open, close) + Math.random() * volatility * 0.5;
        const low = Math.min(open, close) - Math.random() * volatility * 0.5;
        const volume = Math.random() * 100 + 50;

        candles.push({
            symbol: 'BTCUSDT',
            time: time,
            open,
            high,
            low,
            close,
            volume,
            isClosed: true
        });

        currentPrice = close;
        time += 60 * 1000;
    }

    // Enrich with indicators using the same service logic
    return enrichCandlesWithIndicators(candles, {
        macdFast: 12,
        macdSlow: 26,
        macdSignal: 9
    });
};

const App: React.FC = () => {
  // Initialize with Default Strategy
  const [strategies, setStrategies] = useState<Record<string, StrategyRuntime>>({
      [DEFAULT_CONFIG.id]: {
          config: DEFAULT_CONFIG,
          candles: [],
          positionState: INITIAL_POS_STATE,
          tradeStats: INITIAL_STATS,
          lastPrice: 0
      }
  });
  // Fix: Initialize with default config so UI renders immediately
  const [systemConfig, setSystemConfig] = useState<SystemConfig>(DEFAULT_SYSTEM_CONFIG);
  const [activeStrategyId, setActiveStrategyId] = useState<string>(DEFAULT_CONFIG.id);
  const [logs, setLogs] = useState<AlertLog[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  
  // Buffer for throttling updates
  const pendingUpdatesRef = useRef<Record<string, StrategyRuntime>>({});

  // --- Socket Connection & Demo Mode Logic ---
  useEffect(() => {
    // Robust connection options
    const socket = io(SERVER_URL, {
        transports: ['websocket', 'polling'], // Allow fallback
        reconnectionAttempts: 10,
        reconnectionDelay: 2000
    } as any);
    socketRef.current = socket;

    socket.on('connect', () => {
        console.log('Connected to Backend:', SERVER_URL || 'Proxy Mode');
        setIsConnected(true);
        setIsDemoMode(false); // Disable demo mode on connection
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from Backend');
        setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
        console.warn('Socket Connection Error:', err.message);
    });

    // Receive Full State
    socket.on('full_state', (data: Record<string, StrategyRuntime>) => {
        setStrategies(data);
        setActiveStrategyId(prevId => {
             if (!data[prevId]) {
                const keys = Object.keys(data);
                if (keys.length > 0) return keys[0];
             }
             return prevId;
        });
    });
    
    // System Config Init
    socket.on('system_config_update', (config: SystemConfig) => {
        if (config) {
            setSystemConfig(config);
        }
    });

    // Receive Incremental Updates
    socket.on('state_update', ({ id, runtime }: { id: string, runtime: StrategyRuntime }) => {
        pendingUpdatesRef.current[id] = runtime;
    });

    // Logs
    socket.on('logs_update', (allLogs: AlertLog[]) => {
        setLogs(allLogs);
    });

    socket.on('log_new', (log: AlertLog) => {
        setLogs(prev => [log, ...prev].slice(0, 500));
    });

    // --- Demo Mode Trigger ---
    // Increased timeout to 5 seconds to handle remote server latency
    const demoTimeout = setTimeout(() => {
        if (!socket.connected) {
            console.log("Backend unreachable (5s timeout). Activating Demo Mode.");
            setIsDemoMode(true);
            
            const mockCandles = generateMockCandles(150, 65000);
            
            setStrategies(prev => ({
                ...prev,
                [DEFAULT_CONFIG.id]: {
                    ...prev[DEFAULT_CONFIG.id],
                    candles: mockCandles,
                    lastPrice: mockCandles[mockCandles.length - 1].close
                }
            }));
        }
    }, 5000);

    // Throttling Interval
    const throttleInterval = setInterval(() => {
        if (Object.keys(pendingUpdatesRef.current).length > 0) {
            setStrategies(prev => {
                const updates = pendingUpdatesRef.current;
                pendingUpdatesRef.current = {}; 
                return { ...prev, ...updates };
            });
        }
    }, 250);

    return () => {
        clearTimeout(demoTimeout);
        clearInterval(throttleInterval);
        socket.disconnect();
    };
  }, []); 

  // --- Actions ---
  const updateStrategyConfig = (id: string, updates: Partial<StrategyConfig>) => {
      socketRef.current?.emit('cmd_update_config', { id, updates });
      
      // Optimistic update
      setStrategies(prev => {
          if (!prev[id]) return prev;
          return {
              ...prev,
              [id]: {
                  ...prev[id],
                  config: { ...prev[id].config, ...updates }
              }
          };
      });
  };

  const updateSystemConfig = (cfg: Partial<SystemConfig>) => {
      socketRef.current?.emit('cmd_update_system_config', cfg);
      // Optimistic
      setSystemConfig(prev => ({ ...prev, ...cfg }));
  };

  const addStrategy = () => {
      if (isDemoMode) {
          alert("演示模式下无法添加真实策略。请检查后端连接 (端口 3001)。");
          return;
      }
      socketRef.current?.emit('cmd_add_strategy');
  };

  const removeStrategy = (id: string) => {
      if (isDemoMode) {
          alert("演示模式下无法删除策略。");
          return;
      }
      socketRef.current?.emit('cmd_remove_strategy', id);
  };

  const handleManualOrder = (type: 'LONG' | 'SHORT' | 'FLAT') => {
      if (isDemoMode) {
          alert("演示模式下无法提交订单。");
          return;
      }
      socketRef.current?.emit('cmd_manual_order', { id: activeStrategyId, type });
  };

  // Resizing State
  const [logPanelHeight, setLogPanelHeight] = useState<number>(200);
  const isResizingRef = useRef(false);
  
  const startResizing = useCallback(() => {
    isResizingRef.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const stopResizing = useCallback(() => {
    isResizingRef.current = false;
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizingRef.current) return;
    const newHeight = window.innerHeight - e.clientY;
    if (newHeight > 100 && newHeight < window.innerHeight * 0.8) {
        setLogPanelHeight(newHeight);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopResizing);
    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', stopResizing);
    };
  }, [handleMouseMove, stopResizing]);


  // --- Render ---
  
  const activeStrategy = strategies[activeStrategyId] || {
      config: DEFAULT_CONFIG,
      candles: [],
      positionState: INITIAL_POS_STATE,
      tradeStats: INITIAL_STATS,
      lastPrice: 0
  };

  const activeStrategyLogs = logs.filter(l => l.strategyId === activeStrategyId);

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-900 overflow-hidden font-sans">
      <div className="w-[360px] flex-shrink-0 p-2 border-r border-slate-200">
        <ControlPanel 
           activeConfig={activeStrategy.config} 
           updateConfig={updateStrategyConfig}
           strategies={Object.values(strategies).map((s: StrategyRuntime) => s.config)}
           selectedStrategyId={activeStrategyId}
           onSelectStrategy={setActiveStrategyId}
           onAddStrategy={addStrategy}
           onRemoveStrategy={removeStrategy}
           lastPrice={activeStrategy.lastPrice} 
           onManualOrder={handleManualOrder}
           positionStatus={activeStrategy.positionState.direction}
           systemConfig={systemConfig}
           updateSystemConfig={updateSystemConfig}
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 border-b border-slate-200 flex items-center px-4 bg-white justify-between flex-shrink-0 shadow-sm">
          <div className="flex items-center gap-4">
            <h1 className="font-bold bg-gradient-to-r from-blue-600 to-emerald-600 text-transparent bg-clip-text">
              加密货币量化监控 - {activeStrategy.config.name} ({activeStrategy.config.symbol})
            </h1>
            <div className={`text-xs px-2 py-0.5 rounded border font-medium ${isConnected ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                {isConnected ? '后端在线' : isDemoMode ? '演示模式 (模拟数据)' : '连接中...'}
            </div>
            {isConnected && (
                <span className="text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                今日交易: {activeStrategy.tradeStats.dailyTradeCount} / {activeStrategy.config.maxDailyTrades}
                </span>
            )}
          </div>
          <div className="flex items-center space-x-2 text-xs text-slate-500">
             <span className="w-2 h-2 rounded-full bg-yellow-500"></span> <span>EMA7</span>
             <span className="w-2 h-2 rounded-full bg-blue-500"></span> <span>EMA25</span>
             <span className="w-2 h-2 rounded-full bg-purple-500"></span> <span>EMA99</span>
          </div>
        </header>

        <div className="flex-1 p-2 relative flex flex-col min-h-0">
          <div className="flex-1 rounded border border-slate-200 bg-white shadow-sm overflow-hidden relative">
             <Chart 
                data={activeStrategy.candles} 
                logs={activeStrategyLogs}
                symbol={activeStrategy.config.symbol}
                interval={activeStrategy.config.interval}
                market={activeStrategy.config.market}
             />
          </div>
        </div>

        <div 
          className="h-2 bg-slate-100 hover:bg-blue-100 cursor-row-resize flex items-center justify-center border-t border-b border-slate-200 transition-colors flex-shrink-0"
          onMouseDown={startResizing}
        >
           <div className="w-8 h-1 bg-slate-300 rounded-full"></div>
        </div>

        <div style={{ height: logPanelHeight }} className="flex-shrink-0 bg-white overflow-hidden">
           <LogPanel 
             logs={logs} 
             strategies={Object.values(strategies).map((s: StrategyRuntime) => ({ id: s.config.id, name: s.config.name, symbol: s.config.symbol }))}
           />
        </div>
      </div>
    </div>
  );
};

export default App;
