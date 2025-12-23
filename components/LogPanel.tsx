
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AlertLog } from '../types';

interface LogPanelProps {
  logs: AlertLog[];
  strategies: { id: string; name: string; symbol: string }[];
  onSelectStrategy?: (id: string) => void;
}

// 音频上下文单例
let audioContext: AudioContext | null = null;
let userInteracted = false;

// 初始化音频（在用户首次交互时调用）
const initAudio = () => {
  if (userInteracted || typeof window === 'undefined') return;
  
  userInteracted = true;
  
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    audioContext = new AudioCtx();
  } catch (error) {
    console.warn('初始化音频失败:', error);
  }
};

// 绑定用户交互事件
if (typeof window !== 'undefined') {
  const initOnInteraction = () => {
    initAudio();
    document.removeEventListener('click', initOnInteraction);
    document.removeEventListener('keydown', initOnInteraction);
    document.removeEventListener('touchstart', initOnInteraction);
  };
  
  document.addEventListener('click', initOnInteraction, { once: true });
  document.addEventListener('keydown', initOnInteraction, { once: true });
  document.addEventListener('touchstart', initOnInteraction, { once: true });
}

// 播放"bee"提示音
const playBeep = () => {
  if (!audioContext || audioContext.state === 'closed') return;
  
  try {
    // 如果音频上下文被挂起，恢复它
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // 设置"bee"声参数
    oscillator.frequency.value = 1600; // 高频，更像"bee"
    oscillator.type = 'sine';
    
    // 设置音量曲线 - 快速达到峰值然后衰减
    const now = audioContext.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.6, now + 0.05); // 快速淡入
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15); // 快速淡出
    
    oscillator.start(now);
    oscillator.stop(now + 1); // 1秒
    
  } catch (error) {
    console.warn('播放提示音失败:', error);
    
    // 备用方案：尝试HTML5 Audio
    try {
      const beep = new Audio();
      beep.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
      beep.volume = 0.3;
      beep.play().catch(() => {});
    } catch (e) {
      // 如果都不行，就静默
    }
  }
};

const LogPanel: React.FC<LogPanelProps> = ({ logs, strategies, onSelectStrategy }) => {
  const [filterId, setFilterId] = useState<string>('all');
  const prevLogsLength = useRef(logs.length);

  // 检测新日志并播放声音
  useEffect(() => {
    if (logs.length > prevLogsLength.current) {
      playBeep();
    }
    
    prevLogsLength.current = logs.length;
  }, [logs]);

  const getActionText = (action: string, position: string) => {
     if (action === 'buy' && position === 'long') return '开多 (Open Long)';
     if (action === 'sell' && position === 'short') return '开空 (Open Short)';
     if (action === 'sell' && position === 'flat') return '平多 (Close Long)';
     if (action === 'buy_to_cover' && position === 'flat') return '平空 (Close Short)';
     if (action === 'buy_to_cover') return '平空 (Close Short)'; // Legacy support
     if (action === 'sell') return '卖出 (Sell)'; // Fallback
     return `${action} ${position}`;
  }

  // 格式化日期时间
  const formatDateTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return {
      date: date.toLocaleDateString('zh-CN', { 
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit'
      }),  // 格式：2024/01/15
      time: date.toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })  // 格式：14:30:25
    };
  };

  const filteredLogs = useMemo(() => {
    let result;
    if (filterId === 'all') {
      result = logs;
    } else {
      result = logs.filter(log => log.strategyId === filterId);
    }
    
    // 只保留最新的100条
    // 因为日志已经按时间倒序排列（最新的在前面）
    return result.slice(0, 100);
  }, [logs, filterId]);

  return (
    <div className="bg-white rounded-lg border border-slate-200 h-full flex flex-col overflow-hidden shadow-sm">
      <div className="p-3 border-b border-slate-200 bg-slate-50 rounded-t-lg flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-4">
            <h3 className="font-semibold text-slate-800">信号日志</h3>
            <select 
               value={filterId} 
               onChange={(e) => setFilterId(e.target.value)}
               className="text-xs bg-white border border-slate-300 rounded p-1 outline-none text-slate-700"
            >
                <option value="all">显示全部</option>
                {strategies.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.symbol})</option>
                ))}
            </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {filteredLogs.length} 条
            {logs.length > 100 && (
              <span className="text-slate-400 ml-1">
                (显示最新100条)
              </span>
            )}
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-0 font-mono text-xs custom-scrollbar bg-white">
        {filteredLogs.length === 0 ? (
          <div className="p-4 text-slate-400 text-center">暂无触发记录。</div>
        ) : (
          <table className="w-full text-left table-fixed">
            <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="p-3 w-32">日期时间</th>
                <th className="p-3 w-32">策略 / 交易对</th>
                <th className="p-3 w-20">类型</th>
                <th className="p-3 w-32">动作</th>
                <th className="p-3 w-40">触发条件</th>
                <th className="p-3 w-20">执行价格</th>
                <th className="p-3 w-20">执行数量</th>
                <th className="p-3 w-24">成交额(U)</th>
                <th className="p-3 w-20">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map((log) => {
                const { date, time } = formatDateTime(log.timestamp);
                
                return (
                  <tr 
                    key={log.id} 
                    onDoubleClick={() => onSelectStrategy?.(log.strategyId)}
                    className="hover:bg-slate-50 transition-colors text-slate-700 cursor-pointer select-none"
                    title="双击以在概览中选中此策略"
                  >
                    <td className="p-3">
                      <div className="text-slate-500 truncate" title={`${date} ${time}`}>
                        {date}
                      </div>
                      <div className="text-slate-400 truncate" title={`${date} ${time}`}>
                        {time}
                      </div>
                    </td>
                    <td className="p-3 text-slate-800 truncate">
                      <div className="font-bold truncate" title={log.strategyName}>{log.strategyName}</div>
                      <div className="text-[10px] text-slate-400">{log.payload.symbol}</div>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                        log.type.includes('Manual') ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'
                      }`}>
                        {log.type}
                      </span>
                    </td>
                    <td className="p-3 text-slate-800 font-bold truncate">
                      {getActionText(log.payload.action, log.payload.position)}
                    </td>
                    <td className="p-3 text-amber-600 font-medium truncate" title={log.payload.tp_level}>
                      {log.payload.tp_level}
                    </td>
                    <td className="p-3 text-blue-600 font-medium">
                      {log.payload.execution_price ? log.payload.execution_price.toFixed(4) : '-'}
                    </td>
                    <td className="p-3 text-purple-600 font-medium">
                      {log.payload.execution_quantity ? log.payload.execution_quantity.toFixed(4) : '-'}
                    </td>
                    <td className="p-3 text-slate-600 font-medium">${log.payload.trade_amount.toFixed(2)}</td>
                    <td className="p-3">
                      <span className="text-emerald-600 flex items-center gap-1 font-medium">
                        ✔ 已发送
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default LogPanel;
