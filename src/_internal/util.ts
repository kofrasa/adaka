import { Query } from "mingo/query";
import {
  AnyVal,
  ArrayOrObject,
  Callback,
  RawArray,
  RawObject
} from "mingo/types";
import { assert, getType, isArray, isObject, resolve, walk } from "mingo/util";

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

const FILTER_IDENT_RE = /^[a-z]+[a-zA-Z0-9]*$/;

export type PathNode = {
  parent: string;
  child?: string;
  next?: PathNode;
};
/**
 * Tokening a selector path to extract parts for the root, arrayFilter, and child
 * @param path The path to tokenize
 * @returns {parent:string,elem:string,child:string}
 */
export function tokenizePath(path: string): [PathNode, string[]] {
  if (!path.includes(".$")) {
    return [{ parent: path }, []];
  }
  const begin = path.indexOf(".$");
  const end = path.indexOf("]");
  const parent = path.substring(0, begin);
  // using "$" wildcard to represent every element.
  const child = path.substring(begin + 3, end);
  assert(
    child === "" || FILTER_IDENT_RE.test(child),
    "Array filter <identifier> must begin with a lowercase letter and contain only alphanumeric characters."
  );
  const rest = path.substring(end + 2);
  const [next, elems] = rest ? tokenizePath(rest) : [];
  return [
    { parent, child: child || "$", next },
    [child, ...(elems || [])].filter(Boolean)
  ];
}

/**
 * Applies an update function to a value to product a new value to modify an object in-place.
 * @param o The object or array to modify.
 * @param n The path node of the update selector.
 * @param q Map of positional identifiers to queries for filtering.
 * @param f The update function which accepts containver value and key.
 */
export const applyUpdate = (
  o: ArrayOrObject,
  n: PathNode,
  q: Record<string, Query>,
  f: Callback<void>,
  opts?: RawObject
) => {
  const { parent, child: c, next } = n;
  if (!c) {
    walk(o, parent, f, opts);
    return;
  }
  const t = resolve(o, parent) as RawArray;
  // do nothing if we don't get correct type.
  if (!isArray(t)) return;
  // apply update to matching items.
  t.forEach((e, i) => {
    // filter if applicable.
    const b = !q[c] || q[c].test({ [c]: e });
    if (!b) return;
    // apply update.
    if (next) {
      applyUpdate(e as ArrayOrObject, next, q, f);
    } else {
      f(t, i);
    }
  });
};

export type Action<T = AnyVal> = (
  val: T,
  pathNode: PathNode,
  queries: Record<string, Query>
) => void;

export function walkExpression<T>(
  expr: RawObject,
  arrayFilter: RawObject[],
  callback: Action<T>
) {
  for (const [selector, val] of Object.entries(expr)) {
    const [node, vars] = tokenizePath(selector);
    if (!vars.length) {
      callback(val as T, node, {});
    } else {
      // extract conditions for each identifier
      const conditions: Record<string, RawObject> = {};
      arrayFilter.forEach(o => {
        Object.keys(o).forEach(k => {
          vars.forEach(w => {
            if (k === w || k.startsWith(w + ".")) {
              conditions[w] = conditions[w] || {};
              Object.assign(conditions[w], { [k]: o[k] });
            }
          });
        });
      });
      // create queries for each identifier
      const queries: Record<string, Query> = {};
      const options = { useStrictMode: false };
      for (const [k, condition] of Object.entries(conditions)) {
        queries[k] = new Query(condition, options);
      }

      callback(val as T, node, queries);
    }
  }
}
