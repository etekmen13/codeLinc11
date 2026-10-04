// The narrator, drawn in the left third (or the top, on narrow screens).
// Decorative: everything he says is in the narration layer. Presence and
// expression come from lincolnView(); each expression is its own stacked
// image, so switching is a cross-fade with nothing shifting.

import { useEffect, useState } from "react";
import type { Stop, StopKind } from "../narrative/flow";
import { beats, type Expression } from "../narrative/script";
import { useStore, type AppState } from "../state/store";
import { assetUrls, EXPRESSIONS } from "./assets";
import { canvas } from "./config";
import { lincolnView, type LincolnView } from "./presence";

// Whether a content stop (no narrator line) is waiting on the backend.
const loadingFor: Partial<Record<StopKind, (s: AppState) => boolean>> = {
  recap: (s) => s.onboarding.loading,
  providers: (s) => s.comparison.loading,
  careplan: (s) => s.carePlan.loading,
};

export function Lincoln({ stops, acute }: { stops: Stop[]; acute: boolean }) {
  const currentId = useStore((s) => s.currentStopId);
  const reaction = useStore((s) => s.reaction);
  const stop = stops.find((s) => s.id === currentId);
  const loading = useStore((s) =>
    stop ? (loadingFor[stop.kind]?.(s) ?? false) : false,
  );
  const staged = useStore(
    (s) => s.currentStopId === "sim_intro" && s.simStage !== "idle",
  );

  // The acute takeover: concerned, with no reactions.
  const view: LincolnView = acute
    ? { presence: "full", expression: beats.acute_takeover.expression }
    : lincolnView(stop, reaction, loading, staged);

  // Entrance: start offstage, then slide in on the first frame after paint.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  const presence = entered ? view.presence : "away";

  return (
    <div
      className="lincoln"
      data-presence={presence}
      data-takeover={acute || undefined}
      aria-hidden="true"
    >
      <div className="lincoln__figure">
        {EXPRESSIONS.map((e) => (
          <Face key={e} expression={e} shown={e === view.expression} />
        ))}
      </div>
    </div>
  );
}

function Face({
  expression,
  shown,
}: {
  expression: Expression;
  shown: boolean;
}) {
  const url = assetUrls[expression];
  if (url)
    return (
      <img
        className="lincoln__face"
        data-shown={shown}
        src={url}
        alt=""
        draggable={false}
      />
    );
  // Placeholder until the art exists: a maroon circle on the same canvas.
  const r = canvas.width * 0.46;
  return (
    <svg
      className="lincoln__face"
      data-shown={shown}
      viewBox={`0 0 ${canvas.width} ${canvas.height}`}
      preserveAspectRatio="xMinYMax meet"
    >
      <circle
        cx={canvas.width / 2}
        cy={canvas.height - r - canvas.width * 0.04}
        r={r}
        fill="var(--maroon)"
      />
    </svg>
  );
}
