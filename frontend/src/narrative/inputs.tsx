// Inline inputs that some beats use in place of plain options.

import { useEffect, useRef, useState } from "react";
import { map_treatment, problems_of } from "../api";
import { normalize_subscriber_id } from "../onboarding/subscriber_id";
import { samplePlan, SUBSCRIBER_MAX } from "../state/selectors";
import { useStore } from "../state/store";
import type { CdtMapping, Procedure } from "../types";
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
// /api/cdt/map with up to three clarifying questions.
export function ProcedureInput({ stop }: { stop: Stop }) {
  const procedures = useStore((s) => s.form.data?.procedures) ?? NO_PROCEDURES;
  const [mode, setMode] = useState<"list" | "describe">("list");
  const [text, setText] = useState("");
  const [reply, setReply] = useState("");
  const [history, setHistory] = useState<string[]>([]);
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

  async function check(clarify: boolean) {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const added =
      clarify && mapping?.clarification_question
        ? [
            ...history,
            `Question: ${mapping.clarification_question} Answer: ${reply.trim()}`,
          ]
        : [];
    setLoading(true);
    setError("");
    try {
      const result = await map_treatment(
        [text.trim(), ...added].join("\n"),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setMapping(result);
      setHistory(added);
      setReply("");
    } catch (err) {
      if (!controller.signal.aborted)
        setError(problems_of(err).join(" ") || describe.error);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
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
      {!clarifying && (
        <>
          <label className="sr-only" htmlFor="treatment">
            {describe.option}
          </label>
          <input
            id="treatment"
            className="inline-input inline-input--wide"
            value={text}
            maxLength={2000}
            placeholder={describe.placeholder}
            disabled={loading}
            onChange={(e) => {
              setText(e.target.value);
              setMapping(null);
              setHistory([]);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && text.trim().length >= 5)
                void check(false);
            }}
          />
        </>
      )}
      {clarifying && (
        <>
          <label className="narration__sub" htmlFor="clarify">
            {mapping.clarification_question}
          </label>
          {history.length < 3 ? (
            <input
              id="clarify"
              className="inline-input inline-input--wide"
              value={reply}
              maxLength={300}
              disabled={loading}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && reply.trim()) void check(true);
              }}
            />
          ) : (
            <p className="narration__hint">{describe.tooManyQuestions}</p>
          )}
        </>
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
          (o.value === "__check" && (loading || text.trim().length < 5)) ||
          (o.value === "__clarify" &&
            (loading || !reply.trim() || history.length >= 3))
        }
        onPick={(o) => {
          if (o.value === "__check") void check(false);
          else if (o.value === "__clarify") void check(true);
          else if (o.value === "__list") setMode("list");
          else answer(stop, o);
        }}
      />
    </div>
  );
}
