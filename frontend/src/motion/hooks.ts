// Scroll-linked motion shared by sections. Every effect is scrubbed (tied to
// scroll position), and none run under reduced motion.

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { RefObject } from "react";
import { parallax, prefersReducedMotion } from "./config";

// Large type drifting at parallax.type times scroll speed.
export function useParallax(
  ref: RefObject<HTMLElement | null>,
  speed: number = parallax.type,
) {
  useGSAP(
    () => {
      const el = ref.current;
      if (!el || prefersReducedMotion()) return;
      const lag = 1 - speed; // fraction of scroll the element gives back
      gsap.fromTo(
        el,
        { y: () => -lag * window.innerHeight * 0.5 },
        {
          y: () => lag * window.innerHeight * 0.5,
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "top bottom",
            end: "bottom top",
            scrub: true,
            invalidateOnRefresh: true,
          },
        },
      );
    },
    { dependencies: [speed] },
  );
}

// A headline that settles as it arrives: softer and lighter below the fold,
// firm at rest. Drives --settle (0 to 1), which the CSS maps to the Fraunces
// SOFT and weight axes.
export function useSettle(ref: RefObject<HTMLElement | null>) {
  useGSAP(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.style.setProperty("--settle", "1");
      return;
    }
    gsap.fromTo(
      el,
      { "--settle": 0 },
      {
        "--settle": 1,
        ease: "none",
        scrollTrigger: {
          trigger: el,
          start: "top 95%",
          end: "top 45%",
          scrub: true,
        },
      },
    );
  });
}
