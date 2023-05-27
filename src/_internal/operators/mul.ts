import { ArrayOrObject, Callback, RawObject } from "mingo/types";
import { isNil, walk } from "mingo/util";

import { UpdateOptions } from "../types";

/** Multiply the value of a field by a number. */
export const $mul = (
  obj: RawObject,
  expr: Record<string, number>,
  options: UpdateOptions
) => {
  for (const [selector, val] of Object.entries(expr)) {
    walk(obj, selector, ((o: ArrayOrObject, k: string | number) => {
      const prev = o[k] as number;
      o[k] = isNil(prev) ? 0 : o[k] * val;
      if (o[k] !== prev) {
        options.emit(selector);
      }
    }) as Callback);
  }
};
