import type { QuizQuestion } from "../types";

// Shown first. Any "yes" ends onboarding and sends the user to urgent care.
export const acuteSymptoms = [
  {
    id: "severe_pain",
    prompt: "Severe tooth pain that over-the-counter painkillers do not control",
  },
  { id: "swelling", prompt: "Swelling in your face, jaw, or gums" },
  { id: "fever", prompt: "A fever along with tooth or mouth pain" },
] as const;

export type AcuteSymptomId = (typeof acuteSymptoms)[number]["id"];

// Risk quiz. Factors are placeholders, chosen so the direction of each answer
// is plausible. They are not clinically calibrated.
export const riskQuestions: QuizQuestion[] = [
  {
    id: "sugar",
    prompt: "How often do you have sugary snacks or drinks between meals?",
    options: [
      { id: "rarely", label: "Rarely", factor: 0.8 },
      { id: "daily", label: "Once or twice a day", factor: 1.0 },
      { id: "often", label: "Three or more times a day", factor: 1.5 },
    ],
  },
  {
    id: "brushing",
    prompt: "How often do you brush with fluoride toothpaste?",
    options: [
      { id: "twice", label: "Twice a day or more", factor: 0.85 },
      { id: "once", label: "Once a day", factor: 1.0 },
      { id: "less", label: "Less than once a day", factor: 1.4 },
    ],
  },
  {
    id: "dry_mouth",
    prompt: "Does your mouth often feel dry?",
    options: [
      { id: "no", label: "No", factor: 1.0 },
      { id: "sometimes", label: "Sometimes", factor: 1.15 },
      { id: "often", label: "Often", factor: 1.4 },
    ],
  },
  {
    id: "recent_cavities",
    prompt: "How many cavities have you had filled in the last 3 years?",
    options: [
      { id: "none", label: "None", factor: 0.8 },
      { id: "one", label: "One", factor: 1.1 },
      { id: "two_plus", label: "Two or more", factor: 1.5 },
    ],
  },
  {
    id: "last_cleaning",
    prompt: "When was your last dental cleaning?",
    options: [
      { id: "under_6mo", label: "Within 6 months", factor: 0.9 },
      { id: "6_12mo", label: "6 to 12 months ago", factor: 1.0 },
      { id: "over_1yr", label: "More than a year ago", factor: 1.25 },
    ],
  },
  {
    // Lingering pain after cold suggests the nerve is involved.
    id: "cold_sensitivity",
    prompt: "Does the tooth hurt with cold or sweets?",
    applies_to: ["cavity", "root_canal"],
    options: [
      { id: "no", label: "No", factor: 0.9 },
      { id: "brief", label: "Briefly, then it stops", factor: 1.1 },
      { id: "lingers", label: "Yes, and the pain lingers", factor: 1.6 },
    ],
  },
  {
    id: "biting_pain",
    prompt: "Does the tooth hurt when you bite down?",
    applies_to: ["cavity", "root_canal"],
    options: [
      { id: "no", label: "No", factor: 1.0 },
      { id: "yes", label: "Yes", factor: 1.3 },
    ],
  },
];
