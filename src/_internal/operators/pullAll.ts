import { RawArray, RawObject } from "mingo/types";

import { UpdateOptions } from "../types";
import { $pull } from "./pull";

/** Removes all instances of the specified values from an existing array. */
export const $pullAll = (
  obj: RawObject,
  expr: Record<string, RawArray>,
  arrayFilters: RawObject[],
  options: UpdateOptions
) => {
  const pullExpr: Record<string, RawObject> = {};
  Object.entries(expr).forEach(([k, v]) => {
    pullExpr[k] = { $in: v };
  });
  $pull(obj, pullExpr, arrayFilters, options);
};
