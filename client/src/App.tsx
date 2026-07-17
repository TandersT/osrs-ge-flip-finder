import type { ReactNode } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import FlipFinderPage from './pages/FlipFinderPage';
import ItemDetailPage from './pages/ItemDetailPage';
import LongTermPage from './pages/LongTermPage';
import WatchlistPage from './pages/WatchlistPage';
import StarterPage from './pages/StarterPage';
import FaqPage from './pages/FaqPage';
import FlipLogPage from './pages/FlipLogPage';
import PremiumPage from './pages/PremiumPage';
import ToolsPage from './pages/ToolsPage';
import DealsPage from './pages/DealsPage';
import PatchesPage from './pages/PatchesPage';
import DivergencePage from './pages/DivergencePage';
import { AlertWatcher } from './components/AlertWatcher';
import { Icon } from './components/Icon';

function Tab({ to, label, icon }: { to: string; label: string; icon?: ReactNode }) {
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
      {icon}
      {label}
    </NavLink>
  );
}

export default function App() {
  return (
    <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col gap-4 px-4 py-4">
      <AlertWatcher />
      <header className="flex flex-wrap items-center gap-4">
        <span className="text-xl font-bold text-gold">
          <Icon name="coins" className="mr-1.5" /> GE Flip Finder
          <span className="ml-2 hidden text-xs font-normal opacity-50 sm:inline">
            Old School RuneScape
          </span>
        </span>
        <nav className="flex max-w-full gap-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none]">
          <Tab to="/" label="Flip Finder" />
          <Tab to="/deals" label="Best Deals" />
          <Tab to="/starter" label="Get Started" />
          <Tab to="/longterm" label="Long-term" />
          <Tab to="/patches" label="Patches" />
          <Tab to="/divergence" label="Divergence" />
          <Tab to="/tools" label="Tools" />
          <Tab to="/watchlist" label="Watchlist" />
          <Tab to="/log" label="Flip Log" />
          <Tab to="/faq" label="FAQ" />
          <Tab
            to="/premium"
            label="Premium"
            icon={<Icon name="sparkle" className="mr-1.5" size={13} />}
          />
        </nav>
      </header>
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<FlipFinderPage />} />
          <Route path="/deals" element={<DealsPage />} />
          <Route path="/starter" element={<StarterPage />} />
          <Route path="/item/:id" element={<ItemDetailPage />} />
          <Route path="/longterm" element={<LongTermPage />} />
          <Route path="/patches" element={<PatchesPage />} />
          <Route path="/divergence" element={<DivergencePage />} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/watchlist" element={<WatchlistPage />} />
          <Route path="/log" element={<FlipLogPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/premium" element={<PremiumPage />} />
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
