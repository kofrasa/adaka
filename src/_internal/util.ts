import * as projectionOperators from "mingo/operators/projection";
import * as updateOperators from "mingo/operators/update";
import { AnyVal, ArrayOrObject, RawArray, RawObject } from "mingo/types";
import {
  getType,
  has,
  isArray,
  isNumber,
  isObject,
  isOperator,
  isString,
  resolve
} from "mingo/util";

const KEYED_OPERATORS_MAP: {
  [k: string]: {
    nodes: string[];
  };
} = Object.freeze({
  $cond: {
    nodes: ["if", "then", "else", "0", "1", "2"]
  },
  $switch: {
    nodes: ["branches.case", "branches.then", "default"]
  },
  $filter: { nodes: ["input", "cond", "limit"] },
  $map: { nodes: ["input", "in"] }
});

const peekOperator = (o: AnyVal): string | undefined => {
  const keys = isObject(o) && Object.keys(o);
  return keys && keys.length === 1 && isOperator(keys[0]) && keys[0];
};

// checks that value is not a valid project expression.
const notProjectExpression = (o: AnyVal) =>
  o !== 1 &&
  o !== true &&
  !isObject(o) &&
  !isArray(o) &&
  !(isString(o) && o.startsWith("$"));

export interface GetDependentPathOptions {
  /** Assumes top-level fields are part of the state and includes them.  */
  includeRootFields: boolean;
  /** used internally */
  __parent?: string;
}

/**
 * Extract all dependent paths used in the expressions for project, match and update expressions.
 *
 * @param expr The expression.
 * @param options Options to customize path retrieval.
 */
export function getDependentPaths(
  expr: AnyVal,
  options: GetDependentPathOptions = { includeRootFields: false }
): Set<string> {
  const parent = options.__parent;
  const result = new Set<string>();

  switch (getType(expr)) {
    case "String":
      // exclude variables which all begin with "$$"
      if ((expr as string).startsWith("$$")) {
        return result;
      } else if ((expr as string).startsWith("$")) {
        result.add((expr as string).substring(1));
      } else if (parent && !isOperator(parent)) {
        result.add(parent);
      }
      break;
    case "Array":
      (expr as RawArray)
        .map(v => getDependentPaths(v, options))
        .forEach(s => s.forEach(v => result.add(v)));
      break;
    case "Object":
      for (const [key, val] of Object.entries(expr as RawObject)) {
        // ignore $literal
        if (key === "$literal") continue;
        // handle top-level boolean operators ($and, $or,..) and $expr.
        if (isOperator(key)) {
          let val2 = val;
          // handle operators with keyed arguments.
          // this ensure we process each leaf object correctly and don't treat the leaf itself as a field in our state.
          const opts = KEYED_OPERATORS_MAP[key];
          if (opts && typeof val === "object") {
            val2 = opts.nodes
              .map(s => resolve(val as ArrayOrObject, s))
              .filter(Boolean);
          }

          getDependentPaths(val2, {
            ...options,
            // for update expressions send the key as the parent, since they are always top-level.
            __parent: !parent && has(updateOperators, key) ? key : parent
          }).forEach(v => result.add(v));
        } else {
          // handle update operators first. we pass the operator as the parent since that should always be the top-level field.
          // extracting fields for update expressions is not used yet, but may be leveraged for optimizations latter.
          if (isOperator(parent) && has(updateOperators, parent)) {
            getDependentPaths(val, { ...options, __parent: key }).forEach(v =>
              result.add(v)
            );
            continue;
          }

          if (
            !options.includeRootFields &&
            !parent &&
            notProjectExpression(val)
          ) {
            // skip if not a valid project expression or ignoring root fields.
            continue;
          }

          let ancestor = parent ? parent + "." + key : key;

          // Since this method is written to support both $project and $match expressions we need to specially handle projection operators $elemMatch and $slice.
          // This avoids treating all top-level fields as valid within the state object which would not be true for projections based on expression operators.
          // A user may reuse field names in the state object for their selectors. We want to avoid notifying listeners if the actual dependent state fields have not changed.
          // To find out whether we have a projection operator, we peek into the value object to detect and operator and also check the current field is top-level.
          // If the operator is not a projection and the field is top-level, we don't record it as a valid state field and pass an empty value further down the extractor.
          const op = peekOperator(val);
          const valObj = val as RawObject;
          if (op && !options.includeRootFields) {
            if (
              // expr is not a projection operator and not nested so the top-level field must be a new alias.
              (!parent && !has(projectionOperators, op)) ||
              // $slice has two flavours in MongoDB, so we need to make sure we are looking at the correct one when first condition fails.
              // if nested (i.e parent exists), then we know we are using the $slice from the expression operators.
              (parent && op === "$slice") ||
              // if no parent but op is $slice, we need to check the actual type to determine.
              // validates for $slice as an expression operator.
              (!parent &&
                op === "$slice" &&
                isArray(valObj["$slice"]) &&
                !isNumber(valObj["$slice"][0]))
            ) {
              ancestor = undefined;
            }
          }

          getDependentPaths(val, { ...options, __parent: ancestor }).forEach(
            v => result.add(v)
          );
        }
      }
      break;
    default:
      if (parent) result.add(parent);
      break;
  }
  return result;
}

/**
 * Determines if the selector has a common ancestor with any other in the set.
 * @example
 * Matches: (a.b.c, a) (a.b.c, a.b) (a.b, a.b.c) (a.c, a)
 * Non-matches: (a.b.c, a.c) (aa.b, a.b) (a.c.b.c, a.b.c)
 *
 * @param arr
 * @param path
 * @returns {boolean}
 */
export const sameAncestor = (arr: Array<string>, path: string): boolean => {
  if (new Set(arr).has(path)) return true;
  for (const v of arr) {
    const [s, l] = path.length < v.length ? [path, v] : [v, path];
    if (l.startsWith(s + ".")) return true;
  }
  return false;
};

/** Returns a frozen clone of the value. */
export function cloneFrozen<T>(obj: T): T {
  if (obj instanceof Array) return Object.freeze(obj.map(cloneFrozen)) as T;
  if (obj instanceof Date) return Object.freeze(new Date(obj)) as T;
  if (isObject(obj)) {
    const clone = {} as T;
    for (const [k, v] of Object.entries(obj)) clone[k] = cloneFrozen(v);
    return Object.freeze(clone);
  }
  return Object.freeze(obj);
}
