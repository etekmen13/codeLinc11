// App state in one store: the user's answers, what the backend sent back,
// and where the narration is. Fetching lives in useDataSync; the order of
// beats is derived from this state in narrative/flow.ts.

import { create } from "zustand";
import type {
  CoverageExtraction,
  CoverageInput,
  FormOptions,
  MemberInput,
} from "../api";
import type { Reaction } from "../narrative/script";
import type { StagePhase } from "../simulation/playbackConfig";
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
  // The plan's numbers from an uploaded benefits summary, confirmed by the
  // reader; null uses the sample plan's. Cleared when the plan changes.
  coverage: CoverageInput | null;
  coverageDone: boolean;
  subscriberId: string;
  subscriberConfirmed: boolean;
  procedureCode: string | null;
  quiz: QuizAnswers;
  // Balances edited on the summary; null uses the sample member's.
  member: MemberInput | null;
  recapDone: boolean;
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
  coverage: null,
  coverageDone: false,
  subscriberId: "",
  subscriberConfirmed: false,
  procedureCode: null,
  quiz: {},
  member: null,
  recapDone: false,
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
  coverage: null,
  coverageDone: true,
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
  member: null,
  recapDone: false,
  toothDone: false,
  simIntroDone: false,
  simSummaryDone: false,
};

// A benefits summary being read. draft holds the numbers shown for review:
// the sample plan's, with whatever the PDF yielded on top.
export interface CoverageUpload {
  status: "idle" | "reading" | "review" | "error";
  result: CoverageExtraction | null;
  draft: CoverageInput | null;
  edited: string[]; // numbers the reader changed on the plaque
  error: string | null;
}

export const NO_UPLOAD: CoverageUpload = {
  status: "idle",
  result: null,
  draft: null,
  edited: [],
  error: null,
};

export interface AppState {
  answers: Answers;
  form: Remote<FormOptions>;
  questions: Remote<QuizQuestion[]>; // key: procedure code
  onboarding: Remote<OnboardingResult>;
  simulation: Remote<ToothSimulation>;
  comparison: Remote<Comparison>;
  carePlan: Remote<CarePlan>;
  coverageUpload: CoverageUpload;

  radius: number;
  tolerance: string; // a risk band name
  credential: string | null; // null = any
  // Count the member's FSA when pricing dentists and the care plan. Off
  // plans as if there were no FSA.
  useFsa: boolean;
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
  // The maroon simulation stage: idle (white page), dark (ground fading to
  // maroon), playing, done (Next and Replay on offer).
  simStage: StagePhase;
  // "stopId:beatId" of the last narrator line fully typed out.
  lineDone: string | null;

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
  coverageUpload: NO_UPLOAD,
  radius: 25,
  tolerance: "low",
  credential: null,
  useFsa: true,
  providerId: null,
  timingId: null,
  reaction: null,
  advanceFrom: null,
  scrollTarget: null,
  currentStopId: "intro",
  retry: 0,
  simReplay: 0,
  simStage: "idle",
  lineDone: null,

  setAnswers: (patch) => set((s) => ({ answers: { ...s.answers, ...patch } })),
  patch: (patch) => set(patch),
  restart: () =>
    set({
      answers: EMPTY_ANSWERS,
      coverageUpload: NO_UPLOAD,
      providerId: null,
      timingId: null,
      credential: null,
      useFsa: true,
      reaction: null,
      advanceFrom: null,
      simStage: "idle",
      scrollTarget: "intro",
    }),
}));
