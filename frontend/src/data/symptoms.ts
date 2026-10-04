// Acute-symptom check, shown first. Any "yes" ends onboarding and sends the
// user to urgent care. Kept in the frontend so the safety screen works even
// when the backend is down.
export const acute_symptoms = [
  {
    id: "severe_pain",
    prompt: "Severe tooth pain that over-the-counter painkillers do not control",
  },
  { id: "swelling", prompt: "Swelling in your face, jaw, or gums" },
  { id: "fever", prompt: "A fever along with tooth or mouth pain" },
] as const;

export type AcuteSymptomId = (typeof acute_symptoms)[number]["id"];
