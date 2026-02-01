import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { TrendDataPoint } from '@/api/endpoints/analytics';
import { format, parseISO } from 'date-fns';

interface TrendChartProps {
  data: TrendDataPoint[];
  height?: number;
}

export function TrendChart({ data, height = 300 }: TrendChartProps) {
  const formattedData = data.map((point) => ({
    ...point,
    date: format(parseISO(point.date), 'MMM d'),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={formattedData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          className="text-muted-foreground"
        />
        <YAxis
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          className="text-muted-foreground"
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="sent"
          stroke="#ff7a59"
          strokeWidth={2}
          dot={false}
          name="Sent"
        />
        <Line
          type="monotone"
          dataKey="opens"
          stroke="#0091ae"
          strokeWidth={2}
          dot={false}
          name="Opens"
        />
        <Line
          type="monotone"
          dataKey="replies"
          stroke="#22c55e"
          strokeWidth={2}
          dot={false}
          name="Replies"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
