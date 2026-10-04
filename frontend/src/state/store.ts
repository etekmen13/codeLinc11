// App state in one store: the user's answers, what the backend sent back,
// and where the narration is. Fetching lives in useDataSync; the order of
// beats is derived from this state in narrative/flow.ts.

import { create } from "zustand";
import type { FormOptions } from "../api";
import type { Reaction } from "../narrative/script";
import type {
  CareComparison,
  CarePlan,
  OnboardingResult,
  ProviderCard,
  QuizAnswers,
  QuizQuestion,
  ToothSimulation,
} from "../types";

export interface Answers {
  started: boolean;
  acute: "yes" | "no" | null;
  planId: string | null;
  subscriberId: string;
  subscriberConfirmed: boolean;
  procedureCode: string | null;
  quiz: QuizAnswers;
  toothDone: boolean;
  simIntroDone: boolean;
  simSummaryDone: boolean;
}

// One backend response, tagged with the request it answers so stale ones
// can be told apart.
export interface Remote<T> {
  key: string | null;
  data: T | null;
  loading: boolean;
  problems: string[] | null;
}

export const idle = <T>(): Remote<T> => ({
  key: null,
  data: null,
  loading: false,
  problems: null,
});

export interface Comparison {
  comparison: CareComparison;
  quotes: ProviderCard[]; // today's insured quotes, both networks
}

export const EMPTY_ANSWERS: Answers = {
  started: false,
  acute: null,
  planId: null,
  subscriberId: "",
  subscriberConfirmed: false,
  procedureCode: null,
  quiz: {},
  toothDone: false,
  simIntroDone: false,
  simSummaryDone: false,
};

// Root canal on the nearly exhausted Keystone plan, which shows the
// before/after-reset comparison best. Ids must match the backend.
export const DEMO_ANSWERS: Answers = {
  started: true,
  acute: "no",
  planId: "keystone-ppo",
  subscriberId: "K417-2290-08",
  subscriberConfirmed: true,
  procedureCode: "D3330",
  quiz: {
    sugar: "daily",
    brushing: "once",
    dry_mouth: "no",
    recent_cavities: "one",
    last_cleaning: "over_1yr",
    cold_sensitivity: "lingers",
    biting_pain: "no",
  },
  toothDone: false,
  simIntroDone: false,
  simSummaryDone: false,
};

export interface AppState {
  answers: Answers;
  form: Remote<FormOptions>;
  questions: Remote<QuizQuestion[]>; // key: procedure code
  onboarding: Remote<OnboardingResult>;
  simulation: Remote<ToothSimulation>;
  comparison: Remote<Comparison>;
  carePlan: Remote<CarePlan>;

  radius: number;
  tolerance: string; // a risk band name
  credential: string | null; // null = any
  providerId: string | null;
  timingId: string | null; // chosen timing plan; null = lowest cost

  // A reaction line shown after an answer. It stays until the narration
  // reaches the next stop, so the question never flashes back in between.
  // skipped: the reader clicked through it; move on now.
  reaction: { stopId: string; reaction: Reaction; skipped?: boolean } | null;
  // After an answer: scroll to the stop after this one once it renders.
  advanceFrom: string | null;
  // Scroll to this stop as soon as it exists (demo fill, deep jumps).
  scrollTarget: string | null;
  currentStopId: string;
  retry: number; // bump to resend every request
  simReplay: number; // bump to replay the futures animation

  setAnswers: (patch: Partial<Answers>) => void;
  patch: (patch: Partial<AppState>) => void;
  restart: () => void;
}

export const useStore = create<AppState>()((set) => ({
  answers: EMPTY_ANSWERS,
  form: idle(),
  questions: idle(),
  onboarding: idle(),
  simulation: idle(),
  comparison: idle(),
  carePlan: idle(),
  radius: 25,
  tolerance: "low",
  credential: null,
  providerId: null,
  timingId: null,
  reaction: null,
  advanceFrom: null,
  scrollTarget: null,
  currentStopId: "intro",
  retry: 0,
  simReplay: 0,

  setAnswers: (patch) => set((s) => ({ answers: { ...s.answers, ...patch } })),
  patch: (patch) => set(patch),
  restart: () =>
    set({
      answers: EMPTY_ANSWERS,
      providerId: null,
      timingId: null,
      credential: null,
      reaction: null,
      advanceFrom: null,
      scrollTarget: "intro",
    }),
}));
