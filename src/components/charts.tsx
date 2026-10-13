import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumber } from '../utils/format';

export interface Series {
  key: string;
  name: string;
  color: string;
}

interface TooltipPayload {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

function ChartTooltip({ active, payload, label, format }: { active?: boolean; payload?: TooltipPayload[]; label?: number | string; format: (v: number) => string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-white/10 bg-ink-900/95 px-2.5 py-1.5 text-[0.7rem] shadow-xl">
      <div className="mb-0.5 font-semibold text-gold-200">Year {label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-1.5 num text-ink-100">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-ink-300">{p.name}</span>
          <span className="ml-auto pl-3 font-semibold">{typeof p.value === 'number' ? format(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

const axisStyle = { fontSize: 10, fill: '#8f99ae' };

/** Compact time-series chart used in the dashboard and inspector. */
export function TrendChart({
  data,
  series,
  height = 120,
  area = false,
  format = (v: number) => formatNumber(v),
  yDomain,
}: {
  data: Record<string, number>[];
  series: Series[];
  height?: number;
  area?: boolean;
  format?: (v: number) => string;
  yDomain?: [number, number];
}) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-white/10 text-[0.72rem] text-ink-300" style={{ height }}>
        Gathering history…
      </div>
    );
  }
  const common = {
    data,
    margin: { top: 6, right: 8, bottom: 0, left: 2 },
  };
  const axes = (
    <>
      <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
      <XAxis dataKey="y" tick={axisStyle} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} minTickGap={28} type="number" domain={['dataMin', 'dataMax']} />
      <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => format(v)} domain={yDomain ?? ['auto', 'auto']} />
      <Tooltip content={<ChartTooltip format={format} />} cursor={{ stroke: 'rgba(226,192,106,0.4)', strokeWidth: 1 }} />
    </>
  );
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {area ? (
          <AreaChart {...common}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            {axes}
            {series.map((s) => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={1.8} fill={`url(#grad-${s.key})`} isAnimationActive={false} dot={false} />
            ))}
          </AreaChart>
        ) : (
          <LineChart {...common}>
            {axes}
            {series.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={1.8} dot={false} isAnimationActive={false} />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
