
import React, { useMemo } from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Bar,
  Cell,
  ReferenceDot,
  Brush
} from 'recharts';
import { Candle, AlertLog, MarketType } from '../types';

interface ChartProps {
  data: Candle[];
  logs: AlertLog[];
  symbol: string;
  interval: string;
  market: MarketType;
  manualTakeoverTime?: number; 
}

const formatXAxis = (tickItem: number) => {
  const date = new Date(tickItem);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const candle = payload[0].payload;
    return (
      <div className="bg-white border border-slate-200 p-3 rounded shadow-lg text-xs z-50 text-slate-800">
        <p className="font-bold text-slate-900 mb-2">{new Date(label).toLocaleString()}</p>
        <p className="text-emerald-600">开盘: {candle.open}</p>
        <p className="text-emerald-600">最高: {candle.high}</p>
        <p className="text-rose-500">最低: {candle.low}</p>
        <p className={`font-semibold ${candle.close >= candle.open ? 'text-emerald-600' : 'text-rose-500'}`}>
          收盘: {candle.close}
        </p>
        <div className="mt-2 pt-2 border-t border-slate-100">
          <p className="text-amber-500">EMA 7: {candle.ema7?.toFixed(2)}</p>
          <p className="text-blue-500">EMA 25: {candle.ema25?.toFixed(2)}</p>
          <p className="text-purple-500">EMA 99: {candle.ema99?.toFixed(2)}</p>
        </div>
      </div>
    );
  }
  return null;
};

const Chart: React.FC<ChartProps> = ({ data, logs, symbol, interval, market, manualTakeoverTime }) => {
  const processedData = useMemo(() => {
     return data.map(d => ({
        ...d,
        body: [Math.min(d.open, d.close), Math.max(d.open, d.close)],
        color: d.close >= d.open ? '#10b981' : '#f43f5e'
     }));
  }, [data]);

  // 综合标记：成交信号 + 手动接管旗帜
  const markers = useMemo(() => {
    const tradeMarkers: any[] = logs.map(log => {
        const logTime = log.timestamp;
        let closestCandle = null;
        for(let i = data.length - 1; i >= 0; i--) {
            if (data[i].time <= logTime) { closestCandle = data[i]; break; }
        }
        if (!closestCandle) return null;
        const isBuy = log.payload.action === 'buy' || log.payload.action === 'buy_to_cover';
        return {
            id: log.id, x: closestCandle.time, y: isBuy ? closestCandle.low : closestCandle.high,
            type: isBuy ? 'buy' : 'sell', label: isBuy ? '▲' : '▼', color: isBuy ? '#10b981' : '#f43f5e',
            size: 5
        };
    }).filter(Boolean);

    // 手动接管旗帜 (橙色)
    if (manualTakeoverTime && manualTakeoverTime > 0) {
        let takeoverCandle = null;
        for(let i = data.length - 1; i >= 0; i--) {
            if (data[i].time <= manualTakeoverTime) { takeoverCandle = data[i]; break; }
        }
        if (takeoverCandle) {
            tradeMarkers.push({
                id: 'takeover-flag',
                x: takeoverCandle.time,
                y: takeoverCandle.high + (takeoverCandle.high * 0.002),
                type: 'flag',
                label: '🚩',
                color: '#f97316',
                size: 0
            });
        }
    }

    return tradeMarkers;
  }, [logs, data, manualTakeoverTime]);

  const minPrice = useMemo(() => data.length > 0 ? Math.min(...data.map(d => d.low)) : 0, [data]);
  const maxPrice = useMemo(() => data.length > 0 ? Math.max(...data.map(d => d.high)) : 0, [data]);
  const padding = (maxPrice - minPrice) * 0.05 || 1;

  const startIndex = Math.max(0, data.length - 60);

  if (data.length < 2) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <div className="text-xs text-center">
             正在加载 {symbol} ({interval}) 实时行情...<br/>
             <span className="text-[10px] text-slate-300">如果是 1m/2m 周期，可能需要约 10-30 秒初始化缓存</span>
          </div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={processedData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis 
          dataKey="time" 
          tickFormatter={formatXAxis} 
          stroke="#64748b" 
          tick={{ fontSize: 10 }}
          minTickGap={40}
          type="number"
          domain={['dataMin', 'dataMax']}
        />
        <YAxis 
          domain={[minPrice - padding, maxPrice + padding]} 
          orientation="right" 
          stroke="#64748b" 
          tick={{ fontSize: 10 }} 
          tickFormatter={(val) => val.toFixed(val > 100 ? 2 : 4)}
        />
        <Tooltip content={<CustomTooltip />} isAnimationActive={false} />
        
        <Line type="monotone" dataKey="ema7" stroke="#eab308" dot={false} strokeWidth={1.5} isAnimationActive={false} />
        <Line type="monotone" dataKey="ema25" stroke="#3b82f6" dot={false} strokeWidth={1.5} isAnimationActive={false} />
        <Line type="monotone" dataKey="ema99" stroke="#a855f7" dot={false} strokeWidth={1.5} isAnimationActive={false} />

        <Bar dataKey="body" isAnimationActive={false}>
            {processedData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
        </Bar>

        {markers.map((m) => (
            <ReferenceDot
                key={m.id} x={m.x} y={m.y} r={m.size} fill={m.size > 0 ? m.color : 'transparent'} stroke={m.size > 0 ? "#fff" : 'transparent'} strokeWidth={1}
                label={{ value: m.label, position: m.type === 'buy' ? 'bottom' : 'top', fill: m.color, fontSize: m.type === 'flag' ? 20 : 14, fontWeight: 'bold' }}
            />
        ))}

        <Brush 
           dataKey="time" height={25} stroke="#cbd5e1" 
           tickFormatter={formatXAxis} startIndex={startIndex}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

export default Chart;
