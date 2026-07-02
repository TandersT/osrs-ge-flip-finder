import { NavLink, Route, Routes } from 'react-router-dom';
import FlipFinderPage from './pages/FlipFinderPage';
import ItemDetailPage from './pages/ItemDetailPage';
import LongTermPage from './pages/LongTermPage';

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
        <h1 className="text-xl font-bold text-gold">
          💰 GE Flip Finder
          <span className="ml-2 text-xs font-normal opacity-50">Old School RuneScape</span>
        </h1>
        <nav className="flex gap-1">
          <Tab to="/" label="Flip Finder" />
          <Tab to="/longterm" label="Long-term" />
          <Tab to="/watchlist" label="Watchlist" />
        </nav>
      </header>
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<FlipFinderPage />} />
          <Route path="/item/:id" element={<ItemDetailPage />} />
          <Route path="/longterm" element={<LongTermPage />} />
          <Route
            path="/watchlist"
            element={<div className="p-10 text-center opacity-60">Watchlist — coming in step 7.</div>}
          />
        </Routes>
      </main>
    </div>
  );
}
