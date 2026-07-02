import { iconUrl } from '@osrs-flip/shared';

export function ItemIcon({ icon, name, size = 24 }: { icon: string | null; name: string; size?: number }) {
  const url = iconUrl(icon);
  if (!url) return <span style={{ width: size, height: size }} className="inline-block" />;
  return (
    <img
      src={url}
      alt={name}
      loading="lazy"
      width={size}
      height={size}
      className="inline-block object-contain"
      style={{ width: size, height: size }}
    />
  );
}
