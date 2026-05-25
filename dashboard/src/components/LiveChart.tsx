import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

interface DataPoint { time: string; value: number; }

interface LiveChartProps {
  data: DataPoint[];
  color?: string;
  type?: 'area' | 'line';
  height?: number;
  label?: string;
  formatValue?: (v: number) => string;
}

const CustomTooltip = ({ active, payload, formatValue }: any) => {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value ?? 0;
  return (
    <div style={{ background: '#111', border: '1px solid #333', padding: '6px 10px', borderRadius: 4, fontSize: 12 }}>
      <div style={{ color: '#FFD700' }}>{formatValue ? formatValue(val) : val.toFixed(2)}</div>
      <div style={{ color: '#666', fontSize: 10 }}>{payload[0]?.payload?.time}</div>
    </div>
  );
};

export const LiveChart: React.FC<LiveChartProps> = ({
  data,
  color = '#FFD700',
  type = 'area',
  height = 120,
  label,
  formatValue,
}) => {
  const isPositive = useMemo(() => {
    if (data.length < 2) return true;
    return data[data.length - 1].value >= data[0].value;
  }, [data]);

  const chartColor = isPositive ? '#22c55e' : '#ef4444';
  const gradientId = `grad-${color.replace('#', '')}`;

  if (type === 'line') {
    return (
      <div>
        {label && <div className="text-xs mb-1" style={{ color: '#666' }}>{label}</div>}
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
            <XAxis dataKey="time" hide />
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip content={<CustomTooltip formatValue={formatValue} />} />
            <Line type="monotone" dataKey="value" stroke={chartColor} strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div>
      {label && <div className="text-xs mb-1" style={{ color: '#666' }}>{label}</div>}
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
              <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="time" hide />
          <YAxis hide domain={['auto', 'auto']} />
          <Tooltip content={<CustomTooltip formatValue={formatValue} />} />
          <Area
            type="monotone" dataKey="value"
            stroke={chartColor} strokeWidth={1.5}
            fill={`url(#${gradientId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
