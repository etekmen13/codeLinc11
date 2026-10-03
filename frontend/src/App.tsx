import { useEffect, useState } from "react";

type Trade = { id: number; symbol: string; qty: number };

export default function App() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [symbol, setSymbol] = useState("");
  const [qty, setQty] = useState("");

  useEffect(() => {
    fetch("/api/trades")
      .then((res) => res.json())
      .then(setTrades);
  }, []);

  async function addTrade() {
    const res = await fetch("/api/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, qty: Number(qty) }),
    });
    const created: Trade = await res.json();
    setTrades((prev) => [...prev, created]);
    setSymbol("");
    setQty("");
  }

  return (
    <main>
      <h1>Trades</h1>
      <input
        value={symbol}
        onChange={(e) => setSymbol(e.target.value)}
        placeholder="Symbol"
      />
      <input
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        placeholder="Quantity"
        type="number"
      />
      <button onClick={addTrade}>Add</button>
      <ul>
        {trades.map((t) => (
          <li key={t.id}>
            {t.symbol}: {t.qty}
          </li>
        ))}
      </ul>
    </main>
  );
}
