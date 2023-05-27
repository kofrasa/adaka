import { AnyVal, ArrayOrObject, RawArray, RawObject } from "mingo/types";
import { getType, isObject, resolve } from "mingo/util";

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

/**
 * Extract all valid field paths used in the expression.
 * @param expr The expression.
 */
export function extractKeyPaths(expr: AnyVal, parent?: string): Set<string> {
  const result = new Set<string>();
  switch (getType(expr)) {
    case "String":
      // exclude variables which all begin with "$$"
      if ((expr as string).startsWith("$$")) return result;
      else if ((expr as string).startsWith("$")) {
        result.add((expr as string).substring(1));
      } else if (parent) {
        result.add(parent);
      }
      break;
    case "Array":
      (expr as RawArray)
        .map(v => extractKeyPaths(v, parent))
        .forEach(s => s.forEach(v => result.add(v)));
      break;
    case "Object":
      for (const [key, val] of Object.entries(expr as RawObject)) {
        // ignore $literal
        if (key === "$literal") continue;
        // handle top-level boolean operators ($and, $or,..) and $expr.
        if (key.startsWith("$")) {
          let val2 = val;
          // handle operators with keyed arguments.
          const opts = KEYED_OPERATORS_MAP[key];
          if (opts && typeof val === "object") {
            val2 = opts.nodes
              .map(s => resolve(val as ArrayOrObject, s))
              .filter(Boolean);
          }
          extractKeyPaths(val2, parent).forEach(v => result.add(v));
        } else {
          const ancestor = parent ? parent + "." + key : key;
          extractKeyPaths(val, ancestor).forEach(v => result.add(v));
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
 * @returns
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
