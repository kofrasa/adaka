import { ArrayOrObject, Callback, RawObject } from "mingo/types";
import { compare, walk } from "mingo/util";

import { UpdateOptions } from "../types";

/** Updates the value of the field to a specified value if the specified value is greater than the current value of the field. */
export const $max = (
  obj: RawObject,
  expr: RawObject,
  options: UpdateOptions
) => {
  for (const [selector, val] of Object.entries(expr)) {
    walk(obj, selector, ((o: ArrayOrObject, k: string | number) => {
      if (compare(o[k], val) < 0) {
        o[k] = val;
        options.emit(selector);
      }
    }) as Callback);
  }
};
