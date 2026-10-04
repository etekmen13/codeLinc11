// One page, scrolled. State decides which stops exist (narrative/flow.ts);
// the scroll engine keeps the reader at or before the first unanswered one.

import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { TrajectoryField } from "./background/TrajectoryField";
import { AnnualMaxMeter } from "./chrome/AnnualMaxMeter";
import { Lincoln } from "./lincoln/Lincoln";
import { ProgressRail } from "./chrome/ProgressRail";
import {
  buildFlow,
  type Flow,
  type SectionId,
  type Stop,
} from "./narrative/flow";
import { NarrationOverlay } from "./narrative/NarrationOverlay";
import { useAdvance } from "./narrative/useAdvance";
import { ScrollProvider, useScroll } from "./scroll/ScrollProvider";
import { AcuteTakeover } from "./sections/AcuteTakeover";
import { CarePlan } from "./sections/CarePlan";
import { Closing } from "./sections/Closing";
import { Coverage } from "./sections/Coverage";
import { Opening } from "./sections/Opening";
import { Providers } from "./sections/Providers";
import { Recap } from "./sections/Recap";
import { SimIntro, SimSummary } from "./sections/Simulation";
import { riskSpread } from "./state/selectors";
import { useStore } from "./state/store";
import { useDataSync } from "./state/useDataSync";

export default function App() {
  useDataSync();
  const state = useStore();
  const flow = useMemo(() => buildFlow(state), [state]);
  const acute = state.answers.acute === "yes";
  const layoutKey = [
    ...flow.stops.map((s) => s.id),
    state.comparison.key,
    state.carePlan.key,
  ].join("|");
  // Leaving a stop ends its reaction.
  const onStopChange = useCallback((id: string) => {
    const { reaction, patch } = useStore.getState();
    patch({
      currentStopId: id,
      reaction: reaction?.stopId === id ? reaction : null,
    });
  }, []);
  return (
    <ScrollProvider
      gateId={acute ? null : flow.gateId}
      layoutKey={layoutKey}
      onStopChange={onStopChange}
    >
      <Page flow={flow} acute={acute} />
    </ScrollProvider>
  );
}

function Page({ flow, acute }: { flow: Flow; acute: boolean }) {
  useAdvance(flow);
  useScrollTarget(flow);
  const spread = useStore(riskSpread);
  const currentId = useStore((s) => s.currentStopId);
  const currentIndex = flow.stops.findIndex((s) => s.id === currentId);

  // Consecutive stops of one section share a <section>.
  const groups: { id: SectionId; stops: Stop[] }[] = [];
  for (const stop of flow.stops) {
    const last = groups[groups.length - 1];
    if (last?.id === stop.section) last.stops.push(stop);
    else groups.push({ id: stop.section, stops: [stop] });
  }

  return (
    <>
      <TrajectoryField spread={spread} />
      <main className="page" aria-hidden={acute || undefined} inert={acute}>
        {groups.map((g) => (
          <SectionView key={g.id} id={g.id}>
            {g.stops.map((stop) => (
              <StopView
                key={stop.id}
                stop={stop}
                reached={flow.stops.indexOf(stop) <= currentIndex}
              />
            ))}
          </SectionView>
        ))}
        {flow.gateId && <div className="runway" aria-hidden="true" />}
      </main>
      {!acute && (
        <>
          <NarrationOverlay stops={flow.stops} hidden={false} />
          <ProgressRail stops={flow.stops} />
          <AnnualMaxMeter />
        </>
      )}
      {acute && <AcuteTakeover />}
      <Lincoln stops={flow.stops} acute={acute} />
    </>
  );
}

function SectionView({ id, children }: { id: SectionId; children: ReactNode }) {
  const { registerSection } = useScroll();
  const ref = useCallback(
    (el: HTMLElement | null) => registerSection(id, el),
    [id, registerSection],
  );
  return (
    <section ref={ref} className={`section section--${id}`} data-section={id}>
      {children}
    </section>
  );
}

function StopView({ stop, reached }: { stop: Stop; reached: boolean }) {
  const { registerStop } = useScroll();
  const ref = useCallback(
    (el: HTMLDivElement | null) => registerStop(stop.id, el),
    [stop.id, registerStop],
  );
  return (
    <div ref={ref} className={`stop stop--${stop.kind}`} data-stop={stop.id}>
      {stop.id === "intro" && <Opening />}
      {stop.kind === "coverage" && <Coverage />}
      {stop.kind === "recap" && <Recap />}
      {stop.kind === "sim_intro" && <SimIntro reached={reached} />}
      {stop.kind === "sim_summary" && <SimSummary />}
      {stop.kind === "providers" && <Providers />}
      {stop.kind === "careplan" && <CarePlan />}
      {stop.kind === "closing" && <Closing />}
    </div>
  );
}

// Scrolls to store.scrollTarget once that stop exists (demo fill, restart).
function useScrollTarget(flow: Flow) {
  const { scrollToStop } = useScroll();
  const target = useStore((s) => s.scrollTarget);
  const present = !!target && flow.stops.some((s) => s.id === target);
  useEffect(() => {
    if (!target || !present) return;
    const id = requestAnimationFrame(() => {
      scrollToStop(target, target === "intro");
      useStore.getState().patch({ scrollTarget: null });
    });
    return () => cancelAnimationFrame(id);
  }, [target, present, scrollToStop]);
}
