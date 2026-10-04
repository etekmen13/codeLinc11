// The scroll engine: Lenis smooth scrolling wired to GSAP ScrollTrigger, plus
// the small API sections use (current stop and section, progress within a
// section, scroll-to, and the soft wall at an unanswered beat).

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  duration,
  easeFn,
  gate as gateConfig,
  prefersReducedMotion,
} from "../motion/config";
import type { SectionId } from "../narrative/flow";

type ProgressListener = (progress: number) => void;

export interface ScrollApi {
  registerStop: (id: string, el: HTMLElement | null) => void;
  registerSection: (id: SectionId, el: HTMLElement | null) => void;
  scrollToStop: (id: string, immediate?: boolean) => void;
  scrollToSection: (id: SectionId) => void;
  scrollToTop: () => void;
  // Progress through a section, 0 at its top reaching the viewport top, 1
  // when its bottom reaches the viewport bottom.
  onProgress: (id: SectionId, listener: ProgressListener) => () => void;
}

const ScrollContext = createContext<ScrollApi | null>(null);

export function useScroll(): ScrollApi {
  const api = useContext(ScrollContext);
  if (!api) throw new Error("useScroll needs a ScrollProvider");
  return api;
}

interface Props {
  gateId: string | null; // first unanswered stop; null when nothing blocks
  layoutKey: string; // changes whenever stops are added or removed
  onStopChange: (id: string) => void;
  children: ReactNode;
}

export function ScrollProvider({
  gateId,
  layoutKey,
  onStopChange,
  children,
}: Props) {
  const lenisRef = useRef<Lenis | null>(null);
  const stops = useRef(new Map<string, HTMLElement>());
  const sections = useRef(new Map<SectionId, HTMLElement>());
  const listeners = useRef(new Map<SectionId, Set<ProgressListener>>());
  const gateRef = useRef(gateId);
  const currentRef = useRef<string | null>(null);
  const onStopChangeRef = useRef(onStopChange);
  useLayoutEffect(() => {
    gateRef.current = gateId;
    onStopChangeRef.current = onStopChange;
  }, [gateId, onStopChange]);

  const docTop = (el: HTMLElement) =>
    el.getBoundingClientRect().top + window.scrollY;

  // Lenis and ScrollTrigger, integrated in this one place.
  useEffect(() => {
    const reduce = prefersReducedMotion();
    const lenis = new Lenis({ smoothWheel: !reduce, autoRaf: false });
    lenisRef.current = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    const raf = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    let springTimer = 0;
    let springing = false;

    const spring = (to: number) => {
      springing = true;
      lenis.scrollTo(to, {
        duration: gateConfig.springDuration,
        easing: easeFn,
        lock: true,
        immediate: reduce,
        force: true,
        onComplete: () => (springing = false),
      });
    };

    const onScroll = () => {
      const y = window.scrollY;
      const vh = window.innerHeight;

      // Current stop: the one under the middle of the viewport.
      const mid = y + vh / 2;
      let current: string | null = null;
      for (const [id, el] of stops.current) {
        const top = docTop(el);
        if (mid >= top && mid < top + el.offsetHeight) {
          current = id;
          break;
        }
      }
      if (current && current !== currentRef.current) {
        currentRef.current = current;
        onStopChangeRef.current(current);
      }

      // Section progress.
      for (const [id, set] of listeners.current) {
        const el = sections.current.get(id);
        if (!el || set.size === 0) continue;
        const span = Math.max(1, el.offsetHeight - vh);
        const p = Math.min(1, Math.max(0, (y - docTop(el)) / span));
        set.forEach((fn) => fn(p));
      }

      // Soft wall: past the bottom of the unanswered stop, spring back.
      const gateEl = gateRef.current
        ? stops.current.get(gateRef.current)
        : null;
      if (!gateEl || springing) return;
      const limit = docTop(gateEl) + gateEl.offsetHeight - vh;
      window.clearTimeout(springTimer);
      if (y > limit + gateConfig.hardLimitVh * vh) spring(limit);
      else if (y > limit + 2)
        springTimer = window.setTimeout(
          () => spring(limit),
          gateConfig.springDelayMs,
        );
    };
    lenis.on("scroll", onScroll);
    window.addEventListener("resize", onScroll);
    onScroll();

    return () => {
      window.clearTimeout(springTimer);
      window.removeEventListener("resize", onScroll);
      gsap.ticker.remove(raf);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  // Stops were added or removed: re-measure everything.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      lenisRef.current?.resize();
      ScrollTrigger.refresh();
    });
    return () => cancelAnimationFrame(id);
  }, [layoutKey]);

  const scrollTo = useCallback(
    (target: number | HTMLElement, immediate = false) => {
      const lenis = lenisRef.current;
      if (!lenis) return;
      lenis.resize();
      lenis.scrollTo(target, {
        duration: duration.scrollTo,
        easing: easeFn,
        immediate: immediate || prefersReducedMotion(),
        force: true,
      });
    },
    [],
  );

  const api = useMemo<ScrollApi>(
    () => ({
      registerStop: (id, el) => {
        if (el) stops.current.set(id, el);
        else stops.current.delete(id);
      },
      registerSection: (id, el) => {
        if (el) sections.current.set(id, el);
        else sections.current.delete(id);
      },
      scrollToStop: (id, immediate) => {
        const el = stops.current.get(id);
        if (el) scrollTo(el, immediate);
      },
      scrollToSection: (id) => {
        const el = sections.current.get(id);
        if (el) scrollTo(el);
      },
      scrollToTop: () => scrollTo(0, true),
      onProgress: (id, listener) => {
        const set = listeners.current.get(id) ?? new Set();
        set.add(listener);
        listeners.current.set(id, set);
        return () => set.delete(listener);
      },
    }),
    [scrollTo],
  );

  return (
    <ScrollContext.Provider value={api}>{children}</ScrollContext.Provider>
  );
}
