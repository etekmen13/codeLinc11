// Where the narrator stands and which face he wears, from the current stop.
// Pure: the rules are in lincoln/config.ts and the expressions in
// narrative/script.ts.

import type { Stop } from "../narrative/flow";
import type { Expression, Reaction } from "../narrative/script";
import {
  contentExpression,
  sectionPresence,
  stopPresence,
  type Presence,
} from "./config";

export interface LincolnView {
  presence: Presence;
  expression: Expression;
  holdMs?: number; // stay at full size this long before taking `presence`
}

export function lincolnView(
  stop: Stop | undefined,
  reaction: { stopId: string; reaction: Reaction } | null,
  loading: boolean,
): LincolnView {
  if (!stop) return { presence: "full", expression: contentExpression.idle };
  const expression =
    reaction?.stopId === stop.id
      ? reaction.reaction.expression
      : (stop.beat?.expression ??
        (loading ? contentExpression.loading : contentExpression.idle));
  const section = sectionPresence[stop.section];
  const override = stopPresence[stop.id];
  // Loading and error lines are delivered in person.
  if (!override || stop.beat?.status) return { presence: section, expression };
  return { presence: override.presence, expression, holdMs: override.holdMs };
}
