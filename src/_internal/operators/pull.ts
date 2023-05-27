import { Query } from "mingo/query";
import {
  AnyVal,
  ArrayOrObject,
  Callback,
  RawArray,
  RawObject
} from "mingo/types";
import { isObject, isOperator, walk } from "mingo/util";

import { UpdateOptions } from "../types";

/** Removes from an existing array all instances of a value or values that match a specified condition. */
export const $pull = (
  obj: RawObject,
  expr: RawObject,
  options: UpdateOptions
) => {
  for (const [selector, val] of Object.entries(expr)) {
    const valExpr = {};
    const condition = {
      k: valExpr
    };

    if (!isObject(val)) {
      Object.assign(valExpr, { $in: [val] });
    } else if (Object.keys(val).some(isOperator)) {
      Object.assign(valExpr, val);
    } else {
      condition.k = val;
    }

    const query = new Query(condition);
    const pred = (v: AnyVal) => query.test({ k: v });

    walk(obj, selector, ((o: ArrayOrObject, k: string) => {
      const prev = o[k] as RawArray;
      const curr = new Array<AnyVal>();
      const changed = prev
        .map(v => {
          const b = pred(v);
          if (!b) curr.push(v);
          return b;
        })
        .some(Boolean);

      if (changed) {
        o[k] = curr;
        options.emit(selector);
      }
    }) as Callback);
  }
};
