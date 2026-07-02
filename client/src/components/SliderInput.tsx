import { useId } from 'react';

const POSITIONS = 200; // slider resolution

/** Round to 2 significant digits so log-slider values land on "nice" numbers. */
export function niceRound(v: number): number {
  if (v <= 0) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(v));
  return Math.round((v / magnitude) * 10) * (magnitude / 10);
}

function valueToPosition(value: number, min: number, max: number, log: boolean): number {
  if (log) {
    const p = (Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min));
    return Math.round(Math.min(1, Math.max(0, p)) * POSITIONS);
  }
  return Math.round(((value - min) / (max - min)) * POSITIONS);
}

function positionToValue(pos: number, min: number, max: number, log: boolean): number {
  const p = pos / POSITIONS;
  if (log) {
    return niceRound(Math.exp(Math.log(min) + p * (Math.log(max) - Math.log(min))));
  }
  return min + p * (max - min);
}

export interface SliderInputProps {
  label: string;
  /** null = filter off ("any"). */
  value: number | null;
  onChange: (v: number | null) => void;
  min: number;
  max: number;
  /** log for gp/volume scales, linear for percentages. */
  scale?: 'linear' | 'log';
  /** Which end of the slider means "off". */
  nullAt?: 'min' | 'max';
  /** Shown next to the label, e.g. "≥ 350k". */
  format: (v: number) => string;
  /** Label when the filter is off. */
  offLabel?: string;
  title?: string;
  /** Rounding step for linear scale. */
  step?: number;
}

/**
 * Slider + tiny number input for a nullable filter bound. Dragging to the
 * "off" end clears the filter; typing an exact number still works.
 */
export function SliderInput({
  label,
  value,
  onChange,
  min,
  max,
  scale = 'log',
  nullAt = 'min',
  format,
  offLabel = 'any',
  title,
  step = 0.5,
}: SliderInputProps) {
  const id = useId();
  const log = scale === 'log';
  const offPosition = nullAt === 'min' ? 0 : POSITIONS;
  const position = value === null ? offPosition : valueToPosition(value, min, max, log);

  const handleSlider = (pos: number) => {
    if (pos === offPosition) {
      onChange(null);
      return;
    }
    const raw = positionToValue(pos, min, max, log);
    onChange(log ? Math.max(1, Math.round(raw)) : Math.round(raw / step) * step);
  };

  return (
    <div className="flex w-44 flex-col gap-1 text-xs" title={title}>
      <label htmlFor={id} className="flex justify-between uppercase tracking-wide">
        <span className="opacity-60">{label}</span>
        <span className={value === null ? 'opacity-40 normal-case' : 'text-gold normal-case'}>
          {value === null ? offLabel : format(value)}
        </span>
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="range"
          min={0}
          max={POSITIONS}
          value={position}
          onChange={(e) => handleSlider(Number(e.target.value))}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded bg-panel-light accent-gold"
        />
        <input
          type="number"
          value={value ?? ''}
          placeholder="—"
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="w-[4.5rem] rounded border border-panel-border bg-ink px-1.5 py-0.5 text-right text-xs text-parchment outline-none focus:border-gold"
        />
      </div>
    </div>
  );
}
