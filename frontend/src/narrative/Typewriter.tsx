import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { narration, prefersReducedMotion } from "../motion/config";

// Lines already typed once show in full when revisited.
const typed = new Set<string>();

interface Props {
  id: string; // identity of this line, for "already typed"
  text: string;
  skip: boolean; // complete the line now
  onDone: () => void;
}

// Reveals text at narration.charsPerSecond. The full line is laid out from
// the start (the untyped part is invisible), so nothing reflows as it types.
// Screen readers get the whole line at once.
export function Typewriter({ id, text, skip, onDone }: Props) {
  const [instant] = useState(() => typed.has(id) || prefersReducedMotion());
  const [count, setCount] = useState(0);
  const shown = instant || skip ? text.length : count;
  const doneRef = useRef(onDone);
  useLayoutEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (instant || skip) {
      typed.add(id);
      doneRef.current();
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const n = Math.min(
        text.length,
        Math.floor(((now - t0) / 1000) * narration.charsPerSecond),
      );
      setCount(n);
      if (n < text.length) raf = requestAnimationFrame(tick);
      else {
        typed.add(id);
        doneRef.current();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [id, text, skip, instant]);

  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.slice(0, shown)}
        <span className="typewriter__rest">{text.slice(shown)}</span>
      </span>
    </>
  );
}
