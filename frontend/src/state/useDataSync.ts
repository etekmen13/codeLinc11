// Keeps backend data in step with the answers. Each request is tagged with
// a key; answers to keys that are no longer current are dropped.

import { useEffect } from "react";
import {
  fetch_care_comparison,
  fetch_care_plan,
  fetch_form,
  fetch_providers,
  fetch_quiz,
  fetch_simulation,
  problems_of,
  submit_onboarding,
  type OnboardingRequest,
} from "../api";
import { carePlanKey, comparisonKey, fresh, requestKey } from "./selectors";
import { useStore, type AppState, type Remote } from "./store";

type Slot =
  | "form"
  | "questions"
  | "onboarding"
  | "simulation"
  | "comparison"
  | "carePlan";

// Runs `run` whenever `key` changes (or on retry). Keeps the previous data
// while the new request is in flight, so screens don't blank out.
function useRemote<T>(
  slot: Slot,
  key: string | null,
  run: () => Promise<T>,
  onData?: (data: T) => void,
) {
  const retry = useStore((s) => s.retry);
  useEffect(() => {
    if (key === null) return;
    let live = true;
    const prev = useStore.getState()[slot] as Remote<T>;
    useStore.setState({
      [slot]: { key, data: prev.data, loading: true, problems: null },
    } as Partial<AppState>);
    run()
      .then((data) => {
        if (!live) return;
        useStore.setState({
          [slot]: { key, data, loading: false, problems: null },
        } as Partial<AppState>);
        onData?.(data);
      })
      .catch((err: unknown) => {
        if (!live) return;
        useStore.setState({
          [slot]: {
            key,
            data: null,
            loading: false,
            problems: problems_of(err),
          },
        } as Partial<AppState>);
      });
    return () => {
      live = false;
    };
    // run and onData are rebuilt each render; key and retry are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry]);
}

export function useDataSync() {
  const procedureCode = useStore((s) => s.answers.procedureCode);
  const key = useStore(requestKey);
  const onboardingOk = useStore((s) => fresh(s.onboarding, key) !== null);
  const radius = useStore((s) => s.radius);
  const tolerance = useStore((s) => s.tolerance);
  const providerId = useStore((s) => s.providerId);
  const compareKey = useStore(comparisonKey);
  const planKey = useStore(carePlanKey);
  const body = (): OnboardingRequest => JSON.parse(key!) as OnboardingRequest;

  useRemote("form", "form", fetch_form);

  // A new procedure can ask different questions. Answers to questions it
  // still asks are kept.
  useRemote(
    "questions",
    procedureCode,
    () => fetch_quiz(procedureCode!),
    (qs) => {
      const { answers, setAnswers } = useStore.getState();
      const kept = Object.fromEntries(
        Object.entries(answers.quiz).filter(([qid, oid]) =>
          qs.some((q) => q.id === qid && q.options.some((o) => o.id === oid)),
        ),
      );
      setAnswers({ quiz: kept });
    },
  );

  useRemote("onboarding", key, () => submit_onboarding(body()));

  const planned = onboardingOk ? key : null;
  useRemote("simulation", planned, () => fetch_simulation(body()));

  useRemote("comparison", planned && compareKey, async () => {
    const base = body();
    const [comparison, prices] = await Promise.all([
      fetch_care_comparison({
        ...base,
        radius_miles: radius,
        risk_tolerance: tolerance,
      }),
      fetch_providers({ ...base, radius_miles: radius }),
    ]);
    return {
      comparison,
      quotes: [...prices.in_network, ...prices.out_of_network],
    };
  });

  useRemote("carePlan", planned && planKey, () =>
    fetch_care_plan({
      ...body(),
      provider_id: providerId!,
      risk_tolerance: tolerance,
    }),
  );
}
