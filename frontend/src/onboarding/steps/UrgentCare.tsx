import type { RefObject } from "react";

interface Props {
  heading_ref: RefObject<HTMLHeadingElement | null>;
  on_back: () => void;
}

export function UrgentCare({ heading_ref, on_back }: Props) {
  return (
    <section className="ob-panel ob-urgent" aria-labelledby="ob-urgent-title">
      <h1 id="ob-urgent-title" ref={heading_ref} tabIndex={-1}>
        See a dentist today
      </h1>
      <p>
        Severe pain, swelling, or fever can mean an infection that needs
        treatment soon. Call your dentist and ask for an emergency appointment.
        Most offices hold same-day slots for this.
      </p>
      <p>
        If swelling makes it hard to breathe or swallow, or is spreading toward
        your eye or neck, go to an emergency room or call 911.
      </p>
      <p className="ob-muted">
        Planning around your benefits can wait until the urgent problem is
        treated.
      </p>
      <div className="ob-nav">
        <button type="button" className="ob-button-secondary" onClick={on_back}>
          I checked a box by mistake
        </button>
      </div>
    </section>
  );
}
