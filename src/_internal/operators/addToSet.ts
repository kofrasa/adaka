import { ArrayOrObject, Callback, RawArray, RawObject } from "mingo/types";
import {
  cloneDeep,
  has,
  intersection,
  isObject,
  unique,
  walk
} from "mingo/util";

import { UpdateOptions } from "../types";

/** Adds a value to an array unless the value is already present. */
export const $addToSet = (
  obj: RawObject,
  expr: RawObject,
  options: UpdateOptions
) => {
  for (const [selector, val] of Object.entries(expr)) {
    const args = { $each: [val] };
    if (isObject(val) && has(val as RawObject, "$each")) {
      Object.assign(args, val);
    }
    walk(obj, selector, ((o: ArrayOrObject, k: string | number) => {
      const prev = o[k] as RawArray;
      const common = intersection([prev, args.$each]);
      if (common.length !== args.$each.length) {
        o[k] = cloneDeep(unique(prev.concat(args.$each)));
        options.emit(selector);
      }
    }) as Callback);
  }
};
