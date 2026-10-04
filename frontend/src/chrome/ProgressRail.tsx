import { SECTION_ORDER, type SectionId, type Stop } from "../narrative/flow";
import { ui } from "../narrative/script";
import { useScroll } from "../scroll/ScrollProvider";
import { useStore } from "../state/store";

// A thin line on the right edge with one tick per section. The current tick
// is filled; ticks for sections not yet reached are inert.
export function ProgressRail({ stops }: { stops: Stop[] }) {
  const { scrollToSection } = useScroll();
  const currentId = useStore((s) => s.currentStopId);
  const current = stops.find((s) => s.id === currentId)?.section;
  const reached = new Set<SectionId>(stops.map((s) => s.section));
  return (
    <nav className="rail" aria-label={ui.rail}>
      <ol>
        {SECTION_ORDER.map((id) => (
          <li key={id}>
            <button
              type="button"
              className="rail__tick"
              aria-current={id === current ? "step" : undefined}
              disabled={!reached.has(id)}
              onClick={() => scrollToSection(id)}
            >
              <span className="rail__label">{ui.sections[id]}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
