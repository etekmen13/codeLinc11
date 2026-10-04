// Providers: two columns, in network beside out of network, each sorted by
// what you'd pay. A row is a dentist's name, distance and one figure, with a
// bar of how their bill splits; the rest shows on hover or focus. On narrow
// screens the columns stack.

import { type ReactNode } from "react";
import { billSplit, owed, type BillSplit } from "../careplan/derive";
import { band_label } from "../lib/labels";
import { formatISODate, formatMoney } from "../lib/coverage";
import { procedurePhrases, ui } from "../narrative/script";
import { fill, parts } from "../narrative/template";
import { editFrom } from "../narrative/useAdvance";
import { useScroll } from "../scroll/ScrollProvider";
import { procedure, samplePlan } from "../state/selectors";
import { useStore } from "../state/store";
import type { DentistOption } from "../types";
import { InlineChoice } from "../ui/InlineChoice";

const RADII = [5, 10, 25, 50];

export function Providers() {
  const { scrollToStop } = useScroll();
  const remote = useStore((s) => s.comparison);
  const radius = useStore((s) => s.radius);
  const tolerance = useStore((s) => s.tolerance);
  const credential = useStore((s) => s.credential);
  const providerId = useStore((s) => s.providerId);
  const useFsa = useStore((s) => s.useFsa);
  const fsa = useStore((s) => samplePlan(s)?.default_member.fsa ?? null);
  const proc = useStore(procedure);
  const patch = useStore((s) => s.patch);

  const data = remote.data?.comparison;
  const keep = (d: DentistOption) =>
    !credential || d.credentials.includes(credential);
  const inNet = (data?.in_network ?? []).filter(keep).sort(byOwed);
  const outNet = (data?.out_of_network ?? []).filter(keep).sort(byOwed);
  const credentials = [
    ...new Set(
      [...(data?.in_network ?? []), ...(data?.out_of_network ?? [])].flatMap(
        (d) => d.credentials,
      ),
    ),
  ].sort();
  // Bars share one scale, so a longer bar is a bigger bill.
  const maxFee = Math.max(
    1,
    ...[...inNet, ...outNet].map((d) => billSplit(d.lowest_cost).fee),
  );

  const choose = (id: string) => {
    patch({
      providerId: id,
      timingId: null,
      advanceFrom: "providers",
      reaction: null,
    });
  };

  const tokens: Record<string, ReactNode> = {
    radius: (
      <InlineChoice
        name="Distance"
        label={fill(ui.providers.radius, { n: radius })}
        value={String(radius)}
        choices={RADII.map((r) => ({
          value: String(r),
          label: fill(ui.providers.radius, { n: r }),
        }))}
        onChange={(v) => patch({ radius: Number(v) })}
      />
    ),
    procedure: (
      <button
        type="button"
        className="editable"
        onClick={() => {
          editFrom("providers");
          scrollToStop("procedure");
        }}
      >
        {proc
          ? (procedurePhrases[proc.cdt_code] ?? proc.name.toLowerCase())
          : ""}
      </button>
    ),
    tolerance: (
      <InlineChoice
        name="Risk tolerance"
        label={band_label(tolerance, data?.risk_bands ?? []).toLowerCase()}
        value={tolerance}
        choices={(data?.risk_bands ?? []).map((b) => ({
          value: b.name,
          label: band_label(b.name, data!.risk_bands).toLowerCase(),
        }))}
        onChange={(v) => patch({ tolerance: v })}
      />
    ),
    credentials: (
      <InlineChoice
        name="Credentials"
        label={credential ?? ui.providers.anyCredentials}
        value={credential ?? ""}
        choices={[
          { value: "", label: ui.providers.anyCredentials },
          ...credentials.map((c) => ({ value: c, label: c })),
        ]}
        onChange={(v) => patch({ credential: v || null })}
      />
    ),
  };

  return (
    <div className="providers">
      <div className="providers__head">
        <p className="providers__filters">
          {parts(ui.providers.filters).map((p, i) =>
            "text" in p ? (
              <span key={i}>{p.text}</span>
            ) : (
              <span key={i}>{tokens[p.token]}</span>
            ),
          )}
        </p>
        <div className="providers__tools">
          {fsa && (
            <button
              type="button"
              role="switch"
              aria-checked={useFsa}
              className="switch"
              onClick={() => patch({ useFsa: !useFsa })}
            >
              <span className="switch__track" aria-hidden="true">
                <span className="switch__thumb" />
              </span>
              {ui.providers.fsa}
              <span className="quiet tabular">
                {fill(ui.providers.fsaBalance, {
                  amount: formatMoney(fsa.balance),
                })}
              </span>
            </button>
          )}
          <Legend />
        </div>
        <div aria-live="polite">
          {remote.loading && <p className="quiet">{ui.providers.loading}</p>}
          {remote.problems && (
            <p role="alert">
              {fill(ui.providers.error, {
                problems: remote.problems.join(" "),
              })}{" "}
              <button
                type="button"
                className="text-link"
                onClick={() => patch({ retry: useStore.getState().retry + 1 })}
              >
                {ui.providers.retry}
              </button>
            </p>
          )}
        </div>
      </div>
      <div className="providers__columns" data-loading={remote.loading}>
        {[
          {
            id: "in",
            label: ui.providers.inNetwork,
            note: ui.providers.inNetworkNote,
            list: inNet,
          },
          {
            id: "out",
            label: ui.providers.outOfNetwork,
            note: ui.providers.outOfNetworkNote,
            list: outNet,
          },
        ].map((col) => (
          <section
            className="provider-col"
            key={col.id}
            aria-labelledby={`provider-col-${col.id}`}
          >
            <header className="provider-col__head">
              <h2 className="provider-col__label" id={`provider-col-${col.id}`}>
                {col.label}
              </h2>
              <p className="quiet">{col.note}</p>
            </header>
            {col.list.length === 0 && data && (
              <p className="quiet">{ui.providers.none}</p>
            )}
            <ol className="provider-col__list">
              {col.list.map((d) => (
                <ProviderEntry
                  key={d.provider_id}
                  dentist={d}
                  asOf={data?.as_of ?? ""}
                  maxFee={maxFee}
                  selected={providerId === d.provider_id}
                  onChoose={() => choose(d.provider_id)}
                />
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}

// What you'd owe the dentist, then the backend's net cost, then distance.
function byOwed(a: DentistOption, b: DentistOption): number {
  return (
    owed(a.lowest_cost).total - owed(b.lowest_cost).total ||
    a.lowest_cost.cost.mean - b.lowest_cost.cost.mean ||
    a.distance_miles - b.distance_miles
  );
}

function ProviderEntry({
  dentist: d,
  asOf,
  maxFee,
  selected,
  onChoose,
}: {
  dentist: DentistOption;
  asOf: string;
  maxFee: number;
  selected: boolean;
  onChoose: () => void;
}) {
  const option = d.lowest_cost;
  // What you'd owe the dentist. The FSA is a way to pay it, not a discount,
  // so its part is noted rather than subtracted.
  const { total: youPay, fromFsa } = owed(option);
  const split = billSplit(option);
  const cash = option.path === "cash";
  const later = asOf !== "" && option.date !== asOf;
  const money = (n: number) => formatMoney(n);

  // At rest: distance, plus a word when the price is cash or on a later date.
  const meta = [
    fill(ui.providers.miles, { n: d.distance_miles }),
    cash && ui.providers.cash,
    later && formatISODate(option.date),
  ].filter(Boolean);

  // On hover or focus: how the bill splits, and the credentials.
  const details = [
    fill(ui.providers.billed, { amount: money(split.fee) }),
    fill(ui.providers.planPays, { amount: money(split.planPays) }),
    split.balance >= 0.5 &&
      fill(ui.providers.balanceBill, { amount: money(split.balance) }),
    split.writtenOff >= 0.5 &&
      fill(cash ? ui.providers.cashWaived : ui.providers.waived, {
        amount: money(split.writtenOff),
      }),
    d.credentials.join(", "),
  ].filter(Boolean);

  return (
    <li className="provider" data-selected={selected}>
      <div className="provider__who">
        <h3 className="provider__name">
          <button
            type="button"
            className="provider__choose"
            aria-pressed={selected}
            onClick={onChoose}
          >
            <span className="sr-only">{ui.providers.choose} </span>
            {d.name}
          </button>
        </h3>
        <p className="provider__meta tabular">{meta.join(" · ")}</p>
      </div>
      <div className="provider__price">
        <p
          className="figure tabular"
          aria-label={`${ui.providers.youPay} ${money(youPay)}`}
        >
          {money(youPay)}
        </p>
        {fromFsa >= 0.5 && (
          <p className="provider__fsa tabular">
            {youPay - fromFsa < 0.5
              ? ui.providers.allFsa
              : fill(ui.providers.fromFsa, { amount: money(fromFsa) })}
          </p>
        )}
      </div>
      <BillBar split={split} maxFee={maxFee} />
      <p className="provider__note">{details.join(" · ")}</p>
    </li>
  );
}

// The expected bill as one bar, as long as the bill relative to the largest
// one shown: plan pays, you pay, the balance bill (orange), and what the
// dentist waives.
function BillBar({ split, maxFee }: { split: BillSplit; maxFee: number }) {
  const segments = [
    ["plan", split.planPays],
    ["you", Math.max(0, split.youPay - split.balance)],
    ["gap", split.balance],
    ["waived", split.writtenOff],
  ] as const;
  return (
    <div className="bill-bar" aria-hidden="true">
      <div
        className="bill-bar__fill"
        style={{ width: `${(split.fee / maxFee) * 100}%` }}
      >
        {segments.map(
          ([kind, amount]) =>
            amount >= 0.5 && (
              <span
                key={kind}
                className={`bill-bar__${kind}`}
                style={{ flexGrow: amount }}
              />
            ),
        )}
      </div>
    </div>
  );
}

function Legend() {
  const l = ui.providers.legend;
  return (
    <ul className="bill-legend" aria-hidden="true">
      <li>
        <span className="bill-bar__plan" />
        {l.plan}
      </li>
      <li>
        <span className="bill-bar__you" />
        {l.you}
      </li>
      <li>
        <span className="bill-bar__gap" />
        {l.gap}
      </li>
      <li>
        <span className="bill-bar__waived" />
        {l.waived}
      </li>
    </ul>
  );
}
