import type { SVGProps } from 'react';

/**
 * The app's single icon system: minimal 24×24 stroke glyphs that inherit
 * `currentColor`, so icons take the same theme colors as the text next to
 * them (see docs/design.md — no emoji or native glyphs in the UI chrome).
 */
export type IconName = keyof typeof PATHS;

const PATHS = {
  // actions & status
  star: (
    <path
      d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 9.7l5.9-.8z"
      fill="none"
    />
  ),
  'star-fill': (
    <path
      d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 9.7l5.9-.8z"
      fill="currentColor"
      stroke="none"
    />
  ),
  close: <path d="M6 6l12 12M18 6L6 18" fill="none" />,
  bookmark: <path d="M7 3.5h10a1 1 0 0 1 1 1v16l-6-4.2-6 4.2v-16a1 1 0 0 1 1-1z" fill="none" />,
  'bookmark-fill': (
    <path
      d="M7 3.5h10a1 1 0 0 1 1 1v16l-6-4.2-6 4.2v-16a1 1 0 0 1 1-1z"
      fill="currentColor"
      stroke="none"
    />
  ),
  refresh: <path d="M20 12a8 8 0 1 1-2.3-5.6M20 3.5V8h-4.5" fill="none" />,
  check: <path d="M4.5 12.5l5 5L19.5 7" fill="none" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="1.6" fill="none" />
      <path
        d="M15.5 8.5V6a1.6 1.6 0 0 0-1.6-1.6H6A1.6 1.6 0 0 0 4.4 6v7.9A1.6 1.6 0 0 0 6 15.5h2.5"
        fill="none"
      />
    </>
  ),
  warning: <path d="M12 3.5L2.5 20h19zM12 9.5v5m0 2.8v.2" fill="none" />,
  lock: (
    <path d="M7 10.5V7.75A4 4 0 0 1 15 7.75v2.75M5.5 10.5h13v9.5h-13zM12 14v2.5" fill="none" />
  ),
  bell: (
    <path
      d="M18 15.5H6c1.2-1.3 1.8-2.4 1.8-4.9 0-3 1.6-5.1 4.2-5.1s4.2 2.1 4.2 5.1c0 2.5.6 3.6 1.8 4.9zM10 18.5a2 2 0 0 0 4 0"
      fill="none"
    />
  ),
  book: (
    <path
      d="M5 4.5h11.5a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2zM5 15.5a2 2 0 0 1 2-2h11.5M9 8.5h5.5"
      fill="none"
    />
  ),
  // direction
  'chevron-up': <path d="M6 14.5l6-6 6 6" fill="none" />,
  'chevron-down': <path d="M6 9.5l6 6 6-6" fill="none" />,
  'arrow-up': <path d="M12 19V5m-6 6l6-6 6 6" fill="none" />,
  'arrow-down': <path d="M12 5v14m-6-6l6 6 6-6" fill="none" />,
  'arrow-left': <path d="M19 12H5m6-6l-6 6 6 6" fill="none" />,
  'arrow-right': <path d="M5 12h14m-6-6l6 6-6 6" fill="none" />,
  external: <path d="M7 17L17 7m-8 0h8v8" fill="none" />,
  // subject flavor (replaces the old emoji)
  coins: (
    <path
      d="M12 4.5c3.6 0 6.5 1.1 6.5 2.5S15.6 9.5 12 9.5 5.5 8.4 5.5 7 8.4 4.5 12 4.5zM5.5 7v5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V7M5.5 12v5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-5"
      fill="none"
    />
  ),
  sword: (
    <path d="M19.5 4.5L9 15m10.5-10.5l-4 .5-8.5 8.5 3.5 3.5 8.5-8.5zM7.5 13L4 16.5 7.5 20l3.5-3.5M4.5 19.5l-1 1" fill="none" />
  ),
  shield: <path d="M12 3.5l7.5 2.7v5.3c0 4.6-3.2 7.8-7.5 9-4.3-1.2-7.5-4.4-7.5-9V6.2z" fill="none" />,
  flask: (
    <path d="M10 3.5h4M10.5 3.5v5L5 18.2a1.6 1.6 0 0 0 1.4 2.3h11.2a1.6 1.6 0 0 0 1.4-2.3L13.5 8.5v-5M7.5 14.5h9" fill="none" />
  ),
  gem: <path d="M7 4.5h10l3.5 5L12 20.5 1.5 9.5zm-5.5 5h21M12 20.5L8 9.5l2.5-5m1 0l2.5 5-2 11" fill="none" />,
  bolt: <path d="M13 3L5.5 13.5h5L11 21l7.5-10.5h-5z" fill="none" />,
  chart: <path d="M4 4.5v15h16M8 15l3.5-4 2.5 2.5 5-6" fill="none" />,
  moon: <path d="M19.5 14A8 8 0 0 1 10 4.5 8 8 0 1 0 19.5 14z" fill="none" />,
  sparkle: (
    <path d="M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8zM18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" fill="none" />
  ),
} as const;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  /** Pixel size; defaults to 1em so icons scale with the surrounding text. */
  size?: number | string;
}

export function Icon({ name, size = '1em', className = '', ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      aria-hidden={rest['aria-label'] ? undefined : true}
      className={`inline-block shrink-0 align-[-0.125em] ${className}`}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
