import type { CareComparison, DentistOption, ProviderCard } from "../types";
import { dateLabel, money, percent } from "./format";
export function CompareScreen({
  data,
  today,
  onSelect,
}: {
  data: CareComparison;
  today: ProviderCard[];
  onSelect: (id: string) => void;
}) {
  function card(d: DentistOption) {
    const current = today.find((p) => p.id === d.provider_id)?.cost;
    return (
      <article className="card cp-provider" key={d.provider_id}>
        <div className="cp-card-top">
          <span className={`cp-badge ${d.in_network ? "network" : "outside"}`}>
            {d.in_network ? "In-network" : "Out-of-network"}
          </span>
          <span>{d.distance_miles} mi</span>
        </div>
        <h3>{d.name}</h3>
        <p className="muted">
          {d.credentials.join(" · ") || "Credentials not supplied"}
        </p>
        <div className="cp-price-contrast">
          <div>
            <span>Today’s insured price</span>
            <strong>{current ? money(current.you_pay) : "Unavailable"}</strong>
            <small>Before FSA / tax effects</small>
          </div>
          <div>
            <span>Best schedule in tolerance</span>
            <strong>{money(d.lowest_cost.cost.mean)}</strong>
            <small>
              {dateLabel(d.lowest_cost.date)} · {d.lowest_cost.path} · after FSA
              / tax
            </small>
          </div>
        </div>
        <p>
          Comparable current-date cost after FSA / tax:{" "}
          <strong>{money(d.baseline.cost.mean)}</strong>
        </p>
        <div className="cp-balance">
          Today’s balance bill{" "}
          <strong>
            {current ? money(current.balance_billing) : "Unavailable"}
          </strong>
        </div>
        <p>
          Average savings {money(d.savings.mean)} · escalation risk{" "}
          {percent(d.lowest_cost.escalation_probability)}
        </p>
        <button className="primary" onClick={() => onSelect(d.provider_id)}>
          View this care plan →
        </button>
      </article>
    );
  }
  return (
    <>
      <p className="intro">
        Each provider is priced on its own schedule. Comparison date:{" "}
        {dateLabel(data.as_of)}.
      </p>
      <div className="cp-compare-columns">
        {[
          { label: "In-network", rows: data.in_network },
          { label: "Out-of-network", rows: data.out_of_network },
        ].map((column) => (
          <section key={column.label}>
            <h2>
              {column.label}{" "}
              <span className="cp-count">{column.rows.length}</span>
            </h2>
            {column.rows.length ? (
              column.rows.map(card)
            ) : (
              <div className="card">
                No providers in this column within the selected radius.
              </div>
            )}
          </section>
        ))}
      </div>
      <details className="card">
        <summary>Comparison assumptions</summary>
        <ul>
          {data.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </details>
    </>
  );
}
