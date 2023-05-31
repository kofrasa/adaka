import { AnyVal, ArrayOrObject, Callback, RawObject } from "mingo/types";
import { cloneDeep, isEqual } from "mingo/util";

import { UpdateOptions } from "../types";
import { applyUpdate, walkExpression } from "../util";

/** Replaces the value of a field with the specified value. */
export const $set = (
  obj: RawObject,
  expr: Record<string, AnyVal>,
  arrayFilters: RawObject[],
  options: UpdateOptions
) => {
  walkExpression(expr, arrayFilters, (val, node, queries) => {
    let changed = false;
    applyUpdate(
      obj,
      node,
      queries,
      ((o: ArrayOrObject, k: string) => {
        if (!isEqual(o[k], val)) {
          o[k] = cloneDeep(val);
          changed = true;
        }
      }) as Callback,
      { buildGraph: true }
    );
    if (changed) options.emit(node.parent);
  });
};
