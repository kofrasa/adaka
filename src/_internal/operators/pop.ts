import { ArrayOrObject, Callback, RawArray, RawObject } from "mingo/types";
import { walk } from "mingo/util";

import { UpdateOptions } from "../types";

/** Removes the first or last element of an array. */
export const $pop = (
  obj: RawObject,
  expr: Record<string, 1 | -1>,
  options: UpdateOptions
) => {
  for (const [selector, pos] of Object.entries(expr)) {
    walk(obj, selector, ((o: ArrayOrObject, k: string) => {
      const arr = o[k] as RawArray;
      if (arr.length) {
        if (pos === -1) {
          o[k] = arr.slice(1);
        } else {
          arr.pop();
        }
        options.emit(selector);
      }
    }) as Callback);
  }
};
