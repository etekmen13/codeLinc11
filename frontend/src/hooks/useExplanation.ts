import { useEffect, useState } from "react";
export function useExplanation(path: string, body: string | null) {
  const [state, setState] = useState({ text: "", loading: false, error: "" });
  useEffect(() => {
    if (!body) {
      setState({ text: "", loading: false, error: "" });
      return;
    }
    const controller = new AbortController();
    setState({ text: "", loading: true, error: "" });
    void (async () => {
      try {
        const response = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(`Explanation unavailable (HTTP ${response.status}).`);
        const data: unknown = await response.json();
        if (
          !data ||
          typeof data !== "object" ||
          !("explanation" in data) ||
          typeof data.explanation !== "string"
        )
          throw new Error("Invalid explanation response.");
        if (!controller.signal.aborted)
          setState({ text: data.explanation, loading: false, error: "" });
      } catch (error) {
        if (!controller.signal.aborted)
          setState({
            text: "",
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "Explanation unavailable.",
          });
      }
    })();
    return () => controller.abort();
  }, [path, body]);
  return state;
}
