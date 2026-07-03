import { NavLink, Route, Routes } from 'react-router-dom';
import FlipFinderPage from './pages/FlipFinderPage';
import ItemDetailPage from './pages/ItemDetailPage';
import LongTermPage from './pages/LongTermPage';
import WatchlistPage from './pages/WatchlistPage';
import StarterPage from './pages/StarterPage';
import FaqPage from './pages/FaqPage';
import FlipLogPage from './pages/FlipLogPage';

function Tab({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `rounded px-3 py-1.5 text-sm font-medium transition-colors ${
          isActive ? 'bg-panel-light text-gold' : 'text-parchment/70 hover:text-parchment'
        }`
      }
    >
      {label}
    </NavLink>
  );
}

export default function App() {
  return (
    <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col gap-4 px-4 py-4">
      <header className="flex flex-wrap items-center gap-4">
        <span className="text-xl font-bold text-gold">
          💰 GE Flip Finder
          <span className="ml-2 hidden text-xs font-normal opacity-50 sm:inline">
            Old School RuneScape
          </span>
        </span>
        <nav className="flex max-w-full gap-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none]">
          <Tab to="/" label="Flip Finder" />
          <Tab to="/starter" label="Get Started" />
          <Tab to="/longterm" label="Long-term" />
          <Tab to="/watchlist" label="Watchlist" />
          <Tab to="/log" label="Flip Log" />
          <Tab to="/faq" label="FAQ" />
        </nav>
      </header>
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<FlipFinderPage />} />
          <Route path="/starter" element={<StarterPage />} />
          <Route path="/item/:id" element={<ItemDetailPage />} />
          <Route path="/longterm" element={<LongTermPage />} />
          <Route path="/watchlist" element={<WatchlistPage />} />
          <Route path="/log" element={<FlipLogPage />} />
          <Route path="/faq" element={<FaqPage />} />
        </Routes>
      </main>
      <footer className="border-t border-panel-border/50 pt-3 text-center text-xs opacity-40">
        Live prices from the{' '}
        <a href="https://prices.runescape.wiki/" target="_blank" rel="noreferrer" className="underline">
          OSRS Wiki Real-time Prices API
        </a>{' '}
        · margins shown after the 2% GE tax · fan-made, not affiliated with Jagex
      </footer>
    </div>
  );
}
