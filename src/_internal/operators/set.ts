import { AnyVal, ArrayOrObject, Callback, RawObject } from "mingo/types";
import { cloneDeep, isEqual, walk } from "mingo/util";

import { UpdateOptions } from "../types";

/** Replaces the value of a field with the specified value. */
export const $set = (
  obj: RawObject,
  expr: Record<string, AnyVal>,
  options: UpdateOptions
) => {
  for (const [selector, val] of Object.entries(expr)) {
    walk(
      obj,
      selector,
      ((o: ArrayOrObject, k: string | number) => {
        if (!isEqual(o[k], val)) {
          o[k] = cloneDeep(val);
          options.emit(selector);
        }
      }) as Callback,
      { buildGraph: true }
    );
  }
};
