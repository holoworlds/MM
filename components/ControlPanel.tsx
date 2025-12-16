
import React, { useState } from 'react';
import { StrategyConfig, MarketType, SystemConfig } from '../types';
import { CRYPTO_SYMBOLS, US_STOCK_SYMBOLS, AVAILABLE_INTERVALS } from '../constants';

interface ControlPanelProps {
  activeConfig: StrategyConfig;
  updateConfig: (id: string, updates: Partial<StrategyConfig>) => void;
  strategies: StrategyConfig[];
  selectedStrategyId: string;
  onSelectStrategy: (id: string) => void;
  onAddStrategy: () => void;
  onRemoveStrategy: (id: string) => void;
  lastPrice: number;
  onManualOrder: (type: 'LONG' | 'SHORT' | 'FLAT') => void;
  positionStatus: string;
  systemConfig?: SystemConfig;
  updateSystemConfig?: (cfg: Partial<SystemConfig>) => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ 
  activeConfig, 
  updateConfig, 
  strategies,
  selectedStrategyId,
  onSelectStrategy,
  onAddStrategy,
  onRemoveStrategy,
  lastPrice, 
  onManualOrder, 
  positionStatus,
  systemConfig,
  updateSystemConfig
}) => {
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'config' | 'settings'>('dashboard');

  const handleChange = (key: keyof StrategyConfig, value: any) => {
    updateConfig(activeConfig.id, { [key]: value });
  };

  const handleSysChange = (section: keyof SystemConfig, field: string, value: any) => {
      if (updateSystemConfig && systemConfig) {
          updateSystemConfig({
              [section]: {
                  ...systemConfig[section],
                  [field]: value
              }
          });
      }
  };
  
  const handleMarketChange = (newMarket: string) => {
      const market = newMarket as MarketType;
      const defaultSymbol = market === 'US_STOCK' ? 'AAPL' : 'BTCUSDT';
      updateConfig(activeConfig.id, { 
          market: market, 
          symbol: defaultSymbol
      });
  };

  const handleArrayChange = (arrayKey: 'tpLevels' | 'slLevels', index: number, field: string, value: any) => {
      const newArray = [...activeConfig[arrayKey]];
      newArray[index] = { ...newArray[index], [field]: value };
      updateConfig(activeConfig.id, { [arrayKey]: newArray });
  };

  const getStatusText = (status: string) => {
    if (status === 'LONG') return '多头持仓';
    if (status === 'SHORT') return '空头持仓';
    return '空仓 (Flat)';
  }

  const currentSymbols = activeConfig.market === 'US_STOCK' ? US_STOCK_SYMBOLS : CRYPTO_SYMBOLS;

  return (
    <div className="bg-white rounded-lg border border-slate-200 h-full flex shadow-sm overflow-hidden">
        
        {/* SIDEBAR STRIP */}
        <div className="w-12 bg-slate-100 border-r border-slate-200 flex flex-col items-center py-4 gap-4 flex-shrink-0">
            <button onClick={() => setActiveTab('dashboard')} className={`p-2 rounded-lg transition-all ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-200 hover:text-slate-600'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            </button>
            <button onClick={() => setActiveTab('config')} className={`p-2 rounded-lg transition-all ${activeTab === 'config' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-200 hover:text-slate-600'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
             <button onClick={() => setActiveTab('settings')} className={`p-2 rounded-lg transition-all ${activeTab === 'settings' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-200 hover:text-slate-600'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
            </button>
        </div>

        {/* CONTENT AREA */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/50 p-4">
            
            {/* VIEW 1: DASHBOARD */}
            {activeTab === 'dashboard' && (
                <div className="space-y-6">
                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-center mb-3">
                            <h2 className="text-slate-800 font-bold text-sm">策略列表</h2>
                            <button onClick={onAddStrategy} className="bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-xs shadow-sm transition-colors">+ 新增</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto custom-scrollbar">
                            {strategies.map(s => (
                                <div key={s.id} onClick={() => onSelectStrategy(s.id)} className={`border p-2 rounded cursor-pointer relative transition-all ${selectedStrategyId === s.id ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                                <div className="font-bold text-xs truncate text-slate-800">{s.name}</div>
                                <div className="text-[10px] text-slate-500 flex justify-between">
                                    <span>{s.symbol} {s.interval}</span>
                                    <span className={`${s.market === 'US_STOCK' ? 'text-purple-500' : 'text-slate-400'}`}>{s.market === 'US_STOCK' ? '美股' : 'CRYPTO'}</span>
                                </div>
                                <div className="flex justify-between items-center mt-1">
                                    <div className={`w-2 h-2 rounded-full ${s.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                                    {strategies.length > 1 && selectedStrategyId === s.id && (
                                        <button onClick={(e) => { e.stopPropagation(); onRemoveStrategy(s.id); }} className="text-rose-500 text-[10px] hover:text-rose-600 font-medium">删除</button>
                                    )}
                                </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm space-y-3">
                         <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                             <span className="text-xs text-slate-600 font-bold">策略运行开关</span>
                             <Toggle checked={activeConfig.isActive} onChange={(v: boolean) => handleChange('isActive', v)} size="sm" />
                         </div>
                         <div className="flex justify-between items-center">
                            <div>
                                <div className="text-xs text-slate-500 mb-1">当前持仓 ({activeConfig.symbol})</div>
                                <div className={`text-sm font-bold ${positionStatus === 'FLAT' ? 'text-slate-400' : positionStatus === 'LONG' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {getStatusText(positionStatus)}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs text-slate-500 mb-1">最新价格</div>
                                <div className="text-sm font-mono text-slate-900 font-bold">${lastPrice.toFixed(2)}</div>
                            </div>
                         </div>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <h3 className="text-xs font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2">市场 & 基础设置</h3>
                        <div className="space-y-3">
                            <Input label="策略名称" value={activeConfig.name} onChange={(v: string) => handleChange('name', v)} />
                            <Select label="市场类型" value={activeConfig.market || 'CRYPTO'} options={['CRYPTO', 'US_STOCK']} onChange={handleMarketChange} />
                            <div>
                                <label className="block text-slate-600 text-xs mb-1 font-medium">交易对 / 代码</label>
                                <input list="symbols" value={activeConfig.symbol} onChange={(e) => handleChange('symbol', e.target.value.toUpperCase())} className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs text-slate-900 focus:border-blue-500 outline-none shadow-sm" placeholder={activeConfig.market === 'US_STOCK' ? "如 AAPL, TSLA" : "如 BTCUSDT"}/>
                                <datalist id="symbols">{currentSymbols.map(s => <option key={s} value={s} />)}</datalist>
                            </div>
                            <Select label="K线周期" value={activeConfig.interval} options={AVAILABLE_INTERVALS} onChange={(v: string) => handleChange('interval', v)} />
                            {activeConfig.market === 'US_STOCK' ? (
                                <Input label="开仓数量 (股)" type="number" value={activeConfig.tradeQuantity || 0} onChange={(v: string) => handleChange('tradeQuantity', parseFloat(v))} />
                            ) : (
                                <Input label="开仓金额 (U / USD)" type="number" value={activeConfig.tradeAmount} onChange={(v: string) => handleChange('tradeAmount', parseFloat(v))} />
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* VIEW 2: STRATEGY CONFIGURATION */}
            {activeTab === 'config' && (
                <div className="space-y-6 pb-10">
                    <div className="bg-orange-50 p-3 rounded-lg border border-orange-200 shadow-sm">
                        <div className="flex justify-between items-center mb-3 border-b border-orange-200 pb-2">
                            <h3 className="text-sm font-bold text-orange-700">手动接管 (Manual Takeover)</h3>
                            <Toggle checked={activeConfig.manualTakeover} onChange={(v: boolean) => handleChange('manualTakeover', v)} />
                        </div>
                        <div className="space-y-3 bg-white p-3 rounded border border-orange-100">
                             <Select label="持仓方向" value={activeConfig.takeoverDirection} options={['FLAT', 'LONG', 'SHORT']} onChange={(v: string) => handleChange('takeoverDirection', v)} />
                             <Input label="持仓数量" type="number" value={activeConfig.takeoverQuantity} onChange={(v: string) => handleChange('takeoverQuantity', parseFloat(v))} />
                        </div>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <h3 className="text-xs font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2">信号配置</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center bg-slate-50 p-2 rounded">
                                <span className="text-xs font-bold text-slate-700">触发模式</span>
                                <div className="flex items-center gap-2">
                                    <span className={`text-[10px] ${!activeConfig.triggerOnClose ? 'text-blue-600 font-bold' : 'text-slate-400'}`}>盘中实时</span>
                                    <Toggle checked={activeConfig.triggerOnClose} onChange={(v: boolean) => handleChange('triggerOnClose', v)} size="sm" />
                                    <span className={`text-[10px] ${activeConfig.triggerOnClose ? 'text-blue-600 font-bold' : 'text-slate-400'}`}>K线收盘</span>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="text-xs font-bold text-slate-600">趋势过滤</div>
                                <Toggle label="多头趋势 (7>25>99) 不开空" checked={activeConfig.trendFilterBlockShort} onChange={(v: boolean) => handleChange('trendFilterBlockShort', v)} size="sm" className="bg-slate-50 p-2 rounded"/>
                                <Toggle label="空头趋势 (7<25<99) 不开多" checked={activeConfig.trendFilterBlockLong} onChange={(v: boolean) => handleChange('trendFilterBlockLong', v)} size="sm" className="bg-slate-50 p-2 rounded"/>
                            </div>

                            {/* 1. MACD */}
                            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                <Toggle label="启用 MACD" checked={activeConfig.useMACD} onChange={(v: boolean) => handleChange('useMACD', v)} className="mb-2 font-bold text-slate-800"/>
                                {activeConfig.useMACD && (
                                    <div className="space-y-2 mt-2 border-t border-slate-200 pt-2">
                                        <div className="grid grid-cols-3 gap-2">
                                            <Input label="Fast" type="number" value={activeConfig.macdFast} onChange={(v: string) => handleChange('macdFast', parseFloat(v))} />
                                            <Input label="Slow" type="number" value={activeConfig.macdSlow} onChange={(v: string) => handleChange('macdSlow', parseFloat(v))} />
                                            <Input label="Sig" type="number" value={activeConfig.macdSignal} onChange={(v: string) => handleChange('macdSignal', parseFloat(v))} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 mt-1">
                                            <Toggle label="金叉开多" checked={activeConfig.macdLong} onChange={(v: boolean) => handleChange('macdLong', v)} size="sm" />
                                            <Toggle label="死叉开空" checked={activeConfig.macdShort} onChange={(v: boolean) => handleChange('macdShort', v)} size="sm" />
                                            <Toggle label="金叉平空" checked={activeConfig.macdExitShort} onChange={(v: boolean) => handleChange('macdExitShort', v)} size="sm" />
                                            <Toggle label="死叉平多" checked={activeConfig.macdExitLong} onChange={(v: boolean) => handleChange('macdExitLong', v)} size="sm" />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 2. Price Return to EMA7 */}
                            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                <Toggle label="启用 价格回归 (EMA7)" checked={activeConfig.usePriceReturnEMA7} onChange={(v: boolean) => handleChange('usePriceReturnEMA7', v)} className="mb-2 font-bold text-teal-600"/>
                                {activeConfig.usePriceReturnEMA7 && (
                                    <div className="space-y-2 mt-2 border-t border-slate-200 pt-2">
                                        <p className="text-[10px] text-slate-500">
                                            开启后，开仓必须满足：价格与 EMA7 的距离在下方设定范围内。
                                        </p>
                                        <div className="grid grid-cols-1 gap-2">
                                            <Input 
                                                label="允许回归距离 % (±)" 
                                                type="number" 
                                                value={activeConfig.priceReturnDist} 
                                                onChange={(v: string) => handleChange('priceReturnDist', parseFloat(v))} 
                                                placeholder="例如 0.1"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* EMA Modules */}
                            <div className="space-y-3">
                                {/* 3. EMA 7/25 */}
                                <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                    <Toggle label="启用 EMA 7/25" checked={activeConfig.useEMA7_25} onChange={(v: boolean) => handleChange('useEMA7_25', v)} className="mb-2 font-bold text-blue-600"/>
                                    {activeConfig.useEMA7_25 && (
                                        <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-2">
                                            <Toggle label="上穿开多" checked={activeConfig.ema7_25_Long} onChange={(v: boolean) => handleChange('ema7_25_Long', v)} size="sm" />
                                            <Toggle label="下穿开空" checked={activeConfig.ema7_25_Short} onChange={(v: boolean) => handleChange('ema7_25_Short', v)} size="sm" />
                                            <Toggle label="下穿平多" checked={activeConfig.ema7_25_ExitLong} onChange={(v: boolean) => handleChange('ema7_25_ExitLong', v)} size="sm" />
                                            <Toggle label="上穿平空" checked={activeConfig.ema7_25_ExitShort} onChange={(v: boolean) => handleChange('ema7_25_ExitShort', v)} size="sm" />
                                        </div>
                                    )}
                                </div>

                                {/* 4. EMA 7/99 */}
                                <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                    <Toggle label="启用 EMA 7/99" checked={activeConfig.useEMA7_99} onChange={(v: boolean) => handleChange('useEMA7_99', v)} className="mb-2 font-bold text-indigo-600"/>
                                    {activeConfig.useEMA7_99 && (
                                        <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-2">
                                            <Toggle label="上穿开多" checked={activeConfig.ema7_99_Long} onChange={(v: boolean) => handleChange('ema7_99_Long', v)} size="sm" />
                                            <Toggle label="下穿开空" checked={activeConfig.ema7_99_Short} onChange={(v: boolean) => handleChange('ema7_99_Short', v)} size="sm" />
                                            <Toggle label="下穿平多" checked={activeConfig.ema7_99_ExitLong} onChange={(v: boolean) => handleChange('ema7_99_ExitLong', v)} size="sm" />
                                            <Toggle label="上穿平空" checked={activeConfig.ema7_99_ExitShort} onChange={(v: boolean) => handleChange('ema7_99_ExitShort', v)} size="sm" />
                                        </div>
                                    )}
                                </div>

                                {/* 5. EMA 25/99 */}
                                <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                    <Toggle label="启用 EMA 25/99" checked={activeConfig.useEMA25_99} onChange={(v: boolean) => handleChange('useEMA25_99', v)} className="mb-2 font-bold text-violet-600"/>
                                    {activeConfig.useEMA25_99 && (
                                        <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-2">
                                            <Toggle label="上穿开多" checked={activeConfig.ema25_99_Long} onChange={(v: boolean) => handleChange('ema25_99_Long', v)} size="sm" />
                                            <Toggle label="下穿开空" checked={activeConfig.ema25_99_Short} onChange={(v: boolean) => handleChange('ema25_99_Short', v)} size="sm" />
                                            <Toggle label="下穿平多" checked={activeConfig.ema25_99_ExitLong} onChange={(v: boolean) => handleChange('ema25_99_ExitLong', v)} size="sm" />
                                            <Toggle label="上穿平空" checked={activeConfig.ema25_99_ExitShort} onChange={(v: boolean) => handleChange('ema25_99_ExitShort', v)} size="sm" />
                                        </div>
                                    )}
                                </div>

                                {/* 6. EMA Double */}
                                <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                    <Toggle label="启用 EMA Double (7&25 vs 99)" checked={activeConfig.useEMADouble} onChange={(v: boolean) => handleChange('useEMADouble', v)} className="mb-2 font-bold text-fuchsia-600"/>
                                    {activeConfig.useEMADouble && (
                                        <div className="space-y-2 border-t border-slate-200 pt-2">
                                            <div className="text-[10px] text-slate-500 mb-1">多: 7&gt;99 且 25&gt;99 | 空: 7&lt;99 且 25&lt;99</div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <Toggle label="双上穿开多" checked={activeConfig.emaDoubleLong} onChange={(v: boolean) => handleChange('emaDoubleLong', v)} size="sm" />
                                                <Toggle label="双下穿开空" checked={activeConfig.emaDoubleShort} onChange={(v: boolean) => handleChange('emaDoubleShort', v)} size="sm" />
                                                <Toggle label="双下穿平多" checked={activeConfig.emaDoubleExitLong} onChange={(v: boolean) => handleChange('emaDoubleExitLong', v)} size="sm" />
                                                <Toggle label="双上穿平空" checked={activeConfig.emaDoubleExitShort} onChange={(v: boolean) => handleChange('emaDoubleExitShort', v)} size="sm" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RISK & EXIT */}
                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <h3 className="text-xs font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2">出场 & 风控</h3>
                        <div className="space-y-3">
                             {/* Trailing Stop */}
                             <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                <Toggle label="追踪止盈" checked={activeConfig.useTrailingStop} onChange={(v: boolean) => handleChange('useTrailingStop', v)} className="font-bold mb-2 text-slate-800" />
                                {activeConfig.useTrailingStop && (
                                    <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-2">
                                        <Input label="激活比例 %" type="number" value={activeConfig.trailActivation} onChange={(v: string) => handleChange('trailActivation', parseFloat(v))} />
                                        <Input label="回撤距离 %" type="number" value={activeConfig.trailDistance} onChange={(v: string) => handleChange('trailDistance', parseFloat(v))} />
                                    </div>
                                )}
                            </div>

                            {/* Fixed TP/SL */}
                             <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                <Toggle label="固定止盈止损" checked={activeConfig.useFixedTPSL} onChange={(v: boolean) => handleChange('useFixedTPSL', v)} className="font-bold mb-2 text-slate-800" />
                                {activeConfig.useFixedTPSL && (
                                    <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-2">
                                        <Input label="止盈 %" type="number" value={activeConfig.takeProfitPct} onChange={(v: string) => handleChange('takeProfitPct', parseFloat(v))} />
                                        <Input label="止损 %" type="number" value={activeConfig.stopLossPct} onChange={(v: string) => handleChange('stopLossPct', parseFloat(v))} />
                                    </div>
                                )}
                            </div>

                            {/* Multi Level TP/SL */}
                            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                <Toggle label="多级止盈止损 (4级)" checked={activeConfig.useMultiTPSL} onChange={(v: boolean) => handleChange('useMultiTPSL', v)} className="font-bold mb-2 text-slate-800" />
                                {activeConfig.useMultiTPSL && (
                                    <div className="space-y-4 border-t border-slate-200 pt-2">
                                        <div>
                                            <div className="text-[10px] font-bold text-emerald-600 mb-1">分批止盈 (Take Profit)</div>
                                            {activeConfig.tpLevels.map((tp: any, idx: number) => (
                                                <div key={`tp-${idx}`} className="flex items-center gap-2 mb-1">
                                                    <span className="text-[10px] w-4 text-slate-500">#{idx+1}</span>
                                                    <div className="w-16"><Input value={tp.pct} onChange={(v: string) => handleArrayChange('tpLevels', idx, 'pct', parseFloat(v))} placeholder="%" /></div>
                                                    <span className="text-[10px] text-slate-400">%价</span>
                                                    <div className="w-16"><Input value={tp.qtyPct} onChange={(v: string) => handleArrayChange('tpLevels', idx, 'qtyPct', parseFloat(v))} placeholder="Qty%" /></div>
                                                    <span className="text-[10px] text-slate-400">%量</span>
                                                    <Toggle checked={tp.active} onChange={(v: boolean) => handleArrayChange('tpLevels', idx, 'active', v)} size="sm" />
                                                </div>
                                            ))}
                                        </div>
                                        <div>
                                            <div className="text-[10px] font-bold text-rose-600 mb-1">分批止损 (Stop Loss)</div>
                                            {activeConfig.slLevels.map((sl: any, idx: number) => (
                                                <div key={`sl-${idx}`} className="flex items-center gap-2 mb-1">
                                                     <span className="text-[10px] w-4 text-slate-500">#{idx+1}</span>
                                                    <div className="w-16"><Input value={sl.pct} onChange={(v: string) => handleArrayChange('slLevels', idx, 'pct', parseFloat(v))} placeholder="%" /></div>
                                                    <span className="text-[10px] text-slate-400">%价</span>
                                                    <div className="w-16"><Input value={sl.qtyPct} onChange={(v: string) => handleArrayChange('slLevels', idx, 'qtyPct', parseFloat(v))} placeholder="Qty%" /></div>
                                                    <span className="text-[10px] text-slate-400">%量</span>
                                                    <Toggle checked={sl.active} onChange={(v: boolean) => handleArrayChange('slLevels', idx, 'active', v)} size="sm" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            {/* Reverse Strategy */}
                            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                <Toggle label="反手策略" checked={activeConfig.useReverse} onChange={(v: boolean) => handleChange('useReverse', v)} className="font-bold mb-2 text-purple-600" />
                                {activeConfig.useReverse && (
                                    <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-2">
                                        <Toggle label="多转空" checked={activeConfig.reverseLongToShort} onChange={(v: boolean) => handleChange('reverseLongToShort', v)} size="sm" />
                                        <Toggle label="空转多" checked={activeConfig.reverseShortToLong} onChange={(v: boolean) => handleChange('reverseShortToLong', v)} size="sm" />
                                    </div>
                                )}
                            </div>

                            <Input label="每日最大交易次数" type="number" value={activeConfig.maxDailyTrades} onChange={(v: string) => handleChange('maxDailyTrades', parseFloat(v))} />
                        </div>
                    </div>

                </div>
            )}
            
            {activeTab === 'settings' && (
                <div className="space-y-6 pb-10">
                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <h3 className="text-sm font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                            <span className="text-lg">⚙️</span> 全局系统设置
                        </h3>
                        {!systemConfig ? (
                           <div className="p-4 text-center text-slate-400 text-xs">正在加载配置...</div>
                        ) : (
                            <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className="font-bold text-indigo-800">Longbridge (长桥) API 配置</h4>
                                    <Toggle 
                                        label="启用实时数据" 
                                        checked={systemConfig.longbridge.enableRealtime} 
                                        onChange={(v: boolean) => handleSysChange('longbridge', 'enableRealtime', v)} 
                                        className="font-bold text-indigo-600"
                                    />
                                </div>
                                <div className="space-y-3">
                                    <p className="text-xs text-indigo-600 mb-2">
                                        请填写长桥 Open API 凭证以获取美股实时数据。如未填写或未启用，系统将使用模拟数据。
                                    </p>
                                    <Input 
                                        label="Access Token (OAuth / Persistent Token)" 
                                        value={systemConfig.longbridge.accessToken} 
                                        onChange={(v: string) => handleSysChange('longbridge', 'accessToken', v)} 
                                        type="password"
                                    />
                                    <div className="grid grid-cols-2 gap-3">
                                        <Input 
                                            label="App Key (Optional)" 
                                            value={systemConfig.longbridge.appKey} 
                                            onChange={(v: string) => handleSysChange('longbridge', 'appKey', v)} 
                                        />
                                        <Input 
                                            label="App Secret (Optional)" 
                                            value={systemConfig.longbridge.appSecret} 
                                            onChange={(v: string) => handleSysChange('longbridge', 'appSecret', v)} 
                                            type="password"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};

const Input = ({ label, value, onChange, type = "text", placeholder }: any) => (
  <div className="mb-2">
    {label && <label className="block text-slate-600 text-xs mb-1 font-medium">{label}</label>}
    <input 
      type={type} 
      value={value} 
      onChange={(e) => onChange(e.target.value)} 
      placeholder={placeholder}
      className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs text-slate-900 focus:border-blue-500 outline-none shadow-sm"
    />
  </div>
);

const Select = ({ label, value, options, onChange }: any) => (
  <div className="mb-2">
    <label className="block text-slate-600 text-xs mb-1 font-medium">{label}</label>
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs text-slate-900 focus:border-blue-500 outline-none shadow-sm">
      {options.map((o: any) => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

const Toggle = ({ label, checked, onChange, size = "md", className = "" }: any) => (
  <div className={`flex items-center justify-between ${className}`}>
    <span className={`text-slate-700 font-medium ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>{label}</span>
    <button onClick={() => onChange(!checked)} className={`relative inline-flex items-center rounded-full transition-colors shadow-inner ${checked ? 'bg-blue-600' : 'bg-slate-300'} ${size === 'sm' ? 'h-4 w-8' : 'h-6 w-11'}`}>
      <span className={`inline-block transform rounded-full bg-white transition-transform shadow-sm ${size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} ${checked ? (size === 'sm' ? 'translate-x-4' : 'translate-x-6') : 'translate-x-1'}`} />
    </button>
  </div>
);

export default ControlPanel;
