import { AnyVal, ArrayOrObject, RawArray, RawObject } from "mingo/types";
import {
  cloneDeep,
  compare,
  has,
  isEqual,
  isNumber,
  isObject,
  resolve
} from "mingo/util";

import { UpdateOptions } from "../types";
import { Action, applyUpdate, walkExpression } from "../util";

const OPERATOR_MODIFIERS = Object.freeze([
  "$each",
  "$slice",
  "$sort",
  "$position"
]);

/** Appends a specified value to an array. */
export const $push = (
  obj: RawObject,
  expr: RawObject,
  arrayFilters: RawObject[],
  options: UpdateOptions
) => {
  walkExpression(expr, arrayFilters, ((val, node, queries) => {
    const args: {
      $each: RawArray;
      $slice?: number;
      $sort?: Record<string, 1 | -1> | 1 | -1;
      $position?: number;
    } = {
      $each: [val]
    };

    if (
      isObject(val) &&
      OPERATOR_MODIFIERS.some(m => has(val as RawObject, m))
    ) {
      Object.assign(args, val);
    }

    let changed = false;

    applyUpdate(
      obj,
      node,
      queries,
      (o: ArrayOrObject, k: string) => {
        const arr = o[k] as RawArray;
        // take a copy of sufficient length.
        const prev = arr.slice(0, args.$slice || arr.length);
        const oldsize = arr.length;
        const pos = isNumber(args.$position) ? args.$position : arr.length;

        // insert new items
        arr.splice(pos, 0, ...(cloneDeep(args.$each) as RawArray));

        if (args.$sort) {
          const sortKey = isObject(args.$sort)
            ? Object.keys(args.$sort).pop()!
            : "";
          const order: number =
            sortKey === "" ? args.$sort : args.$sort[sortKey];
          const f =
            sortKey === ""
              ? (a: AnyVal) => a
              : (a: AnyVal) => resolve(a as RawObject, sortKey);
          arr.sort((a, b) => order * compare(f(a), f(b)));
        }

        // handle slicing
        if (isNumber(args.$slice)) {
          if (args.$slice < 0) arr.splice(0, arr.length + args.$slice);
          else arr.splice(args.$slice);
        }

        // detect change
        if (oldsize != arr.length || !isEqual(prev, arr)) changed = true;
      },
      { descendArray: true }
    );
    if (changed) options.emit(node.parent);
  }) as Action<number>);
};
