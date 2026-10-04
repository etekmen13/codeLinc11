// Providers: two rows, in network above and out of network below, each
// sorted by what you'd pay. On wide screens the section pins and the rows
// scroll sideways with the page; on narrow screens and under reduced
// motion they stack.

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef, type ReactNode } from "react";
import { expectedPlanPays } from "../careplan/derive";
import { band_label } from "../lib/labels";
import { formatISODate, formatMoney } from "../lib/coverage";
import { prefersReducedMotion } from "../motion/config";
import { procedurePhrases, ui } from "../narrative/script";
import { fill, parts } from "../narrative/template";
import { editFrom } from "../narrative/useAdvance";
import { useScroll } from "../scroll/ScrollProvider";
import { procedure } from "../state/selectors";
import { useStore } from "../state/store";
import type { DentistOption, ProviderCard } from "../types";
import { InlineChoice } from "../ui/InlineChoice";

const RADII = [5, 10, 25, 50];

export function Providers() {
  const { scrollToStop } = useScroll();
  const remote = useStore((s) => s.comparison);
  const radius = useStore((s) => s.radius);
  const tolerance = useStore((s) => s.tolerance);
  const credential = useStore((s) => s.credential);
  const providerId = useStore((s) => s.providerId);
  const proc = useStore(procedure);
  const patch = useStore((s) => s.patch);
  const pin = useRef<HTMLDivElement>(null);
  const rows = useRef<(HTMLDivElement | null)[]>([]);

  const data = remote.data?.comparison;
  const quotes = remote.data?.quotes ?? [];
  const keep = (d: DentistOption) =>
    !credential || d.credentials.includes(credential);
  const inNet = (data?.in_network ?? []).filter(keep);
  const outNet = (data?.out_of_network ?? []).filter(keep);
  const credentials = [
    ...new Set(
      [...(data?.in_network ?? []), ...(data?.out_of_network ?? [])].flatMap(
        (d) => d.credentials,
      ),
    ),
  ].sort();
  const layoutKey = `${inNet.length}|${outNet.length}|${remote.key}`;

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const mm = gsap.matchMedia();
      mm.add("(min-width: 768px)", () => {
        const els = rows.current.filter((r): r is HTMLDivElement => !!r);
        const overflow = (el: HTMLElement) =>
          Math.max(0, el.scrollWidth - el.clientWidth);
        const longest = () => Math.max(0, ...els.map(overflow));
        if (longest() < 1) return;
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: pin.current,
            pin: true,
            start: "top top",
            end: () => `+=${longest()}`,
            scrub: true,
            invalidateOnRefresh: true,
          },
        });
        els.forEach((el) =>
          tl.to(
            el.firstElementChild,
            { x: () => -overflow(el), ease: "none" },
            0,
          ),
        );
      });
      return () => mm.revert();
    },
    { dependencies: [layoutKey], revertOnUpdate: true },
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
    <div className="providers" ref={pin}>
      <div className="providers__head">
        <p className="margin-note providers__intro">{ui.providers.intro}</p>
        <p className="providers__filters">
          {parts(ui.providers.filters).map((p, i) =>
            "text" in p ? (
              <span key={i}>{p.text}</span>
            ) : (
              <span key={i}>{tokens[p.token]}</span>
            ),
          )}
        </p>
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
      <div className="providers__rows" data-loading={remote.loading}>
        {[
          { label: ui.providers.inNetwork, list: inNet },
          { label: ui.providers.outOfNetwork, list: outNet },
        ].map((row, r) => (
          <section
            className="provider-row"
            key={row.label}
            aria-label={row.label}
          >
            <h2 className="provider-row__label">{row.label}</h2>
            <div
              className="provider-row__viewport"
              ref={(el) => {
                rows.current[r] = el;
              }}
            >
              <div className="provider-row__track">
                {row.list.length === 0 && data && (
                  <p className="quiet">{ui.providers.none}</p>
                )}
                {row.list.map((d) => (
                  <ProviderBlock
                    key={d.provider_id}
                    dentist={d}
                    quote={quotes.find((q) => q.id === d.provider_id)}
                    selected={providerId === d.provider_id}
                    onChoose={() => choose(d.provider_id)}
                  />
                ))}
              </div>
            </div>
          </section>
        ))}
        <p className="quiet providers__foot">{ui.providers.fsaNote}</p>
      </div>
    </div>
  );
}

function ProviderBlock({
  dentist: d,
  quote,
  selected,
  onChoose,
}: {
  dentist: DentistOption;
  quote?: ProviderCard;
  selected: boolean;
  onChoose: () => void;
}) {
  const youPay = d.lowest_cost.cost.mean;
  const planPays = expectedPlanPays(d.lowest_cost);
  const c = quote?.cost;
  return (
    <article className="provider" data-selected={selected}>
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
      <p className="provider__meta">
        <span className="tabular">{d.distance_miles} mi</span> ·{" "}
        {d.credentials.join(", ")}
      </p>
      <p
        className="figure tabular"
        aria-label={`${ui.providers.youPay} ${formatMoney(youPay)}`}
      >
        {formatMoney(youPay)}
      </p>
      <p className="provider__sub">
        {fill(ui.providers.planPays, { amount: formatMoney(planPays) })} ·{" "}
        {fill(ui.providers.onDate, { date: formatISODate(d.lowest_cost.date) })}
      </p>
      {!d.in_network && c && c.balance_billing > 0 && (
        <>
          <CostBar
            planPays={c.plan_pays}
            youPay={c.you_pay}
            gap={c.balance_billing}
          />
          <p className="margin-note provider__note">
            {fill(ui.terms.term_balance_billing, {
              allowedAmount: formatMoney(c.allowed_amount),
              fee: formatMoney(c.provider_fee),
              gap: formatMoney(c.balance_billing),
            })}
          </p>
        </>
      )}
    </article>
  );
}

// Today's bill split three ways; the balance bill is the orange sliver.
function CostBar({
  planPays,
  youPay,
  gap,
}: {
  planPays: number;
  youPay: number;
  gap: number;
}) {
  const share = Math.max(0, youPay - gap);
  return (
    <div
      className="cost-bar"
      role="img"
      aria-label={fill(ui.providers.barLabel, {
        planPays: formatMoney(planPays),
        share: formatMoney(share),
        gap: formatMoney(gap),
      })}
    >
      <span className="cost-bar__plan" style={{ flexGrow: planPays }} />
      <span className="cost-bar__you" style={{ flexGrow: share }} />
      <span className="cost-bar__gap" style={{ flexGrow: gap }} />
    </div>
  );
}
