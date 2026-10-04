// Every word the user reads, in one file. Edit freely.
//
// Beats are what the narrator says, one per screen. {curlyBraces} are filled
// from app state. Options that come from data (plans, procedures, quiz
// answers) are not listed here, but their reactions are.
//
// Tone: plain verbs, short sentences, warm, never judgmental. Describe the
// situation, never the person. Inform; don't prescribe ("you should",
// "recommended", "treat by" are out).

export type Expression =
  "neutral" | "happy" | "concerned" | "thinking" | "smile";

export interface Reaction {
  expression: Expression;
  line: string;
}

export interface BeatOption {
  label: string;
  value: string;
  small?: boolean; // a secondary option, set smaller
  reaction?: Reaction;
}

export interface Beat {
  id: string;
  expression: Expression;
  line: string;
  options?: BeatOption[];
  next?: string;
}

const demoReaction: Reaction = {
  expression: "neutral",
  line: "Okay. I'll use the demo plan's numbers.",
};
const coverageReviewOptions: BeatOption[] = [
  {
    label: "Use these",
    value: "confirm",
    reaction: { expression: "happy", line: "Got it. I'll use your numbers." },
  },
  { label: "Upload another", value: "upload", small: true },
  {
    label: "Use the demo plan",
    value: "demo",
    small: true,
    reaction: demoReaction,
  },
];

const beatList: Beat[] = [
  // Opening
  {
    id: "intro",
    expression: "neutral",
    line: "Hi. I'll help you figure out what your dental plan covers, what you'll owe, and when to schedule care so your benefits go further. It takes about three minutes.",
    options: [{ label: "Let's start", value: "start" }],
  },

  // Acute check
  {
    id: "acute",
    expression: "concerned",
    line: "First, a quick safety check. Do you have severe tooth pain, swelling in your face or jaw, or a fever right now?",
    options: [
      { label: "Yes", value: "yes" },
      {
        label: "No",
        value: "no",
        reaction: {
          expression: "happy",
          line: "Good. Then we have time to plan this properly.",
        },
      },
    ],
  },
  {
    id: "acute_takeover",
    expression: "concerned",
    line: "Those can be signs of an infection that needs care today. Please call a dentist now, or go to urgent care if you can't reach one. You can plan costs afterward.",
    options: [
      { label: "Show nearby dentists", value: "nearby" },
      { label: "Start over", value: "restart" },
    ],
  },

  // Intake
  {
    id: "insurer",
    expression: "neutral",
    line: "Who's your dental insurer?",
    // Options: the sample plans.
  },
  // Benefits summary: optional; the PDF's numbers replace the demo plan's.
  {
    id: "coverage",
    expression: "neutral",
    line: "Do you have your plan's benefits summary as a PDF? I can read the main numbers from it.",
    options: [
      { label: "Upload a PDF", value: "upload" },
      { label: "Use the demo plan", value: "demo", reaction: demoReaction },
    ],
  },
  {
    id: "coverage_review",
    expression: "happy",
    line: "Here's what I found. Click any number to change it.",
    options: coverageReviewOptions,
  },
  {
    // Nothing usable in the file (a product overview, a scan, conflicts).
    id: "coverage_none",
    expression: "concerned",
    line: "I couldn't find your plan's numbers in that file, so these are the demo plan's. Click any number to change it.",
    options: coverageReviewOptions,
  },
  {
    id: "coverage_error",
    expression: "concerned",
    line: "I couldn't read that PDF. {problem}",
    options: [
      { label: "Try another PDF", value: "upload" },
      { label: "Use the demo plan", value: "demo", reaction: demoReaction },
    ],
  },
  {
    id: "subscriber",
    expression: "neutral",
    line: "And your subscriber ID? It's on your insurance card, and it's optional.",
    options: [
      { label: "Continue", value: "continue" },
      { label: "Skip", value: "skip", small: true },
    ],
  },
  {
    id: "procedure",
    expression: "neutral",
    line: "What's going on with your teeth? If a dentist already recommended something, pick that.",
    // Options: the procedure catalog, then "describe" below.
  },

  // Summary (the sentence itself is on the plaque, in ui.recap)
  {
    id: "recap",
    expression: "neutral",
    line: "Here's what I have. Click any underlined part to change it.",
    options: [{ label: "Next", value: "continue" }],
  },

  // Tooth (Phase 1 placeholder uses tooth_done)
  {
    id: "tooth_intro",
    expression: "smile",
    line: "Show me roughly where it is. Tap a tooth.",
  },
  {
    id: "tooth_selected",
    expression: "neutral",
    line: "Here's how a problem like this usually progresses. Tap through the stages.",
  },
  {
    id: "tooth_done",
    expression: "neutral",
    line: "From what you've told me, you're probably around {currentStateLabel}. Let's see where it could go from here.",
    options: [{ label: "Show me", value: "continue" }],
  },

  // Simulation
  {
    id: "sim_intro",
    expression: "thinking",
    line: "I'm going to play out the next {months} months {futures} times, using your answers. Each line is one possible future for that tooth.",
    // No options: once the line is typed, the stage darkens and the futures
    // play. sim_played follows on the same stop.
  },
  {
    // On the maroon stage, after the playback.
    id: "sim_played",
    expression: "thinking",
    line: "The brighter a path, the more futures took it.",
    options: [
      { label: "Next", value: "continue" },
      { label: "Replay", value: "replay", small: true },
    ],
  },
  {
    id: "sim_summary",
    expression: "neutral", // concerned unless the risk stays low; see below
    line: "In most of those futures, it stays low risk through {lowRiskUntilDate}. By {horizonDate}, the chance it has reached {nextStateLabel} or worse is {riskPct}%.",
    options: [{ label: "Find a dentist", value: "continue" }],
  },
  {
    // When the tooth is already at the last stage and can't get worse.
    id: "sim_summary_terminal",
    expression: "neutral",
    line: "This is already the last stage, so it can't get worse in these futures. What changes over time is the cost.",
    options: [{ label: "Find a dentist", value: "continue" }],
  },

  // Closing
  {
    id: "closing_reminder",
    expression: "happy",
    line: "One more thing. You have {unusedBenefits} in benefits that expire on {expiryDate}. A cleaning before then is usually covered at {preventivePct}%.",
  },
  {
    // When this year's maximum is already used up, nothing expires.
    id: "closing_reset",
    expression: "happy",
    line: "One more thing. Your maximum for this year is used up, and a fresh {annualMaximum} starts on {resetDate}. A cleaning after that is usually covered at {preventivePct}%.",
  },
  {
    id: "closing_end",
    expression: "happy",
    line: "That's your plan. If anything changes, run it again.",
    options: [{ label: "Start over", value: "restart" }],
  },
];

export const beats: Record<string, Beat> = Object.fromEntries(
  beatList.map((b) => [b.id, b]),
);

// sim_summary's expression: neutral if risk at the horizon is in the lowest
// band, otherwise this.
export const simSummaryRiskyExpression: Expression = "concerned";

// Reactions to data-driven options.
export const reactions = {
  insurer: {
    expression: "happy",
    line: "Got it. I've loaded the {planName}.",
  } as Reaction,
  procedure: {
    expression: "neutral",
    line: "Okay. A few quick questions so I can estimate how this might progress.",
  } as Reaction,
  // Quiz: one is picked per question, cycling through the list.
  quiz: {
    lowers: [
      { expression: "happy", line: "That helps." },
      { expression: "happy", line: "Good, that works in your favor." },
    ] as Reaction[],
    raises: [
      {
        expression: "concerned",
        line: "Noted. That's common, and it's useful to know.",
      },
      {
        expression: "concerned",
        line: "Okay. That raises the odds a bit, and I'll account for it.",
      },
    ] as Reaction[],
    neutral: [{ expression: "neutral", line: "Got it." }] as Reaction[],
  },
};

// Lines that appear while something loads or fails. Shown in the narration.
export const status = {
  loadingForm: "One moment while I load the plans.",
  formError:
    "I couldn't reach the plan data. Check that the backend is running, then reload.",
  loadingQuiz: "One moment while I pull up the questions.",
  quizError: "I couldn't load the questions. Check the backend, then reload.",
  thinking: "Working through your plan…",
  checking: "Checking your details…",
  readingPdf: "Reading your benefits summary…",
  recapError: "Something in these details didn't check out.",
  simulationError: "The simulation didn't run. {problems}",
};

// Procedure beat: the free-text path (uses /api/cdt/map).
export const describe = {
  option: "Describe it in my own words",
  placeholder: "e.g. my dentist said I need a crown on a back tooth",
  help: "Tell us what your dentist recommended, which tooth, and any material or treatment code you know. If you only have symptoms, say that. Ctrl/⌘ + Enter checks your description.",
  examples: [
    "My dentist recommended a porcelain crown on a back tooth",
    "My dentist said root canal, but I do not know which tooth",
    "My tooth hurts and I have not seen a dentist yet",
  ],
  confirm:
    "Choose a match only if it agrees with your dentist's treatment plan.",
  check: "Find a treatment match",
  checking: "Checking…",
  back: "Pick from the list",
  clarifySubmit: "Answer",
  matched: "That sounds like {procedure}.",
  pickOne: "Which of these is closest?",
  noMatch:
    "I couldn't match that to something I can price. Try other words, or pick from the list.",
  unsupported:
    "That's a real treatment, but I don't have prices for it. Pick from the list instead.",
  tooManyQuestions:
    "I need more detail than I can get here. Your dentist's treatment plan will name it.",
  keywordNote:
    "AI matching is unavailable right now. This result uses a limited keyword search.",
  error: "The lookup failed. Try again in a moment.",
};

// Short noun phrases for the summary sentence. Falls back to the catalog name.
export const procedurePhrases: Record<string, string> = {
  D1110: "a cleaning",
  D1206: "fluoride varnish",
  D2391: "a filling",
  D3330: "a root canal",
  D2740: "a crown",
  D7140: "an extraction",
  D6010: "an implant post",
  D6065: "an implant crown",
};

export const stateLabels: Record<string, string> = {
  healthy: "healthy",
  early_lesion: "an early lesion",
  cavity: "a cavity",
  root_canal: "the root canal stage",
  extraction: "the extraction stage",
};

// Everything else on the page.
export const ui = {
  sections: {
    opening: "Start",
    safety: "Safety check",
    intake: "Your plan",
    quiz: "Questions",
    summary: "Summary",
    tooth: "The tooth",
    simulation: "Possible futures",
    providers: "Dentists",
    careplan: "Care plan",
    closing: "Before it resets",
  },
  opening: {
    headline:
      "Your dental plan has more in it than you think. Let's use it before it resets.",
    scrollCue: "Scroll",
    demo: "Fill in demo answers",
  },
  quizCounter: "{n} of {total}",
  subscriber: {
    label: "Subscriber ID",
    placeholder: "e.g. {example}",
  },
  coverage: {
    // Each {value} becomes an editable number.
    sentence:
      "My plan pays up to {annual_maximum} a year, after a {deductible} deductible. It covers preventive care at {preventive}, basic work at {basic} and major work at {major}.",
    names: {
      annual_maximum: "Annual maximum",
      deductible: "Deductible",
      preventive: "Preventive coverage",
      basic: "Basic coverage",
      major: "Major coverage",
    } as Record<string, string>,
    fromPdf: "From page {page}: “{evidence}”",
    fromDemo: "Not in the PDF, so this is the demo plan's.",
    conflicting:
      "The PDF has more than one value for this, so this is the demo plan's.",
    edited: "Changed by you.",
    rest: "Waiting periods, frequency limits, fees and claims history are still the demo plan's.",
  },
  recap: {
    // {plan}, {procedure} and {quiz} become editable words.
    sentence:
      "I'm covered by {plan}, and my dentist recommended {procedure}. I answered {quiz}. This plan year, my plan has paid {used}, and I've met {deductibleMet} of my deductible.",
    usedName: "Paid by your plan this plan year",
    usedNote:
      "What your insurer has paid toward this year's maximum, not the dentist's total charges.",
    deductibleMetName: "Deductible met this plan year",
    quizCount: "{n} questions",
    retry: "Try again",
  },
  simulation: {
    replay: "Replay",
    atHorizon: "Chance it's worse than today by {date}",
    tableCaption: "Chance of each condition, by date",
    date: "Date",
    stateNames: {
      healthy: "Healthy",
      early_lesion: "Early lesion",
      cavity: "Cavity",
      root_canal: "Root canal",
      extraction: "Extraction",
    } as Record<string, string>,
    lowRiskBand: "Low risk until {date}",
    loading: "Running the futures…",
  },
  providers: {
    // {radius}, {procedure}, {tolerance} and {credentials} are editable.
    filters:
      "Within {radius}, for {procedure}, keeping the chance it gets worse {tolerance}, with {credentials}.",
    radius: "{n} miles",
    anyCredentials: "any credentials",
    inNetwork: "In network",
    inNetworkNote: "Agreed to your plan's prices",
    outOfNetwork: "Out of network",
    outOfNetworkNote: "Can bill you the difference",
    fsa: "Use my FSA",
    fsaBalance: "{amount} balance",
    youPay: "you'd pay",
    miles: "{n} mi",
    cash: "cash price",
    // Shown on hover or focus, one short phrase each.
    billed: "Billed {amount}",
    planPays: "plan pays {amount}",
    waived: "{amount} waived at your plan's price",
    cashWaived: "{amount} off for cash",
    balanceBill: "{amount} of it is a balance bill",
    onDate: "on {date}",
    none: "None within this distance.",
    loading: "Pricing dentists…",
    error: "Couldn't price dentists. {problems}",
    retry: "Try again",
    choose: "Choose",
    legend: {
      plan: "Plan pays",
      you: "Your share",
      gap: "Balance bill",
      waived: "Waived",
    },
    fromFsa: "{amount} of it from your FSA",
    allFsa: "all from your FSA",
  },
  careplan: {
    title: "When to have {procedure} at {provider}",
    resets: "Your plan year resets {date}.",
    timingLabels: {
      now: "Now",
      after_reset: "After the reset",
      lowest: "Lowest cost",
    } as Record<string, string>,
    timings: {
      now: "now",
      after_reset: "after the reset",
      lowest: "at the lowest cost",
    } as Record<string, string>,
    timingGroup: "When to have it",
    // Under each timing's label: its date, then what pays for it.
    timingDate: "{date} · {source}",
    cashSource: "cash price",
    saves: "{amount} less than now",
    costsMore: "{amount} more than now",
    sameCost: "same as now",
    worseFirst: "{pct}% chance it gets worse first",
    billCaption: "How the {fee} bill splits, {timing}",
    lineByLine: "Line by line",
    timingSaves:
      "Your plan year resets on {resetDate}. This timing uses {yearPhrase} and saves you {savings} compared with now. By then, there's a {riskPct}% chance this gets worse first.",
    timingCosts:
      "Your plan year resets on {resetDate}. This timing uses {yearPhrase} and costs {savings} more than now. By then, there's a {riskPct}% chance this gets worse first.",
    timingNow:
      "Your plan year resets on {resetDate}. Having it now uses this year's remaining maximum, and the tooth has the least time to change.",
    thisYear: "this year's maximum",
    nextYear: "next year's maximum",
    waterfall: {
      fee: "Dentist's fee",
      discount: "Network discount",
      balance: "Balance bill",
      deductible: "Deductible",
      yourShare: "Your share",
      planShare: "Plan share",
      overMax: "Above the annual maximum",
      owed: "You owe",
      cash: "Cash price",
      cashDiscount: "Self-pay discount",
      denied: "Not covered yet",
    },
    explainCost: "In plain words",
    explainTerm: "In plain words",
    explaining: "Explaining…",
    details: "Details",
    hideDetails: "Hide details",
    detailHeads: {
      options: "Every date I priced",
      levers: "Where the savings come from",
      riskier: "Cheaper, with more risk",
      fsa: "FSA",
      maximum: "Annual maximum by plan year",
      assumptions: "Assumptions",
    },
    optionRow: "{date} · {path} · {cost} · {risk}% worse first",
    outcomeRow: "{pct}% · {state} · {procedures} · you pay {youPay}",
    noTreatment: "nothing needed",
    riskier:
      "{date}, paying {path}: about {cost}, {extra} less, with a {risk}% chance it gets worse first. That's outside your tolerance.",
    fsaLine:
      "Balance {balance}, spend by {deadline}. Unused {unused}, forfeited {forfeited}.",
    fsaElection: "Next year's election that minimizes expected cost: {amount}.",
    maximumLine:
      "{start} to {reset}: used {used}, scheduled {scheduled}, left {remaining}.",
    lever: "{name}: {amount}",
    loading: "Building your care plan…",
    error: "Couldn't build the care plan. {problems}",
    retry: "Try again",
    disclaimer:
      "Estimates from sample plans and placeholder progression rates. Fees, benefits and timing need confirming with your dentist and insurer.",
  },
  terms: {
    term_deductible:
      "Your deductible is what you pay yourself each year before the plan starts sharing costs. You've met {deductibleMet} of {deductible}.",
    term_coinsurance:
      "For {category} work, your plan pays {coveragePct}% after the deductible. You pay the rest.",
    term_annual_max:
      "This is the most your plan will pay this plan year. Anything above it is yours. You have {remainingMax} left until {resetDate}.",
    term_network_discount:
      "In network, this dentist has agreed to your plan's price of {allowedAmount}, so {discount} of the {fee} fee is waived.",
    term_balance_billing:
      "Out of network, your plan only recognizes {allowedAmount} for this procedure. This dentist charges {fee}, so the {gap} difference is yours.",
    term_waiting_period:
      "Your plan doesn't cover {category} work until you've been enrolled for {waitingMonths} months. You're eligible on {eligibleDate}.",
    term_frequency_limit:
      "Your plan covers this {frequencyLimit}. Your next covered one is after {nextEligibleDate}.",
    term_cash:
      "Paying the dentist's cash price skips insurance, so it doesn't use your deductible or maximum.",
    frequency: "{count} time(s) every {months} months",
  } as Record<string, string>,
  // Keys sent to /api/care-plan/terms/explain for each margin note.
  termApiNames: {
    term_deductible: "deductible",
    term_coinsurance: "coinsurance",
    term_annual_max: "annual maximum",
    term_network_discount:
      "In network, this dentist has agreed to your plan's price of {allowedAmount}, so {discount} of the {fee} fee is waived.",
    term_balance_billing: "balance billing",
    term_waiting_period: "waiting period",
    term_frequency_limit: "frequency limit",
  } as Record<string, string>,
  paths: { insured: "through insurance", cash: "cash" } as Record<
    string,
    string
  >,
  meter: {
    label: "Annual maximum",
    used: "Used {amount}",
    scheduled: "Scheduled {amount}",
    remaining: "Left {amount} of {max}",
  },
  closing: {
    expires: "expires {date}",
    resets: "available again {date}",
    fsa: "{amount} of FSA money is forfeited after {date}.",
  },
  takeover: {
    safety:
      "If swelling makes it hard to breathe or swallow, or is spreading toward your eye or neck, go to an emergency room or call 911.",
    nearbyHeading: "Closest dentists",
    nearbyError: "Couldn't load dentists. Call your dentist's office directly.",
    miles: "{n} mi",
  },
  rail: "Sections",
  skip: "Click to skip",
};
