import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// .env lives at the repo root, whether we run from server/src (tsx) or server/dist (node)
export const repoRoot = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(repoRoot, '.env') });

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: num('PORT', 3000),
  wikiApiBase: process.env.WIKI_API_BASE ?? 'https://prices.runescape.wiki/api/v1/osrs',
  userAgent: process.env.WIKI_USER_AGENT ?? 'ge-flip-finder/1.0 (contact: unset)',
  captureRate: num('CAPTURE_RATE', 0.1),
  offerOffset: num('OFFER_OFFSET', 1),
  clientRefreshSeconds: num('CLIENT_REFRESH_SECONDS', 60),
  staleAfterSeconds: num('STALE_AFTER_SECONDS', 1800),
  longtermMinDailyVolume: num('LONGTERM_MIN_DAILY_VOLUME', 5000),
  longtermMaxItems: num('LONGTERM_MAX_ITEMS', 400),
};
