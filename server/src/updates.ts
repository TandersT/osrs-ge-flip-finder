import path from 'node:path';
import { config, repoRoot } from './config.js';
import { readJsonFile, writeJsonFile } from './diskCache.js';

/**
 * OSRS wiki MediaWiki API client for update posts. Listing is 500 pages per
 * request (~3 calls for the whole Update: namespace); wikitext comes in bulk
 * batches of 50 pageids and is disk-cached FOREVER — update posts are
 * immutable once published, so each page is fetched exactly once, ever.
 */
const CACHE_DIR = path.join(repoRoot, 'server', 'data', 'patch-cache', 'updates');
const UPCOMING_FILE = path.join(repoRoot, 'server', 'data', 'patch-cache', 'upcoming.json');
const UPCOMING_FRESH_MS = 12 * 60 * 60 * 1000;
const PAGE_BATCH = 50;
/** Pause between bulk wikitext calls — backfill politeness. */
const BATCH_DELAY_MS = 250;
/** The wiki's Update: namespace. */
const UPDATE_NS = '112';

export interface UpdatePageRef {
  pageid: number;
  title: string;
}

export interface StoredUpdatePage {
  pageid: number;
  title: string;
  wikitext: string;
}

async function mwFetch<T>(params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  const res = await fetch(`${config.mediawikiApiBase}?${qs}`, {
    headers: { 'User-Agent': config.userAgent },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`mediawiki API responded ${res.status}`);
  return (await res.json()) as T;
}

/** Every page in the Update: namespace (~1,100 refs). */
export async function listUpdatePages(): Promise<UpdatePageRef[]> {
  const refs: UpdatePageRef[] = [];
  let apcontinue: string | undefined;
  do {
    const body = await mwFetch<{
      continue?: { apcontinue: string };
      query: { allpages: { pageid: number; title: string }[] };
    }>({
      action: 'query',
      list: 'allpages',
      apnamespace: UPDATE_NS,
      aplimit: '500',
      ...(apcontinue ? { apcontinue } : {}),
    });
    refs.push(...body.query.allpages);
    apcontinue = body.continue?.apcontinue;
  } while (apcontinue !== undefined);
  return refs;
}

/** Wikitext per page: disk first, then missing pages in bulk batches of 50. */
export async function getUpdatePages(
  refs: UpdatePageRef[],
  onProgress?: (done: number, total: number) => void,
): Promise<StoredUpdatePage[]> {
  const pages: StoredUpdatePage[] = [];
  const missing: UpdatePageRef[] = [];
  for (const ref of refs) {
    const cached = await readJsonFile<StoredUpdatePage>(path.join(CACHE_DIR, `${ref.pageid}.json`));
    if (cached) pages.push(cached);
    else missing.push(ref);
  }
  let done = refs.length - missing.length;
  onProgress?.(done, refs.length);

  for (let i = 0; i < missing.length; i += PAGE_BATCH) {
    const batch = missing.slice(i, i + PAGE_BATCH);
    const body = await mwFetch<{
      query: {
        pages: {
          pageid: number;
          title: string;
          missing?: boolean;
          revisions?: { slots: { main: { content: string } } }[];
        }[];
      };
    }>({
      action: 'query',
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      pageids: batch.map((r) => r.pageid).join('|'),
    });
    for (const p of body.query.pages) {
      const content = p.revisions?.[0]?.slots.main.content;
      if (p.missing === true || content === undefined) continue;
      const stored: StoredUpdatePage = { pageid: p.pageid, title: p.title, wikitext: content };
      await writeJsonFile(path.join(CACHE_DIR, `${p.pageid}.json`), stored);
      pages.push(stored);
    }
    done += batch.length;
    onProgress?.(done, refs.length);
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }
  return pages;
}

/** The "Upcoming updates" page's wikitext, disk-cached 12h, stale-on-error. */
export async function getUpcomingWikitext(): Promise<{ wikitext: string; fetchedAt: number }> {
  const cached = await readJsonFile<{ fetchedAt: number; wikitext: string }>(UPCOMING_FILE);
  if (cached && Date.now() - cached.fetchedAt < UPCOMING_FRESH_MS) return cached;
  try {
    const body = await mwFetch<{ parse: { wikitext: string } }>({
      action: 'parse',
      page: 'Upcoming updates',
      prop: 'wikitext',
    });
    const fresh = { fetchedAt: Date.now(), wikitext: body.parse.wikitext };
    await writeJsonFile(UPCOMING_FILE, fresh);
    return fresh;
  } catch (err) {
    if (cached) return cached; // stale beats nothing
    throw err;
  }
}
