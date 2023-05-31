import { ArrayOrObject, RawObject } from "mingo/types";
import { compare } from "mingo/util";

import { UpdateOptions } from "../types";
import { Action, applyUpdate, walkExpression } from "../util";

/** Updates the value of the field to a specified value if the specified value is greater than the current value of the field. */
export const $max = (
  obj: RawObject,
  expr: RawObject,
  arrayFilters: RawObject[],
  options: UpdateOptions
) => {
  walkExpression(expr, arrayFilters, ((val, node, queries) => {
    let changed = false;
    applyUpdate(obj, node, queries, (o: ArrayOrObject, k: string | number) => {
      if (compare(o[k], val) < 0) {
        o[k] = val;
        changed = true;
      }
    });
    if (changed) options.emit(node.parent);
  }) as Action<number | string>);
};
