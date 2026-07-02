import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">{title}</h2>
      {children}
    </section>
  );
}

function Q({ id, q, children }: { id?: string; q: string; children: React.ReactNode }) {
  return (
    <details
      id={id}
      className="group rounded border border-panel-border bg-panel open:border-gold/40"
    >
      <summary className="cursor-pointer select-none px-4 py-3 font-medium text-parchment hover:text-gold group-open:text-gold">
        {q}
      </summary>
      <div className="space-y-2 px-4 pb-4 text-sm leading-relaxed opacity-80">{children}</div>
    </details>
  );
}

export default function FaqPage() {
  const { hash } = useLocation();

  // Deep links like /faq#high-alch should open and scroll to the entry
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el instanceof HTMLDetailsElement) {
      el.open = true;
      el.scrollIntoView({ block: 'center' });
    }
  }, [hash]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-gold">FAQ</h1>
        <p className="mt-1 text-sm opacity-70">
          How the numbers are computed, where the data comes from, and what the warnings mean.
          New to flipping? Start with the <Link to="/starter" className="text-gold underline">Build your bank</Link> guide.
        </p>
      </header>

      <Section title="Flipping basics">
        <Q q="What is flipping?">
          <p>
            Buying an item on the Grand Exchange below its going rate and re-selling it above —
            profiting from the gap (the <em>spread</em>) between what impatient sellers accept and
            what impatient buyers pay. No combat stats or quests required; just gp and patience.
          </p>
        </Q>
        <Q q='What do "Buy" and "Sell" prices mean here?'>
          <p>
            The wiki tracks two live prices per item: the <strong>insta-sell</strong> price (what
            you get selling instantly — someone&apos;s standing buy offer) and the{' '}
            <strong>insta-buy</strong> price (what you pay buying instantly — someone&apos;s
            standing sell offer).
          </p>
          <p>
            To flip you do the opposite of insta-trading: our <strong>Buy</strong> price is
            insta-sell + 1 gp (your buy offer outbids the current best) and our{' '}
            <strong>Sell</strong> price is insta-buy − 1 gp (your sell undercuts the current
            best). The ±1 offset is the competitive-offer convention; it&apos;s configurable
            server-side via <code>OFFER_OFFSET</code>.
          </p>
        </Q>
        <Q q="What are buy limits?">
          <p>
            The GE caps how many of each item one account can <em>buy</em> per rolling 4-hour
            window — 70 for an Abyssal whip, 15,000 for many runes. The clock starts at your
            first purchase of that item. Selling is never limited. Items where the wiki
            doesn&apos;t know the limit show &ldquo;—&rdquo;.
          </p>
        </Q>
        <Q q="Why did my offer not fill at these prices?">
          <p>
            Prices move constantly, and thin items may only trade a few times per hour. The
            listed prices are the <em>last observed</em> trades, not guarantees. Prefer
            high-volume items (the Vol/1h column), check the Age column, and re-price offers
            that sit unfilled for more than ~10 minutes.
          </p>
        </Q>
      </Section>

      <Section title="The GE tax">
        <Q q="How is the 2% tax computed exactly?">
          <p>
            The seller pays 2% of the sale price, <strong>per item</strong>, rounded{' '}
            <strong>down</strong> to whole gp. Buyers never pay tax. Consequences of the
            rounding: anything sold at 49 gp or less is completely tax-free (2% of 49 = 0.98 →
            0), and at exactly 50 gp the tax is 1 gp.
          </p>
          <p>
            The tax is <strong>capped at 5,000,000 gp per item</strong> — reached at a
            250,000,000 gp sale price. Above that, the effective rate falls below 2%.
          </p>
        </Q>
        <Q q='What does the "exempt" badge mean?'>
          <p>
            Roughly 45 items pay <em>no tax at all</em>: Old School bonds plus cheap
            tools and necessities (chisels, hammers, low-tier food, basic teleports, some
            ammo). Our list is generated from the wiki&apos;s{' '}
            <a
              className="text-gold underline"
              href="https://oldschool.runescape.wiki/w/Category:Items_exempt_from_Grand_Exchange_tax"
              target="_blank"
              rel="noreferrer"
            >
              exemption category
            </a>{' '}
            and includes dose/charge variants (e.g. all four Energy potion doses).
          </p>
        </Q>
        <Q q="Is the tax included in the margins I see?">
          <p>
            Yes — everywhere. <code>margin = sell − buy − tax(sell)</code>. A spread that looks
            positive can genuinely be a loss after tax; those rows show red negative margins
            rather than being hidden.
          </p>
        </Q>
      </Section>

      <Section title="The numbers">
        <Q q='How is "Profit / 4h" estimated?'>
          <p>
            <code>margin × feasible quantity</code>, where feasible quantity is the smaller of
            your buy limit and a slice of the market&apos;s 4-hour volume. We assume you capture{' '}
            <strong>10%</strong> of traded volume by default (<code>CAPTURE_RATE</code>) — you
            can&apos;t realistically absorb a whole market. Treat it as an upper bound for one
            account grinding one item, not a promise.
          </p>
        </Q>
        <Q q="Where does the volume data come from?">
          <p>
            The Vol/1h column is actual units traded in the last hour (both sides averaged from
            the wiki&apos;s 1-hour window); Vol/day is the wiki&apos;s daily series. When an item
            traded nothing in the last hour we fall back to daily volume ÷ 6 for throughput
            estimates — zero recent volume is treated as a real zero, not &ldquo;unknown&rdquo;.
          </p>
        </Q>
        <Q id="high-alch" q="How does the high-alch panel work?">
          <p>
            Every item page shows <code>high alch value − buy price − nature rune</code> using
            the live nature rune price. When it&apos;s positive, casting High Level Alchemy on
            the item beats selling it back — a classic way to combine Magic training with
            profit. You need 55 Magic and fire runes (or a fire staff).
          </p>
        </Q>
        <Q q="What do the gp colours mean?">
          <p>
            RuneScape&apos;s own money colours: <span className="text-osrs-yellow">yellow</span>{' '}
            below 100k, <span className="text-white">white</span> from 100k, and{' '}
            <span className="text-osrs-green">green</span> from 10m. Negative amounts are{' '}
            <span className="text-osrs-red">red</span>. Hover any amount for the exact figure.
          </p>
        </Q>
      </Section>

      <Section title="Risk flags">
        <Q q='What does "stale" mean?'>
          <p>
            One of the item&apos;s two price sides hasn&apos;t traded recently (default: 30
            minutes, <code>STALE_AFTER_SECONDS</code>). The listed price may be far from
            reality. The Age column shows the older of the two sides — red when stale.
          </p>
        </Q>
        <Q q='What does "thin" mean?'>
          <p>
            A juicy margin (≥4% ROI) on tiny volume (fewer than 30 units/hour). That pattern
            usually means price manipulation or a market so quiet your offer would never fill.
            The margin is technically real; your ability to realise it repeatedly is not.
          </p>
        </Q>
        <Q q='What does "unstable" mean?'>
          <p>
            The latest price disagrees with the last hour&apos;s average by more than 10% on
            either side — the price is moving fast or being spiked. Margins computed from a
            single outlier trade are unreliable.
          </p>
        </Q>
      </Section>

      <Section title="Long-term signals">
        <Q q="What is the z-score?">
          <p>
            How many standard deviations today&apos;s price sits from its 90-day average. A
            z-score of −2 means unusually cheap relative to its own recent history; +2 means
            unusually expensive. It needs at least 30 days of history to be shown.
          </p>
        </Q>
        <Q q='What counts as a "dip" or "momentum"?'>
          <p>
            <strong>Dip:</strong> a liquid item (≥5,000 traded/day) at least 1 standard
            deviation below its 90-day mean. <strong>Momentum:</strong> a sustained 14-day
            uptrend (&gt;0.3%/day) with rising volume and a positive last 7 days.
          </p>
          <p>
            Neither is a buy signal by itself. OSRS prices move on game updates — new content,
            Leagues, holiday events — which no statistic predicts. That&apos;s why the banner on
            that tab never goes away.
          </p>
        </Q>
        <Q q="Why does the long-term tab only show ~250 items?">
          <p>
            History has to be fetched per item, so we screen the most liquid items (≥5,000
            traded/day, top 250 by volume) rather than hammering the wiki API with 4,600
            requests. The screen rebuilds at most every 12 hours.
          </p>
        </Q>
      </Section>

      <Section title="The tool">
        <Q q="Where does the data come from?">
          <p>
            The{' '}
            <a
              className="text-gold underline"
              href="https://prices.runescape.wiki/"
              target="_blank"
              rel="noreferrer"
            >
              OSRS Wiki Real-time Prices API
            </a>
            , which aggregates trades from RuneLite users. Your browser never calls the wiki
            directly — our server proxies and caches everything (latest prices for 60s, hourly
            windows for 1h, item metadata for 24h) and identifies itself with a proper
            User-Agent, per the wiki&apos;s API etiquette.
          </p>
        </Q>
        <Q q="How fresh is what I'm seeing?">
          <p>
            The table re-polls every 60 seconds (countdown top-right, ⟳ to refresh now). If the
            wiki API goes down, we keep serving the last good snapshot and show an amber
            warning banner instead of a broken page.
          </p>
        </Q>
        <Q q="Where is my watchlist stored?">
          <p>
            In your browser&apos;s localStorage — nothing leaves your machine and there are no
            accounts. Clearing site data clears the watchlist. &ldquo;Since added&rdquo;
            measures from the mid-price at the moment you starred the item.
          </p>
        </Q>
        <Q q="Can I share a filtered view?">
          <p>
            Yes — filters and sorting are encoded in the URL. Copy the address bar and the
            recipient sees exactly your view.
          </p>
        </Q>
        <Q q="Is this affiliated with Jagex?">
          <p>
            No. Old School RuneScape is a trademark of Jagex Ltd. This is a fan-made tool built
            on the community-run wiki&apos;s public price API. Item icons are served from the
            wiki.
          </p>
        </Q>
      </Section>
    </div>
  );
}
