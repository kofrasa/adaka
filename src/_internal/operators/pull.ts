import { Query } from "mingo/query";
import { AnyVal, ArrayOrObject, RawArray, RawObject } from "mingo/types";
import { isObject, isOperator } from "mingo/util";

import { UpdateOptions } from "../types";
import { Action, applyUpdate, walkExpression } from "../util";

/** Removes from an existing array all instances of a value or values that match a specified condition. */
export const $pull = (
  obj: RawObject,
  expr: RawObject,
  arrayFilters: RawObject[],
  options: UpdateOptions
) => {
  walkExpression(expr, arrayFilters, ((val, node, queries) => {
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

    let changed = false;

    applyUpdate(obj, node, queries, (o: ArrayOrObject, k: string) => {
      const prev = o[k] as RawArray;
      const curr = new Array<AnyVal>();
      const emit = prev
        .map(v => {
          const b = pred(v);
          if (!b) curr.push(v);
          return b;
        })
        .some(Boolean);
      if (emit) {
        o[k] = curr;
        changed = true;
      }
    });
    if (changed) options.emit(node.parent);
  }) as Action);
};
