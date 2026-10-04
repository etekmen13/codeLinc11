// Where the narrator stands and which face he wears, from the current stop.
// Pure: the rules are in lincoln/config.ts and the expressions in
// narrative/script.ts.

import type { Stop } from "../narrative/flow";
import type { Expression, Reaction } from "../narrative/script";
import {
  contentExpression,
  sectionPresence,
  stagePresence,
  type Presence,
} from "./config";

export interface LincolnView {
  presence: Presence;
  expression: Expression;
}

export function lincolnView(
  stop: Stop | undefined,
  reaction: { stopId: string; reaction: Reaction } | null,
  loading: boolean,
  staged: boolean, // the maroon simulation stage is up
): LincolnView {
  if (!stop) return { presence: "full", expression: contentExpression.idle };
  const expression =
    reaction?.stopId === stop.id
      ? reaction.reaction.expression
      : (stop.beat?.expression ??
        (loading ? contentExpression.loading : contentExpression.idle));
  return {
    presence: staged ? stagePresence : sectionPresence[stop.section],
    expression,
  };
}
