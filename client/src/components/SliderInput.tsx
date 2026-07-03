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
  /** Used for the tooltip on the value input, e.g. "≥ 350k". */
  format: (v: number) => string;
  /** Input placeholder when the filter is off. */
  offLabel?: string;
  title?: string;
  /** Rounding step for linear scale. */
  step?: number;
}

/**
 * A self-contained filter bound: label + editable value on the top row,
 * slider full-width below. Dragging to the "off" end clears the filter.
 * Full-width on phones so controls stack instead of colliding.
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
    <div className="flex w-full flex-col gap-1.5 text-xs sm:w-44" title={title}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="uppercase tracking-wide opacity-60">
          {label}
        </label>
        <input
          type="number"
          aria-label={`${label} — exact value`}
          title={value === null ? offLabel : format(value)}
          value={value ?? ''}
          placeholder={offLabel}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className={`w-[4.5rem] rounded border border-panel-border bg-ink px-1.5 py-0.5 text-right text-xs outline-none focus:border-gold ${
            value === null ? 'text-parchment/60' : 'text-gold'
          }`}
        />
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={POSITIONS}
        value={position}
        onChange={(e) => handleSlider(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded bg-panel-light accent-gold"
      />
    </div>
  );
}
