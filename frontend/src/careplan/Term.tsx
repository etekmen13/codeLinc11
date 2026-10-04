import { useState, type ReactNode } from "react";
import { displayText } from "../lib/displayText";
import { useExplanation } from "../hooks/useExplanation";
import { ui } from "../narrative/script";

interface Props {
  children: ReactNode; // the term as it reads in place
  note: string; // filled margin note
  // Body for /api/care-plan/terms/explain; omit to offer no AI explanation.
  explainBody?: unknown;
}

// An insurance term with its plain-language note. The note shows on hover
// or focus, next to the number it explains; "In plain words" asks the
// explanation service for more.
export function Term({ children, note, explainBody }: Props) {
  const [asked, setAsked] = useState(false);
  const explanation = useExplanation(
    "/api/care-plan/terms/explain",
    asked && explainBody ? JSON.stringify(explainBody) : null,
  );
  return (
    <span className="term">
      <button type="button" className="term__word">
        {children}
      </button>
      <span className="term__note margin-note" role="note">
        {note}
        {explainBody !== undefined && !asked && (
          <>
            {" "}
            <button
              type="button"
              className="text-link"
              onClick={() => setAsked(true)}
            >
              {ui.careplan.explainTerm}
            </button>
          </>
        )}
        {explanation.loading && (
          <span className="term__more">{ui.careplan.explaining}</span>
        )}
        {explanation.text && (
          <span className="term__more">{displayText(explanation.text)}</span>
        )}
        {explanation.error && (
          <span className="term__more">{displayText(explanation.error)}</span>
        )}
      </span>
    </span>
  );
}
