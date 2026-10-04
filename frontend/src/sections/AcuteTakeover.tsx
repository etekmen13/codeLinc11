import { useEffect, useRef, useState } from "react";
import { fetch_nearby } from "../api";
import { Options } from "../narrative/Options";
import { beats, ui } from "../narrative/script";
import { fill } from "../narrative/template";
import { useStore } from "../state/store";
import type { NearbyProvider } from "../types";

// Severe symptoms: the screen floods orange and everything else steps away.
// Serious and plain. The closest dentists can be listed without any intake.
export function AcuteTakeover() {
  const beat = beats.acute_takeover;
  const [nearby, setNearby] = useState<NearbyProvider[] | null>(null);
  const [failed, setFailed] = useState(false);
  const heading = useRef<HTMLParagraphElement>(null);
  useEffect(() => heading.current?.focus(), []);

  return (
    <div
      className="takeover"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="takeover-line"
    >
      <div className="takeover__body">
        <p
          id="takeover-line"
          className="takeover__line"
          ref={heading}
          tabIndex={-1}
        >
          {beat.line}
        </p>
        <p className="takeover__safety">{ui.takeover.safety}</p>
        <Options
          options={beat.options ?? []}
          onPick={(o) => {
            if (o.value === "restart") useStore.getState().restart();
            else
              fetch_nearby()
                .then(setNearby)
                .catch(() => setFailed(true));
          }}
        />
        {failed && <p role="alert">{ui.takeover.nearbyError}</p>}
        {nearby && (
          <section
            aria-label={ui.takeover.nearbyHeading}
            className="takeover__nearby"
          >
            <h2>{ui.takeover.nearbyHeading}</h2>
            <ul className="plain-list">
              {nearby.map((p) => (
                <li key={p.id}>
                  <span className="takeover__name">{p.name}</span>{" "}
                  <span className="tabular">
                    {fill(ui.takeover.miles, { n: p.distance_miles })}
                  </span>
                  {" · "}
                  {p.credentials.join(", ")}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
