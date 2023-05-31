import { ArrayOrObject, RawObject } from "mingo/types";

import { UpdateOptions } from "../types";
import { applyUpdate, walkExpression } from "../util";

/** Sets the value of a field to the current date. */
export const $currentDate = (
  obj: RawObject,
  expr: Record<string, true>,
  arrayFilters: RawObject[],
  options: UpdateOptions
) => {
  const now = Date.now();
  walkExpression(expr, arrayFilters, (_, node, queries) => {
    let changed = false;
    applyUpdate(
      obj,
      node,
      queries,
      (o: ArrayOrObject, k: string | number) => {
        o[k] = now;
        changed = true;
      },
      { buildGraph: true }
    );
    if (changed) options.emit(node.parent);
  });
};
