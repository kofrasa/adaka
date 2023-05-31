import { RawObject } from "mingo/types";
import { has } from "mingo/util";

import { UpdateOptions } from "../types";
import { applyUpdate, walkExpression } from "../util";

/** Deletes a particular field */
export const $unset = (
  obj: RawObject,
  expr: Record<string, "">,
  arrayFilters: RawObject[],
  options: UpdateOptions
) => {
  walkExpression(expr, arrayFilters, (_, node, queries) => {
    let changed = false;
    applyUpdate(obj, node, queries, (o: RawObject, k: string) => {
      if (has(o, k)) {
        delete o[k];
        changed = true;
      }
    });
    if (changed) options.emit(node.parent);
  });
};
