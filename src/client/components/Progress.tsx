import type { MeasureBetter } from "../../shared/schemas";
import { formatDate, todayIso } from "../format";
import { isBetter } from "../measures";

export interface Point {
  date: string;
  value: number;
}

export const PERIODS = [
  { key: "1M", label: "1M", months: 1 },
  { key: "6M", label: "6M", months: 6 },
  { key: "1Y", label: "1Y", months: 12 },
  { key: "all", label: "All", months: null },
] as const;
export type PeriodKey = (typeof PERIODS)[number]["key"];

export function periodStart(key: PeriodKey): string | null {
  const months = PERIODS.find((period) => period.key === key)!.months;
  if (months === null) return null;
  const start = new Date();
  start.setMonth(start.getMonth() - months);
  return start.toISOString().slice(0, 10);
}

export function defaultPeriod(points: Point[]): PeriodKey {
  const yearStart = periodStart("1Y")!;
  return points.filter((point) => point.date >= yearStart).length >= 2 ? "1Y" : "all";
}

export function bestOf(points: Point[], better: MeasureBetter): Point | undefined {
  return points.reduce<Point | undefined>((top, point) => (!top || isBetter(point.value, top.value, better) ? point : top), undefined);
}

export function PeriodPicker({ value, onChange }: { value: PeriodKey; onChange: (key: PeriodKey) => void }) {
  return (
    <div className="mb-3 grid grid-cols-4 gap-1 rounded-xl bg-zinc-800/60 p-1">
      {PERIODS.map((period) => (
        <button
          key={period.key}
          type="button"
          onClick={() => onChange(period.key)}
          className={`min-h-9 rounded-lg text-sm ${period.key === value ? "bg-zinc-700 font-semibold" : "text-zinc-400"}`}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}

export function ChipPicker<T extends string>({ options, value, onChange }: { options: { key: T; label: string }[]; value: T; onChange: (key: T) => void }) {
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          className={`min-h-9 rounded-lg px-3 text-sm ${option.key === value ? "bg-accent font-semibold text-zinc-950" : "bg-zinc-800 text-zinc-300"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface ProgressViewProps {
  points: Point[];
  period: PeriodKey;
  better: MeasureBetter;
  format: (value: number) => string;
  formatChange: (delta: number) => string;
  emptyLabel: string;
}

export function ProgressView({ points, period, better, format, formatChange, emptyLabel }: ProgressViewProps) {
  const from = periodStart(period);
  const inPeriod = points.filter((point) => !from || point.date >= from);
  const before = from ? bestOf(points.filter((point) => point.date < from), better) : undefined;
  const best = bestOf(inPeriod, better);

  if (!best) return <p className="py-6 text-center text-sm text-zinc-500">{emptyLabel}</p>;
  const changeLabel = before ? "vs before" : "Change";
  const change = before ? best.value - before.value : inPeriod.length > 1 ? best.value - inPeriod[0].value : null;

  return (
    <>
      <div className="mb-2 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-zinc-800 px-3 py-2">
          <div className="text-zinc-400">Best</div>
          <div><span className="text-lg font-semibold text-accent">{format(best.value)}</span> <span className="text-zinc-500">· {formatDate(best.date)}</span></div>
        </div>
        <div className="rounded-lg bg-zinc-800 px-3 py-2">
          <div className="text-zinc-400">{changeLabel}</div>
          <div className="text-lg font-semibold">{change === null ? "–" : formatChange(change)}</div>
        </div>
      </div>
      {inPeriod.length < 2 && !before ? (
        <p className="py-2 text-center text-sm text-zinc-500">One result so far: the chart starts with the next one.</p>
      ) : (
        <>
          <ProgressChart points={inPeriod} from={from} before={before?.value} better={better} format={format} />
          <div className="mt-1 flex justify-between text-xs text-zinc-500">
            <span>{formatDate(from ?? inPeriod[0].date)}</span>
            <span>line = record · dots = sessions</span>
            <span>{formatDate(from ? todayIso() : inPeriod.at(-1)!.date)}</span>
          </div>
        </>
      )}
    </>
  );
}

interface ProgressChartProps {
  points: Point[];
  from: string | null;
  before: number | undefined;
  better: MeasureBetter;
  format: (value: number) => string;
}

function ProgressChart({ points, from, before, better, format }: ProgressChartProps) {
  const width = 320;
  const height = 150;
  const padLeft = 54;
  const startDate = from ?? points[0].date;
  const endDate = from ? todayIso() : points.at(-1)!.date;
  const startTime = new Date(startDate).getTime();
  const endTime = new Date(endDate).getTime();
  const values = [...points.map((point) => point.value), ...(before !== undefined ? [before] : [])];
  const [minValue, maxValue] = [Math.min(...values), Math.max(...values)];
  const x = (date: string) => padLeft + ((new Date(date).getTime() - startTime) / (endTime - startTime || 1)) * (width - padLeft - 8);
  const y = (value: number) => height - 14 - ((value - minValue) / (maxValue - minValue || 1)) * (height - 28);

  let record = before;
  const recordDates = new Set<string>();
  const steps: string[] = record !== undefined ? [`M${x(startDate).toFixed(1)},${y(record).toFixed(1)}`] : [];
  for (const point of points) {
    if (record !== undefined && !isBetter(point.value, record, better)) continue;
    recordDates.add(point.date);
    steps.push(steps.length && record !== undefined ? `L${x(point.date).toFixed(1)},${y(record).toFixed(1)}` : `M${x(point.date).toFixed(1)},${y(point.value).toFixed(1)}`);
    steps.push(`L${x(point.date).toFixed(1)},${y(point.value).toFixed(1)}`);
    record = point.value;
  }
  if (record !== undefined) steps.push(`L${x(endDate).toFixed(1)},${y(record).toFixed(1)}`);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Record progression">
      {[...new Set([maxValue, minValue])].map((value) => (
        <g key={value}>
          <line x1={padLeft} x2={width - 8} y1={y(value)} y2={y(value)} stroke="#27272a" strokeWidth={1} />
          <text x={padLeft - 6} y={y(value) + 4} textAnchor="end" fontSize={11} fill="#71717a">{format(value)}</text>
        </g>
      ))}
      <path d={steps.join(" ")} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" />
      {points.map((point) => (
        <circle
          key={point.date}
          cx={x(point.date)}
          cy={y(point.value)}
          r={recordDates.has(point.date) ? 4 : 3}
          fill={recordDates.has(point.date) ? "var(--color-accent)" : "#52525b"}
        />
      ))}
    </svg>
  );
}
