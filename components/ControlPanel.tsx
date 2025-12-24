
import React, { useState, useEffect } from 'react';
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

  const formatActivationTime = (ts?: number) => {
    if (!ts) return '';
    const date = new Date(ts);
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    const h = date.getHours().toString().padStart(2, '0');
    const min = date.getMinutes().toString().padStart(2, '0');
    return `${m}${d}-${h}:${min}`;
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 h-full flex shadow-sm overflow-hidden text-slate-800 font-sans text-[13px]">
        
        {/* SIDEBAR */}
        <div className="w-10 bg-slate-100 border-r border-slate-200 flex flex-col items-center py-4 gap-4 flex-shrink-0">
            <button onClick={() => setActiveTab('dashboard')} className={`p-1.5 rounded-lg transition-all ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-200 hover:text-slate-600'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            </button>
            <button onClick={() => setActiveTab('config')} className={`p-1.5 rounded-lg transition-all ${activeTab === 'config' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-200 hover:text-slate-600'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/50 p-3">
            
            {/* VIEW 1: DASHBOARD */}
            {activeTab === 'dashboard' && (
                <div className="space-y-4">
                    {/* 策略概览模块: 字体保持原始大小 */}
                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                        <div className="flex justify-between items-center px-3 py-2 border-b border-slate-100 bg-slate-50">
                            <h2 className="text-slate-800 font-bold text-[10px] uppercase tracking-wider">策略概览</h2>
                            <button onClick={onAddStrategy} className="bg-blue-600 hover:bg-blue-500 text-white px-2 py-0.5 rounded text-[10px] shadow-sm transition-colors">+ 添加</button>
                        </div>
                        <div className="max-h-60 overflow-y-auto custom-scrollbar divide-y divide-slate-50 text-[11px]">
                            {strategies.map(s => {
                                const runtime = allRuntimes?.[s.id];
                                const dir = runtime?.positionState?.direction || 'FLAT';
                                return (
                                    <div key={s.id} onClick={() => onSelectStrategy(s.id)} className={`p-2 px-3 cursor-pointer transition-all flex items-center justify-between gap-1.5 ${selectedStrategyId === s.id ? 'bg-blue-50 ring-inset ring-1 ring-blue-100' : 'hover:bg-slate-50'}`}>
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
                                            <div className="flex flex-col min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2 min-w-0">
                                                    <span className="text-[11px] font-bold truncate flex-1 text-slate-700">{s.name}</span>
                                                    {s.activationTime && (
                                                        <span className="text-[9px] text-slate-500 font-mono flex-shrink-0 bg-slate-100 px-1 border border-slate-200 rounded leading-tight">
                                                          {formatActivationTime(s.activationTime)}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-[10px] text-slate-400 font-mono uppercase truncate">{s.symbol} · {s.interval}</span>
                                            </div>
                                            {dir !== 'FLAT' && <span className={`text-[9px] px-1 rounded font-bold shrink-0 text-white ${dir === 'LONG' ? 'bg-emerald-500' : 'bg-rose-500'}`}>{dir === 'LONG' ? '多' : '空'}</span>}
                                        </div>
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); onRemoveStrategy(s.id); }}
                                          className="text-slate-300 hover:text-rose-500 p-1 transition-colors"
                                          title="删除策略"
                                        >
                                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm space-y-3">
                         <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                             <span className="text-[13px] text-slate-600 font-bold uppercase tracking-tight">运行状态</span>
                             <Toggle checked={activeConfig.isActive} onChange={(v: boolean) => handleChange('isActive', v)} size="sm" />
                         </div>
                         <div className="grid grid-cols-2 gap-4">
                            <div>
                                <div className="text-[12px] text-slate-500 font-bold">当前持仓</div>
                                <div className={`text-[14px] font-black ${positionStatus === 'LONG' ? 'text-emerald-600' : positionStatus === 'SHORT' ? 'text-rose-600' : 'text-slate-400'}`}>
                                    {positionStatus === 'LONG' ? '多头持仓' : positionStatus === 'SHORT' ? '空头持仓' : '空仓 (Flat)'}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-[12px] text-slate-500 font-bold">当前报价</div>
                                <div className="text-[14px] font-black text-slate-900 font-mono">${lastPrice.toFixed(2)}</div>
                            </div>
                         </div>
                    </div>

                    {/* BASIC CONFIG */}
                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm space-y-3">
                        <h3 className="text-[12px] font-bold text-slate-700 border-b border-slate-100 pb-1 uppercase tracking-wider">基础策略设置</h3>
                        <Input label="策略显示名称" value={activeConfig.name} onChange={(v: string) => handleChange('name', v)} />
                        <div className="grid grid-cols-2 gap-2">
                            <EditableSelect 
                                label="币种 (Symbol)" 
                                value={activeConfig.symbol} 
                                options={CRYPTO_SYMBOLS} 
                                onChange={(v: string) => handleChange('symbol', v)} 
                            />
                            <Select label="周期 (Interval)" value={activeConfig.interval} options={AVAILABLE_INTERVALS} onChange={(v: string) => handleChange('interval', v)} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Input label="单笔交易金额 (U)" type="number" value={activeConfig.tradeAmount} onChange={(v: string) => handleChange('tradeAmount', parseFloat(v))} />
                          <Input label="杠杆倍数 (Leverage)" type="number" min="1" value={activeConfig.leverage} onChange={(v: string) => handleChange('leverage', parseInt(v))} />
                        </div>
                        <Input label="Webhook URL" value={activeConfig.webhookUrl} onChange={(v: string) => handleChange('webhookUrl', v)} />
                    </div>
                </div>
            )}

            {/* VIEW 2: CONFIGURATION */}
            {activeTab === 'config' && (
                <div className="space-y-5 pb-10">
                    {/* MANUAL TAKEOVER PANEL */}
                    <div className="bg-orange-50 p-3 rounded-lg border border-orange-200 shadow-sm">
                        <div className="flex justify-between items-center mb-2 border-b border-orange-200 pb-2">
                            <h3 className="text-[13px] font-bold text-orange-700 uppercase tracking-tighter">手动接管 (Takeover)</h3>
                            <Toggle checked={activeConfig.manualTakeover} onChange={(v: boolean) => handleChange('manualTakeover', v)} />
                        </div>
                        <div className="space-y-2 bg-white p-2 rounded border border-orange-100">
                             <Select label="同步方向" value={activeConfig.takeoverDirection} options={['LONG', 'SHORT']} onChange={(v: string) => handleChange('takeoverDirection', v)} />
                             <Input label="接管均价" type="number" step="0.0001" value={activeConfig.takeoverEntryPrice} onChange={(v: string) => handleChange('takeoverEntryPrice', parseFloat(v))} />
                             <Input label="同步仓位数量" type="number" step="0.001" value={activeConfig.takeoverQuantity} onChange={(v: string) => handleChange('takeoverQuantity', parseFloat(v))} />
                        </div>
                    </div>

                    {/* SIGNAL LOGIC ENGINE */}
                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <h3 className="text-[12px] font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2 uppercase tracking-wider">信号与指标引擎</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center bg-slate-50 p-2 rounded border border-slate-200">
                                <span className="text-[12px] font-bold text-slate-600 uppercase">触发时机模式</span>
                                <div className="flex items-center gap-2">
                                    <span className={`text-[12px] transition-all font-bold ${!activeConfig.triggerOnClose ? 'text-blue-600' : 'text-slate-300'}`}>实时 (Tick)</span>
                                    <Toggle checked={activeConfig.triggerOnClose} onChange={(v: boolean) => handleChange('triggerOnClose', v)} size="sm" />
                                    <span className={`text-[12px] transition-all font-bold ${activeConfig.triggerOnClose ? 'text-blue-600' : 'text-slate-300'}`}>收盘 (Close)</span>
                                </div>
                            </div>

                            <div className="bg-teal-50 p-2 rounded border border-teal-100">
                                <Toggle label="EMA 7 价格回归 (点位穿越触发)" checked={activeConfig.usePriceReturnEMA7} onChange={(v: boolean) => handleChange('usePriceReturnEMA7', v)} className="mb-1 font-black text-teal-700"/>
                                {activeConfig.usePriceReturnEMA7 && (
                                    <div className="pt-1 border-t border-teal-200">
                                        <Input label="回归触发阈值(正下负上) %" type="number" step="0.01" value={activeConfig.priceReturnBelowEma7Pct} onChange={(v: string) => handleChange('priceReturnBelowEma7Pct', parseFloat(v))} />
                                        <div className="text-[10px] text-teal-600 italic leading-tight space-y-1 mt-1">
                                          {/* 备注：逻辑：点位瞬间穿过目标线时触发 (Cross-into) */}
                                          <p>• <b>正数</b> (如 0.5)：价格到均线下方0.5%”时触发</p>
                                          <p>• <b>负数</b> (如 -0.5)：价格到上方0.5%”时触发</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            {/* 趋势过滤模块 (负向拦截约束) */}
                            <div className="bg-emerald-50 p-2 rounded border border-emerald-100">
                                <h4 className="text-[11px] font-bold text-emerald-700 uppercase mb-2 tracking-widest text-center">趋势过滤器 (负向硬性拦截)</h4>
                                <div className="grid grid-cols-2 gap-2">
                                    <Toggle label="禁止开多 (7<25<99)" checked={activeConfig.trendFilterBlockLong} onChange={(v: boolean) => handleChange('trendFilterBlockLong', v)} size="sm" />
                                    <Toggle label="禁止开空 (7>25>99)" checked={activeConfig.trendFilterBlockShort} onChange={(v: boolean) => handleChange('trendFilterBlockShort', v)} size="sm" />
                                </div>
                                {/* 备注：系统检测到强单边趋势排列时，将强制拦截该方向的所有开仓行为 */}
                            </div>

                            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                <Toggle label="MACD 控制" checked={activeConfig.useMACD} onChange={(v: boolean) => handleChange('useMACD', v)} className="mb-2 font-black text-slate-800"/>
                                {activeConfig.useMACD && (
                                    <div className="space-y-2 border-t border-slate-200 pt-2">
                                        <div className="grid grid-cols-3 gap-2 mb-2">
                                            <Input label="Fast" type="number" value={activeConfig.macdFast} onChange={(v: string) => handleChange('macdFast', parseFloat(v))} />
                                            <Input label="Slow" type="number" value={activeConfig.macdSlow} onChange={(v: string) => handleChange('macdSlow', parseFloat(v))} />
                                            <Input label="Signal" type="number" value={activeConfig.macdSignal} onChange={(v: string) => handleChange('macdSignal', parseFloat(v))} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-1 border border-slate-200 bg-white p-1 rounded">
                                            <Toggle label="开多" checked={activeConfig.macdLong} onChange={(v: boolean) => handleChange('macdLong', v)} size="sm" />
                                            <Toggle label="开空" checked={activeConfig.macdShort} onChange={(v: boolean) => handleChange('macdShort', v)} size="sm" />
                                            <Toggle label="平多" checked={activeConfig.macdExitLong} onChange={(v: boolean) => handleChange('macdExitLong', v)} size="sm" />
                                            <Toggle label="平空" checked={activeConfig.macdExitShort} onChange={(v: boolean) => handleChange('macdExitShort', v)} size="sm" />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* EMA CROSS COMBINATIONS */}
                            {['7_25', '7_99', '25_99', 'Double'].map(cross => {
                                const key = cross === 'Double' ? 'EMADouble' : `EMA${cross}`;
                                const useKey = `use${key}` as keyof StrategyConfig;
                                const propBase = cross === 'Double' ? 'emaDouble' : `ema${cross}_`;
                                const label = cross === 'Double' ? 'EMA 7/25 vs 99' : `EMA ${cross.replace('_', '/')}`;
                                
                                return (
                                    <div key={cross} className="bg-slate-50 p-2 rounded border border-slate-100">
                                        <Toggle label={label} checked={activeConfig[useKey]} onChange={(v: boolean) => handleChange(useKey, v)} className="font-black text-blue-600 mb-1" />
                                        {activeConfig[useKey] && (
                                            <div className="grid grid-cols-2 gap-1 border-t border-slate-200 pt-2 bg-white p-1 rounded mt-1 text-[12px]">
                                                <Toggle label="开多" checked={activeConfig[`${propBase}Long` as keyof StrategyConfig]} onChange={(v: boolean) => handleChange(`${propBase}Long` as keyof StrategyConfig, v)} size="sm" />
                                                <Toggle label="开空" checked={activeConfig[`${propBase}Short` as keyof StrategyConfig]} onChange={(v: boolean) => handleChange(`${propBase}Short` as keyof StrategyConfig, v)} size="sm" />
                                                <Toggle label="平多" checked={activeConfig[`${propBase}ExitLong` as keyof StrategyConfig]} onChange={(v: boolean) => handleChange(`${propBase}ExitLong` as keyof StrategyConfig, v)} size="sm" />
                                                <Toggle label="平空" checked={activeConfig[`${propBase}ExitShort` as keyof StrategyConfig]} onChange={(v: boolean) => handleChange(`${propBase}ExitShort` as keyof StrategyConfig, v)} size="sm" />
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* RISK AND PROFIT MANAGEMENT */}
                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <h3 className="text-[12px] font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2 uppercase tracking-wider">退出与风险管理</h3>
                        <div className="space-y-4 text-[12px]">
                            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                <Toggle label="追踪止盈 (Trailing Stop)" checked={activeConfig.useTrailingStop} onChange={(v: boolean) => handleChange('useTrailingStop', v)} className="font-black mb-2 text-slate-800" />
                                {activeConfig.useTrailingStop && (
                                    <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-2">
                                        <Input label="启动偏差 %" type="number" step="0.1" value={activeConfig.trailActivation} onChange={(v: string) => handleChange('trailActivation', parseFloat(v))} />
                                        <Input label="回吐距离 %" type="number" step="0.1" value={activeConfig.trailDistance} onChange={(v: string) => handleChange('trailDistance', parseFloat(v))} />
                                    </div>
                                )}
                            </div>

                            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                <Toggle label="全仓固定止盈止损" checked={activeConfig.useFixedTPSL} onChange={(v: boolean) => handleChange('useFixedTPSL', v)} className="font-black mb-2 text-slate-800" />
                                {activeConfig.useFixedTPSL && (
                                    <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-2">
                                        <Input label="止盈目标 %" type="number" step="0.1" value={activeConfig.takeProfitPct} onChange={(v: string) => handleChange('takeProfitPct', parseFloat(v))} />
                                        <Input label="止损限制 %" type="number" step="0.1" value={activeConfig.stopLossPct} onChange={(v: string) => handleChange('stopLossPct', parseFloat(v))} />
                                    </div>
                                )}
                            </div>

                            {/* MULTI LEVEL TP/SL PANEL */}
                            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                <Toggle label="4级分段止盈止损" checked={activeConfig.useMultiTPSL} onChange={(v: boolean) => handleChange('useMultiTPSL', v)} className="font-black mb-2 text-slate-800" />
                                {activeConfig.useMultiTPSL && (
                                    <div className="space-y-5 border-t border-slate-200 pt-2">
                                        <div>
                                            <div className="text-[11px] font-bold text-emerald-600 mb-1 uppercase tracking-widest border-l-2 border-emerald-600 pl-1">分段止盈 (Take Profit)</div>
                                            {activeConfig.tpLevels.map((tp, idx) => (
                                                <div key={`tp-${idx}`} className="flex items-center gap-1 mb-1.5 bg-white p-1 rounded border border-slate-100 shadow-sm">
                                                    <span className="w-4 text-[11px] text-slate-400 font-mono">#{idx+1}</span>
                                                    <input type="number" step="0.1" value={tp.pct} onChange={(e) => handleArrayChange('tpLevels', idx, 'pct', parseFloat(e.target.value))} className="w-10 bg-transparent text-[12px] text-center border-b border-slate-200" />
                                                    <span className="text-[10px] text-slate-400">%价</span>
                                                    <input type="number" step="1" value={tp.qtyPct} onChange={(e) => handleArrayChange('tpLevels', idx, 'qtyPct', parseFloat(e.target.value))} className="w-10 bg-transparent text-[12px] text-center border-b border-slate-200" />
                                                    <span className="text-[10px] text-slate-400">%仓</span>
                                                    <Toggle checked={tp.active} onChange={(v: boolean) => handleArrayChange('tpLevels', idx, 'active', v)} size="sm" />
                                                </div>
                                            ))}
                                        </div>
                                        <div className="pt-2 border-t border-slate-200">
                                            <div className="text-[11px] font-bold text-rose-600 mb-1 uppercase tracking-widest border-l-2 border-rose-600 pl-1">分段止损 (Stop Loss)</div>
                                            {activeConfig.slLevels.map((sl, idx) => (
                                                <div key={`sl-${idx}`} className="flex items-center gap-1 mb-1.5 bg-white p-1 rounded border border-slate-100 shadow-sm">
                                                    <span className="w-4 text-[11px] text-slate-400 font-mono">#{idx+1}</span>
                                                    <input type="number" step="0.1" value={sl.pct} onChange={(e) => handleArrayChange('slLevels', idx, 'pct', parseFloat(e.target.value))} className="w-10 bg-transparent text-[12px] text-center border-b border-slate-200" />
                                                    <span className="text-[10px] text-slate-400">%价</span>
                                                    <input type="number" step="1" value={sl.qtyPct} onChange={(e) => handleArrayChange('slLevels', idx, 'qtyPct', parseFloat(e.target.value))} className="w-10 bg-transparent text-[12px] text-center border-b border-slate-200" />
                                                    <span className="text-[10px] text-slate-400">%仓</span>
                                                    <Toggle checked={sl.active} onChange={(v: boolean) => handleArrayChange('slLevels', idx, 'active', v)} size="sm" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="bg-purple-50 p-2 rounded border border-purple-100">
                                <Toggle label="趋势反手策略 (Reverse)" checked={activeConfig.useReverse} onChange={(v: boolean) => handleChange('useReverse', v)} className="font-black mb-2 text-purple-700" />
                                {activeConfig.useReverse && (
                                    <div className="grid grid-cols-2 gap-2 border-t border-purple-200 pt-2">
                                        <Toggle label="多转空" checked={activeConfig.reverseLongToShort} onChange={(v: boolean) => handleChange('reverseLongToShort', v)} size="sm" />
                                        <Toggle label="空转多" checked={activeConfig.reverseShortToLong} onChange={(v: boolean) => handleChange('reverseShortToLong', v)} size="sm" />
                                    </div>
                                )}
                            </div>

                            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                <Input label="单日最大总开仓数" type="number" min="1" value={activeConfig.maxDailyTrades} onChange={(v: string) => handleChange('maxDailyTrades', parseFloat(v))} />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};

const Input = ({ label, value, onChange, type = "text", ...props }: any) => (
  <div className="mb-1.5 text-left">
    {label && <label className="block text-slate-500 text-[11px] mb-0.5 font-bold uppercase tracking-tight">{label}</label>}
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-white border border-slate-300 rounded p-1 text-[12px] text-slate-900 focus:border-blue-500 outline-none shadow-sm font-medium" {...props} />
  </div>
);

// 核心优化：带本地缓冲的币种选择器
const EditableSelect = ({ label, value, options, onChange }: any) => {
    const listId = `list-${label.replace(/\s+/g, '-')}`;
    const [tempValue, setTempValue] = useState(value);

    // 当外部 activeConfig.symbol 改变时同步内部（如手动切换策略）
    useEffect(() => {
        setTempValue(value);
    }, [value]);

    const handleCommit = (val: string) => {
        const finalVal = val.toUpperCase().trim();
        if (finalVal !== value) {
            onChange(finalVal);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleCommit(tempValue);
            (e.target as any).blur();
        }
    };

    return (
        <div className="mb-1.5 text-left relative">
            <label className="block text-slate-500 text-[11px] mb-0.5 font-bold uppercase tracking-tight">{label}</label>
            <input 
                list={listId}
                value={tempValue} 
                onChange={(e) => setTempValue(e.target.value)}
                onBlur={() => handleCommit(tempValue)}
                onKeyDown={handleKeyDown}
                placeholder="输入或选择..."
                className="w-full bg-white border border-slate-300 rounded p-1 text-[12px] text-slate-900 focus:border-blue-500 outline-none shadow-sm font-medium"
            />
            <datalist id={listId}>
                {options.map((o: string) => <option key={o} value={o} />)}
            </datalist>
            <div className="absolute right-1 top-5 text-[11px] text-slate-300 pointer-events-none">▼</div>
        </div>
    );
};

const Select = ({ label, value, options, onChange }: any) => (
  <div className="mb-1.5 text-left">
    <label className="block text-slate-500 text-[11px] mb-0.5 font-bold uppercase tracking-tight">{label}</label>
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-white border border-slate-300 rounded p-1 text-[12px] text-slate-900 focus:border-blue-500 outline-none shadow-sm font-medium">
      {options.map((o: any) => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

const Toggle = ({ label, checked, onChange, size = "md", className = "" }: any) => (
  <div className={`flex items-center justify-between gap-2 ${className}`}>
    {label && <span className={`text-slate-600 font-bold uppercase tracking-tighter ${size === 'sm' ? 'text-[11px]' : 'text-[12px]'}`}>{label}</span>}
    <button onClick={() => onChange(!checked)} className={`relative inline-flex items-center rounded-full transition-all ${checked ? 'bg-blue-600' : 'bg-slate-300'} ${size === 'sm' ? 'h-3.5 w-7' : 'h-5 w-10'} shadow-inner`}>
      <span className={`inline-block transform rounded-full bg-white transition-transform shadow-md ${size === 'sm' ? 'h-2.5 w-2.5' : 'h-4 w-4'} ${checked ? (size === 'sm' ? 'translate-x-3.5' : 'translate-x-5.5') : 'translate-x-0.5'}`} />
    </button>
  </div>
);

export default ControlPanel;
