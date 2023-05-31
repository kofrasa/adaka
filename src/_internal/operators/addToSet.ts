import { ArrayOrObject, RawArray, RawObject } from "mingo/types";
import { cloneDeep, has, intersection, isObject, unique } from "mingo/util";

import { UpdateOptions } from "../types";
import { Action, applyUpdate, walkExpression } from "../util";

/** Adds a value to an array unless the value is already present. */
export const $addToSet = (
  obj: RawObject,
  expr: RawObject,
  arrayFilters: RawObject[],
  options: UpdateOptions
) => {
  walkExpression(expr, arrayFilters, ((val, node, queries) => {
    const args = { $each: [val] };
    if (isObject(val) && has(val as RawObject, "$each")) {
      Object.assign(args, val);
    }
    let changed = false;
    applyUpdate(obj, node, queries, (o: ArrayOrObject, k: string) => {
      const prev = o[k] as RawArray;
      const common = intersection([prev, args.$each]);
      if (common.length !== args.$each.length) {
        o[k] = cloneDeep(unique(prev.concat(args.$each)));
        changed = true;
      }
    });
    if (changed) options.emit(node.parent);
  }) as Action);
};
