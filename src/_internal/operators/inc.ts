import { ArrayOrObject, RawObject } from "mingo/types";

import { UpdateOptions } from "../types";
import { Action, applyUpdate, walkExpression } from "../util";

/** Increments a field by a specified value. */
export const $inc = (
  obj: RawObject,
  expr: Record<string, number>,
  arrayFilters: RawObject[],
  options: UpdateOptions
) => {
  walkExpression(expr, arrayFilters, ((val, node, queries) => {
    let changed = false;
    applyUpdate(obj, node, queries, (o: ArrayOrObject, k: number) => {
      o[k] = (o[k] as number) + val;
      changed = true;
    });
    if (changed) options.emit(node.parent);
  }) as Action<number>);
};
