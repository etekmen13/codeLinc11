// these responses get an automatic "go to urgent care!"

export const acute_symptoms = [
  {
    id: "severe_pain",
    prompt: "Severe tooth pain tat over-the-counter painkillers do not control",
  },

  { id: "swelling", prompt: "Swelling in your face, jaw, or gums" },
  { id: "fever", prompt: "A fever along with toohth or mouth pain" },
] as const;

export type AcuteSymptomID = (typeof acute_symptoms)[number]["id"];
