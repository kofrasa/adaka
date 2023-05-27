import { ArrayOrObject, Callback, RawObject } from "mingo/types";
import { walk } from "mingo/util";

import { UpdateOptions } from "../types";

/** Sets the value of a field to the current date. */
export const $currentDate = (
  obj: RawObject,
  expr: Record<string, true>,
  options: UpdateOptions
) => {
  const now = Date.now();
  for (const selector of Object.keys(expr)) {
    walk(
      obj,
      selector,
      ((o: ArrayOrObject, k: string) => {
        o[k] = now;
        options.emit(selector);
      }) as Callback,
      { buildGraph: true }
    );
  }
};
