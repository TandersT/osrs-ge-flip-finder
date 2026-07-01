import { useEffect, useState } from 'react';

export default function App() {
  const [health, setHealth] = useState<string>('checking…');

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setHealth(JSON.stringify(d)))
      .catch((e) => setHealth(`error: ${e}`));
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gold">GE Flip Finder</h1>
      <p className="mt-2 text-sm opacity-70">server health: {health}</p>
    </div>
  );
}
