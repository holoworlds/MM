
import React, { useState } from 'react';
import { StrategyConfig, SystemConfig, StrategyRuntime } from '../types';
import { CRYPTO_SYMBOLS, AVAILABLE_INTERVALS } from '../constants';

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
  allRuntimes?: Record<string, StrategyRuntime>; 
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
  allRuntimes
}) => {
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'config'>('dashboard');

  const handleChange = (key: keyof StrategyConfig, value: any) => {
    updateConfig(activeConfig.id, { [key]: value });
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

  const currentSymbols = CRYPTO_SYMBOLS;

  return (
    <div className="bg-white rounded-lg border border-slate-200 h-full flex shadow-sm overflow-hidden text-slate-800">
        
        {/* SIDEBAR STRIP */}
        <div className="w-12 bg-slate-100 border-r border-slate-200 flex flex-col items-center py-4 gap-4 flex-shrink-0">
            <button onClick={() => setActiveTab('dashboard')} className={`p-2 rounded-lg transition-all ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-200 hover:text-slate-600'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            </button>
            <button onClick={() => setActiveTab('config')} className={`p-2 rounded-lg transition-all ${activeTab === 'config' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-200 hover:text-slate-600'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
        </div>

        {/* CONTENT AREA */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/50 p-4">
            
            {/* VIEW 1: DASHBOARD */}
            {activeTab === 'dashboard' && (
                <div className="space-y-6">
                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                        <div className="flex justify-between items-center px-3 py-2 border-b border-slate-100 bg-slate-50">
                            <h2 className="text-slate-800 font-bold text-xs">策略列表 ({strategies.length})</h2>
                            <button onClick={onAddStrategy} className="bg-blue-600 hover:bg-blue-500 text-white px-2 py-0.5 rounded text-[10px] shadow-sm transition-colors">+ 添加</button>
                        </div>
                        <div className="max-h-96 overflow-y-auto custom-scrollbar divide-y divide-slate-50">
                            {strategies.map(s => {
                                const runtime = allRuntimes?.[s.id];
                                const dir = runtime?.positionState?.direction || 'FLAT';
                                return (
                                    <div 
                                      key={s.id} 
                                      onClick={() => onSelectStrategy(s.id)} 
                                      className={`p-2 px-3 cursor-pointer transition-all flex items-center justify-between gap-2 ${selectedStrategyId === s.id ? 'bg-blue-50/80 ring-inset ring-1 ring-blue-100' : 'hover:bg-slate-50'}`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
                                            <span className={`text-[11px] font-bold truncate max-w-[90px] ${selectedStrategyId === s.id ? 'text-blue-700' : 'text-slate-700'}`}>{s.name}</span>
                                            
                                            {/* 状态标签紧随名称 */}
                                            {dir === 'LONG' && <span className="text-[8px] bg-emerald-500 text-white px-1 rounded font-bold leading-tight flex-shrink-0">多头</span>}
                                            {dir === 'SHORT' && <span className="text-[8px] bg-rose-500 text-white px-1 rounded font-bold leading-tight flex-shrink-0">空头</span>}
                                            {dir === 'FLAT' && <span className="text-[8px] bg-slate-200 text-slate-500 px-1 rounded leading-tight flex-shrink-0">空仓</span>}
                                            
                                            <span className="text-[9px] text-slate-400 font-mono flex-shrink-0 border-l border-slate-200 pl-1.5 ml-1">{s.symbol}</span>
                                        </div>
                                        
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[9px] text-slate-400 font-mono uppercase">{s.interval}</span>
                                            {selectedStrategyId === s.id && strategies.length > 1 && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); onRemoveStrategy(s.id); }} 
                                                    className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm space-y-3">
                         <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                             <span className="text-xs text-slate-600 font-bold">运行开关</span>
                             <Toggle checked={activeConfig.isActive} onChange={(v: boolean) => handleChange('isActive', v)} size="sm" />
                         </div>
                         <div className="flex justify-between items-center px-1">
                            <div>
                                <div className="text-[10px] text-slate-500 mb-0.5 uppercase">Status</div>
                                <div className={`text-xs font-bold ${positionStatus === 'FLAT' ? 'text-slate-400' : positionStatus === 'LONG' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {getStatusText(positionStatus)}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] text-slate-500 mb-0.5 uppercase">Price</div>
                                <div className="text-xs font-mono text-slate-900 font-bold">${lastPrice.toFixed(2)}</div>
                            </div>
                         </div>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <h3 className="text-xs font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2">基础设置</h3>
                        <div className="space-y-3">
                            <Input label="策略名称" value={activeConfig.name} onChange={(v: string) => handleChange('name', v)} />
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-slate-600 text-[10px] mb-1 font-medium uppercase">Symbol</label>
                                    <input list="symbols" value={activeConfig.symbol} onChange={(e) => handleChange('symbol', e.target.value.toUpperCase())} className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs text-slate-900 focus:border-blue-500 outline-none shadow-sm" />
                                    <datalist id="symbols">{currentSymbols.map(s => <option key={s} value={s} />)}</datalist>
                                </div>
                                <Select label="Interval" value={activeConfig.interval} options={AVAILABLE_INTERVALS} onChange={(v: string) => handleChange('interval', v)} />
                            </div>
                            <Input label="开仓金额 (U / USD)" type="number" value={activeConfig.tradeAmount} onChange={(v: string) => handleChange('tradeAmount', parseFloat(v))} />
                        </div>
                    </div>
                </div>
            )}

            {/* VIEW 2: STRATEGY CONFIGURATION */}
            {activeTab === 'config' && (
                <div className="space-y-6 pb-10">
                    <div className="bg-orange-50 p-3 rounded-lg border border-orange-200 shadow-sm">
                        <div className="flex justify-between items-center mb-3 border-b border-orange-200 pb-2">
                            <h3 className="text-sm font-bold text-orange-700">手动接管 (Takeover)</h3>
                            <Toggle checked={activeConfig.manualTakeover} onChange={(v: boolean) => handleChange('manualTakeover', v)} />
                        </div>
                        <div className="space-y-3 bg-white p-3 rounded border border-orange-100">
                             <Select label="方向" value={activeConfig.takeoverDirection} options={['FLAT', 'LONG', 'SHORT']} onChange={(v: string) => handleChange('takeoverDirection', v)} />
                             <Input label="数量" type="number" value={activeConfig.takeoverQuantity} onChange={(v: string) => handleChange('takeoverQuantity', parseFloat(v))} />
                        </div>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <h3 className="text-xs font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2">信号配置</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center bg-slate-50 p-2 rounded">
                                <span className="text-xs font-bold text-slate-700">触发模式</span>
                                <div className="flex items-center gap-2">
                                    <span className={`text-[10px] ${!activeConfig.triggerOnClose ? 'text-blue-600 font-bold' : 'text-slate-400'}`}>实时</span>
                                    <Toggle checked={activeConfig.triggerOnClose} onChange={(v: boolean) => handleChange('triggerOnClose', v)} size="sm" />
                                    <span className={`text-[10px] ${activeConfig.triggerOnClose ? 'text-blue-600 font-bold' : 'text-slate-400'}`}>收盘</span>
                                </div>
                            </div>
                            
                            {/* 延后开仓配置 */}
                            <div className="bg-blue-50 p-2 rounded border border-blue-100">
                                <Toggle label="延后开仓 (EMA7/25)" checked={activeConfig.useDelayedEntry} onChange={(v: boolean) => handleChange('useDelayedEntry', v)} className="font-bold text-blue-700 mb-2" />
                                {activeConfig.useDelayedEntry && (
                                    <div className="space-y-2 border-t border-blue-200 pt-2">
                                        <p className="text-[10px] text-blue-600 italic">从开启激活起(🚩)，当符合方向要求的信号出现第 N 次时开仓。</p>
                                        <div className="grid grid-cols-1 gap-2">
                                          <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-slate-500 whitespace-nowrap">监测方向:</span>
                                            <div className="flex-1">
                                                <select 
                                                  value={activeConfig.delayedEntryType} 
                                                  onChange={(e) => handleChange('delayedEntryType', e.target.value)}
                                                  className="w-full bg-white border border-blue-200 rounded p-1 text-[10px] text-blue-800 outline-none shadow-sm"
                                                >
                                                    <option value="BOTH">双向 (金叉+死叉均记录)</option>
                                                    <option value="LONG">仅上穿开多 (记录金叉)</option>
                                                    <option value="SHORT">仅下穿开空 (记录死叉)</option>
                                                </select>
                                            </div>
                                          </div>
                                          <Input label="第 N 次信号触发" type="number" min="1" step="1" value={activeConfig.delayedEntryTargetCount} onChange={(v: string) => handleChange('delayedEntryTargetCount', parseInt(v))} />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">Trend Filter</div>
                                <Toggle label="7>25>99 不开空" checked={activeConfig.trendFilterBlockShort} onChange={(v: boolean) => handleChange('trendFilterBlockShort', v)} size="sm" className="bg-slate-50 p-2 rounded"/>
                                <Toggle label="7<25<99 不开多" checked={activeConfig.trendFilterBlockLong} onChange={(v: boolean) => handleChange('trendFilterBlockLong', v)} size="sm" className="bg-slate-50 p-2 rounded"/>
                            </div>

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
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                <Toggle label="EMA7 价格回归" checked={activeConfig.usePriceReturnEMA7} onChange={(v: boolean) => handleChange('usePriceReturnEMA7', v)} className="mb-2 font-bold text-teal-600"/>
                                {activeConfig.usePriceReturnEMA7 && (
                                    <div className="space-y-2 mt-2 border-t border-slate-200 pt-2">
                                        <Input 
                                            label="允许回归距离 % (±)" 
                                            type="number" 
                                            step="0.01"
                                            value={activeConfig.priceReturnDist} 
                                            onChange={(v: string) => handleChange('priceReturnDist', parseFloat(v))} 
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                <Toggle label="EMA 7/25" checked={activeConfig.useEMA7_25} onChange={(v: boolean) => handleChange('useEMA7_25', v)} className="mb-2 font-bold text-blue-600"/>
                                {activeConfig.useEMA7_25 && (
                                    <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-2">
                                        <Toggle label="上穿开多" checked={activeConfig.ema7_25_Long} onChange={(v: boolean) => handleChange('ema7_25_Long', v)} size="sm" />
                                        <Toggle label="下穿开空" checked={activeConfig.ema7_25_Short} onChange={(v: boolean) => handleChange('ema7_25_Short', v)} size="sm" />
                                        <Toggle label="下穿平多" checked={activeConfig.ema7_25_ExitLong} onChange={(v: boolean) => handleChange('ema7_25_ExitLong', v)} size="sm" />
                                        <Toggle label="上穿平空" checked={activeConfig.ema7_25_ExitShort} onChange={(v: boolean) => handleChange('ema7_25_ExitShort', v)} size="sm" />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <h3 className="text-xs font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2">出场 & 风控</h3>
                        <div className="space-y-3">
                             <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                <Toggle label="追踪止盈" checked={activeConfig.useTrailingStop} onChange={(v: boolean) => handleChange('useTrailingStop', v)} className="font-bold mb-2 text-slate-800" />
                                {activeConfig.useTrailingStop && (
                                    <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-2">
                                        <Input label="激活 %" type="number" step="0.1" value={activeConfig.trailActivation} onChange={(v: string) => handleChange('trailActivation', parseFloat(v))} />
                                        <Input label="回撤 %" type="number" step="0.1" value={activeConfig.trailDistance} onChange={(v: string) => handleChange('trailDistance', parseFloat(v))} />
                                    </div>
                                )}
                            </div>
                             <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                <Toggle label="固定止盈止损" checked={activeConfig.useFixedTPSL} onChange={(v: boolean) => handleChange('useFixedTPSL', v)} className="font-bold mb-2 text-slate-800" />
                                {activeConfig.useFixedTPSL && (
                                    <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-2">
                                        <Input label="止盈 %" type="number" step="0.1" value={activeConfig.takeProfitPct} onChange={(v: string) => handleChange('takeProfitPct', parseFloat(v))} />
                                        <Input label="止损 %" type="number" step="0.1" value={activeConfig.stopLossPct} onChange={(v: string) => handleChange('stopLossPct', parseFloat(v))} />
                                    </div>
                                )}
                            </div>
                            <Input label="日最大交易数" type="number" value={activeConfig.maxDailyTrades} onChange={(v: string) => handleChange('maxDailyTrades', parseFloat(v))} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};

const Input = ({ label, value, onChange, type = "text", placeholder, ...props }: any) => (
  <div className="mb-2">
    {label && <label className="block text-slate-600 text-[10px] mb-1 font-medium uppercase">{label}</label>}
    <input 
      type={type} 
      value={value} 
      onChange={(e) => onChange(e.target.value)} 
      placeholder={placeholder}
      className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs text-slate-900 focus:border-blue-500 outline-none shadow-sm"
      {...props}
    />
  </div>
);

const Select = ({ label, value, options, onChange }: any) => (
  <div className="mb-2">
    <label className="block text-slate-600 text-[10px] mb-1 font-medium uppercase">{label}</label>
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
