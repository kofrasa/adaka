import {
  AnyVal,
  ArrayOrObject,
  Callback,
  RawArray,
  RawObject
} from "mingo/types";
import {
  cloneDeep,
  compare,
  has,
  isEqual,
  isNumber,
  isObject,
  resolve,
  walk
} from "mingo/util";

import { UpdateOptions } from "../types";

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
  options: UpdateOptions
) => {
  for (const [selector, val] of Object.entries(expr)) {
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

    walk(
      obj,
      selector,
      ((o: ArrayOrObject, k: string) => {
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
        if (oldsize != arr.length || !isEqual(prev, arr)) {
          options.emit(selector);
        }
      }) as Callback,
      { descendArray: true }
    );
  }
};
