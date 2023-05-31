import { ArrayOrObject, RawArray, RawObject } from "mingo/types";

import { UpdateOptions } from "../types";
import { Action, applyUpdate, walkExpression } from "../util";

/** Removes the first or last element of an array. */
export const $pop = (
  obj: RawObject,
  expr: Record<string, 1 | -1>,
  arrayFilters: RawObject[],
  options: UpdateOptions
) => {
  walkExpression(expr, arrayFilters, ((val, node, queries) => {
    let changed = false;
    applyUpdate(obj, node, queries, (o: ArrayOrObject, k: string) => {
      const arr = o[k] as RawArray;
      if (arr.length) {
        if (val === -1) {
          arr.splice(0, 1);
        } else {
          arr.pop();
        }
        changed = true;
      }
    });
    if (changed) options.emit(node.parent);
  }) as Action<number>);
};
