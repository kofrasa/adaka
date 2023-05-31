import { ArrayOrObject, RawObject } from "mingo/types";
import { isNil } from "mingo/util";

import { UpdateOptions } from "../types";
import { Action, applyUpdate, walkExpression } from "../util";

/** Multiply the value of a field by a number. */
export const $mul = (
  obj: RawObject,
  expr: Record<string, number>,
  arrayFilters: RawObject[],
  options: UpdateOptions
) => {
  walkExpression(expr, arrayFilters, ((val, node, queries) => {
    let changed = false;
    applyUpdate(obj, node, queries, (o: ArrayOrObject, k: string | number) => {
      const prev = o[k] as number;
      o[k] = isNil(prev) ? 0 : o[k] * val;
      if (o[k] !== prev) changed = true;
    });
    if (changed) options.emit(node.parent);
  }) as Action<number>);
};
