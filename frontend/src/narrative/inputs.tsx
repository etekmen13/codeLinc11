// Inline inputs that some beats use in place of plain options.

import { useEffect, useRef, useState } from "react";
import { map_treatment, problems_of } from "../api";
import { normalize_subscriber_id } from "../onboarding/subscriber_id";
import { samplePlan, SUBSCRIBER_MAX } from "../state/selectors";
import { useStore } from "../state/store";
import type { CdtMapping, ClarificationTurn, Procedure } from "../types";
import { answer } from "./answer";
import type { OptionView, Stop } from "./flow";
import { Options } from "./Options";
import { describe, reactions, ui } from "./script";
import { fill } from "./template";

const NO_PROCEDURES: Procedure[] = [];

// Subscriber ID: an editable word, committed with Continue. Edits stay local
// until then, so a half-typed ID doesn't reset everything downstream.
export function SubscriberInput({ stop }: { stop: Stop }) {
  const saved = useStore((s) => s.answers.subscriberId);
  return <SubscriberField key={saved} stop={stop} saved={saved} />;
}

function SubscriberField({ stop, saved }: { stop: Stop; saved: string }) {
  const sample = useStore(samplePlan);
  const [draft, setDraft] = useState(saved);
  if (!sample) return null;
  const filled = draft.trim() !== "";
  const commit = (option: OptionView) => {
    useStore.getState().setAnswers({
      subscriberId:
        option.value === "skip" ? "" : normalize_subscriber_id(draft),
    });
    answer(stop, option);
  };
  return (
    <div className="narration__field">
      <label className="sr-only" htmlFor="subscriber-id">
        {ui.subscriber.label}
      </label>
      <input
        id="subscriber-id"
        className="inline-input narration__input"
        value={draft}
        maxLength={SUBSCRIBER_MAX}
        placeholder={fill(ui.subscriber.placeholder, {
          example: sample.plan.subscriber_id_example,
        })}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && filled) commit(stop.beat!.options[0]);
        }}
      />
      <Options
        options={stop.beat!.options}
        onPick={commit}
        disabled={(o) => o.value !== "skip" && !filled}
        keys={false}
      />
    </div>
  );
}

// Procedure: catalog options, or the user's own words matched by
// /api/cdt/map with structured clarification history.
export function ProcedureInput({ stop }: { stop: Stop }) {
  const procedures = useStore((s) => s.form.data?.procedures) ?? NO_PROCEDURES;
  const [mode, setMode] = useState<"list" | "describe">("list");
  const [text, setText] = useState("");
  const [reply, setReply] = useState("");
  const [history, setHistory] = useState<ClarificationTurn[]>([]);
  const [mapping, setMapping] = useState<CdtMapping | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const beat = stop.beat!;

  const toOption = (code: string): OptionView | null => {
    const p = procedures.find((x) => x.cdt_code === code);
    return p
      ? { label: p.name, value: p.cdt_code, reaction: reactions.procedure }
      : null;
  };

  function resetLookup() {
    abort.current?.abort();
    setLoading(false);
    setMapping(null);
    setHistory([]);
    setReply("");
    setError("");
  }

  async function check(clarify: boolean) {
    if (
      loading ||
      text.trim().length < 5 ||
      (clarify && (!reply.trim() || history.length >= 5))
    )
      return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const added =
      clarify && mapping?.clarification_question
        ? [
            ...history,
            { question: mapping.clarification_question, answer: reply.trim() },
          ]
        : [];
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 45000);
    setLoading(true);
    setError("");
    try {
      const result = await map_treatment(text.trim(), controller.signal, added);
      if (controller.signal.aborted) return;
      setMapping(result);
      setHistory(added);
      setReply("");
    } catch (err) {
      if (timedOut)
        setError(
          "That took too long. Retry, edit your description, or choose a treatment from the list.",
        );
      else if (!controller.signal.aborted)
        setError(problems_of(err).join(" ") || describe.error);
    } finally {
      window.clearTimeout(timer);
      if (abort.current === controller) setLoading(false);
    }
  }

  if (mode === "list")
    return (
      <Options
        options={[
          ...beat.options,
          { label: describe.option, value: "__describe" },
        ]}
        selected={beat.selected}
        onPick={(o) =>
          o.value === "__describe" ? setMode("describe") : answer(stop, o)
        }
      />
    );

  const supported = (mapping?.candidate_codes ?? [])
    .map((c) => toOption(c.code))
    .filter((o): o is OptionView => o !== null);

  let message = "";
  let choices: OptionView[] = [];
  if (mapping?.status === "no_match") message = describe.noMatch;
  else if (mapping?.status === "candidate" && supported.length === 0)
    message = describe.unsupported;
  else if (mapping?.status === "candidate" && supported.length === 1) {
    message = fill(describe.matched, { procedure: supported[0].label });
    choices = supported;
  } else if (mapping?.status === "candidate") {
    message = describe.pickOne;
    choices = supported;
  }
  const clarifying = mapping?.status === "needs_clarification";

  return (
    <div className="narration__field" aria-live="polite">
      <>
        <label className="sr-only" htmlFor="treatment">
          {describe.option}
        </label>
        <textarea
          rows={3}
          id="treatment"
          className="inline-input inline-input--wide"
          value={text}
          maxLength={2000}
          placeholder={describe.placeholder}
          disabled={loading}
          onChange={(e) => {
            setText(e.target.value);
            resetLookup();
          }}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              (e.ctrlKey || e.metaKey) &&
              text.trim().length >= 5
            ) {
              e.preventDefault();
              void check(false);
            }
          }}
        />
        <p className="narration__hint">{describe.help}</p>
        {!mapping && (
          <div className="treatment-examples" aria-label="Example descriptions">
            {describe.examples.map((example) => (
              <button
                key={example}
                type="button"
                disabled={loading}
                onClick={() => {
                  resetLookup();
                  setText(example);
                }}
              >
                {example}
              </button>
            ))}
          </div>
        )}
      </>
      {clarifying && (
        <>
          <label className="narration__sub" htmlFor="clarify">
            {mapping.clarification_question}
          </label>
          {history.length < 5 ? (
            <input
              id="clarify"
              className="inline-input inline-input--wide"
              value={reply}
              maxLength={300}
              disabled={loading}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && reply.trim() && !loading)
                  void check(true);
              }}
            />
          ) : (
            <p className="narration__hint">{describe.tooManyQuestions}</p>
          )}
        </>
      )}
      {history.length > 0 && (
        <details className="narration__hint">
          <summary>Details you provided</summary>
          {history.map((turn, i) => (
            <p key={i}>
              {turn.question}
              <br />
              {turn.answer}
            </p>
          ))}
        </details>
      )}
      {mapping?.status === "candidate" && (
        <div className="narration__hint">
          {mapping.candidate_codes.map((c) => (
            <p key={c.code}>
              {procedures.find((p) => p.cdt_code === c.code)?.name ?? c.code}:{" "}
              {c.reason}
            </p>
          ))}
          <p>{describe.confirm}</p>
        </div>
      )}
      {message && <p className="narration__sub">{message}</p>}
      {error && (
        <p className="narration__hint" role="alert">
          {error}
        </p>
      )}
      {mapping?.matched_by === "keywords" && (
        <p className="narration__hint">{describe.keywordNote}</p>
      )}
      <Options
        options={[
          ...choices,
          clarifying
            ? {
                label: loading ? describe.checking : describe.clarifySubmit,
                value: "__clarify",
              }
            : {
                label: loading ? describe.checking : describe.check,
                value: "__check",
              },
          { label: describe.back, value: "__list" },
        ]}
        keys={false}
        disabled={(o) =>
          (loading && o.value !== "__list") ||
          (o.value === "__check" && (loading || text.trim().length < 5)) ||
          (o.value === "__clarify" &&
            (loading || !reply.trim() || history.length >= 5))
        }
        onPick={(o) => {
          if (o.value === "__check") void check(false);
          else if (o.value === "__clarify") void check(true);
          else if (o.value === "__list") {
            resetLookup();
            setMode("list");
          } else answer(stop, o);
        }}
      />
    </div>
  );
}
