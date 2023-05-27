import { Callback, RawObject } from "mingo/types";
import { has, walk } from "mingo/util";

import { UpdateOptions } from "../types";

/** Deletes a particular field */
export const $unset = (
  obj: RawObject,
  expr: Record<string, "">,
  options: UpdateOptions
) => {
  for (const selector of Object.keys(expr)) {
    walk(obj, selector, ((o: RawObject, k: string) => {
      const changed = has(o, k);
      if (changed) {
        delete o[k];
        options.emit(selector);
      }
    }) as Callback);
  }
};
