import type { Fetched } from "../lib/useApi";

// Loading and error states for a screen's fetch. Renders nothing once the
// data is in.
export function Status<T>({
  fetched,
  what,
}: {
  fetched: Fetched<T>;
  what: string; // e.g. "the dentist comparison"
}) {
  if (fetched.problems) {
    return (
      <div className="notice" role="alert">
        <p>Could not load {what}:</p>
        <ul>
          {fetched.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p>
          If the backend was not running, start it and try again. Otherwise go
          back and check your details.
        </p>
        <button type="button" className="secondary" onClick={fetched.retry}>
          Try again
        </button>
      </div>
    );
  }
  if (fetched.loading) {
    return (
      <p className="muted" role="status">
        Loading {what}…
      </p>
    );
  }
  return null;
}
