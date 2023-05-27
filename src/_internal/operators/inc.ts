import { ArrayOrObject, Callback, RawObject } from "mingo/types";
import { walk } from "mingo/util";

import { UpdateOptions } from "../types";

/** Increments a field by a specified value. */
export const $inc = (
  obj: RawObject,
  expr: Record<string, number>,
  options: UpdateOptions
) => {
  for (const [selector, val] of Object.entries(expr)) {
    let changed = false;
    walk(obj, selector, ((o: ArrayOrObject, k: string) => {
      o[k] = (o[k] as number) + val;
      changed = true;
    }) as Callback);
    if (changed) options.emit(selector);
  }
};
