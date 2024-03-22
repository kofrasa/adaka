import { Query } from "mingo";
import {
  initOptions,
  Options as QueryOptions,
  UpdateOptions
} from "mingo/core";
import { Lazy } from "mingo/lazy";
import { $project } from "mingo/operators/pipeline";
import { AnyVal, Predicate, RawObject } from "mingo/types";
import { createUpdater, UpdateExpression, Updater } from "mingo/updater";
import {
  assert,
  cloneDeep,
  ensureArray,
  isEqual,
  normalize,
  stringify
} from "mingo/util";

import { GetStateFn, Selector } from "./selector";
import {
  cloneFrozen,
  getDependentPaths,
  isProjectExpression,
  sameAncestor
} from "./util";

/** Result from update operation which returns useful details. */
export interface UpdateResult {
  /** Represents whether the state was modified */
  readonly modified: boolean;
  /** The fields in the state object that were modified. */
  readonly fields?: Readonly<string[]>;
  /** The number of listeners notified. */
  readonly notifyCount?: number;
}

const EMPTY_QUERY = new Query({});

/** helper to create query object. */
const mkQuery = (condition: RawObject | Query, options: QueryOptions) => {
  if (condition instanceof Query) return condition;
  return !Object.keys(condition).length
    ? EMPTY_QUERY
    : new Query(condition, options);
};

type Signal = (s: Readonly<string[]>) => boolean;

/**
 * Creates a new store object.
 *
 * @param initialState The initial state object
 * @param updateOptions Options to be used for updates and queries.
 * @returns {Store}
 */
export function createStore<T extends RawObject = RawObject>(
  initialState: T,
  updateOptions?: UpdateOptions
): Store<T> {
  return new Store<T>(initialState, updateOptions);
}

/**
 * A store manages a single object which must be JSON and contain only serializable values.
 * A store maintains its own copy of the original object so external modifications have no effect after initialization.
 * A store provides APIs to update and query views of the internal object using the MongoDB query language.
 * A view can be subscribed to for changes by registering listeners which are notified when their values change.
 */
export class Store<S extends RawObject = RawObject> {
  // internal reference to state object
  private readonly state: S;
  // ordered set of selectors.
  private readonly selectors = new Map<
    string,
    {
      selector: Selector<RawObject>;
      signal: Signal;
    }
  >();
  // query options to pass to MongoDB processing engine.
  private readonly queryOptions: QueryOptions;
  // the updater function
  private readonly mutate: Updater;
  // flag for checking modifications to the entire state.
  private modified = true;
  // previous full state cached for full state retrievals only.
  private prevState: RawObject;

  constructor(initialState: S, options?: UpdateOptions) {
    this.state = cloneDeep(initialState) as S;
    this.queryOptions = initOptions({
      ...options?.queryOptions,
      // use normal JavaScript semantics.
      useStrictMode: false
    });
    this.mutate = createUpdater(options);
  }

  /**
   * Returns the current state as a frozen object subject to the given criteria.s
   * When no options are specified, returns the full state.
   *
   * @param projection An optional projection expression. @default {}
   * @param condition An optional condition expression. @default {}
   * @returns {RawObject|undefined} The current state.
   */
  getState<P extends RawObject & S>(
    projection: Record<keyof P, AnyVal> | RawObject = {},
    condition: RawObject | Query = {}
  ): P | undefined {
    // cache enabled only for full state.
    const cacheEnabled =
      isEqual(projection, {}) &&
      (isEqual(condition, {}) || condition === EMPTY_QUERY);
    // return the previous state
    if (cacheEnabled && !this.modified) return this.prevState as P;
    // project fields and freeze final value if query passes
    const query = mkQuery(condition, this.queryOptions);
    const value = query.test(this.state)
      ? $project(Lazy([this.state]), projection, this.queryOptions)
          .map(cloneFrozen)
          .next().value
      : undefined;

    // cache if the full object
    if (cacheEnabled) {
      this.modified = false;
      this.prevState = value as P;
    }

    return value as P;
  }

  /**
   * Creates a new observable for a view of the state.
   *
   * @param projection Fields of the state to view. Expressed as MongoDB projection query.
   * @param condition Conditions to match for a valid state view. Expressed as MongoDB filter query.
   * @returns {Selector}
   */
  select<P extends RawObject = S>(
    projection: Record<keyof P, AnyVal> | RawObject,
    condition: RawObject = {}
  ): Selector<P> {
    // disallow exclusions.
    for (const v of Object.values(projection)) {
      // validate projection expression immediately catch errors early.
      assert(v !== 0 && v !== false, "field exclusion not allowed");
      assert(
        isProjectExpression(v),
        `selector projection value must be an object, array, true, or 1: '${JSON.stringify(
          projection
        )}'`
      );
    }

    // ensure not modifiable. some guards for sanity
    condition = cloneFrozen(condition);
    projection = cloneFrozen(projection);

    // reuse same selector definitions
    const hash = stringify([projection, condition]);
    if (this.selectors.has(hash)) {
      return this.selectors.get(hash).selector as Selector<P>;
    }

    // get expected paths to monitor for changes.
    // extract paths in condition expression
    const expected = getDependentPaths(
      Object.entries(condition).reduce((m, [k, v]) => {
        m[k] = normalize(v);
        return m;
      }, {}),
      { includeRootFields: true }
    );
    // extract path in projection expression
    getDependentPaths(projection, { includeRootFields: false }).forEach(s =>
      expected.add(s)
    );

    // create and add a new selector
    const selector = new Selector<P>(
      this.getState.bind(this) as GetStateFn<P>,
      mkQuery(condition, this.queryOptions),
      projection
    );

    // if no field is specified, select everything.
    const pred = !expected.size
      ? () => true
      : (sameAncestor.bind(null, expected) as Predicate<AnyVal>);
    // function to detect changes and notify observers
    const signal = (changed: Readonly<string[]>) => {
      const isize = new Set(changed.concat(Array.from(expected))).size; // intersection
      const usize = expected.size + changed.length; // union
      const notify = isize < usize || changed.some(pred);
      // notify listeners only when change is detected
      if (notify) selector.notifyAll();
      return notify;
    };

    this.selectors.set(hash, { selector, signal });
    return selector;
  }

  /**
   * Dispatches an update expression to mutate the state. Triggers a notification to relevant selectors only.
   *
   * @param {UpdateExpression | UpdateExpression[]} expr Update expression as a MongoDB update query.
   * @param {Array<RawObject>} arrayFilters Array filter expressions to filter elements to update.
   * @param {RawObject} condition Condition to check before applying update.
   * @returns {UpdateResult} Result of the update operation.
   */
  update(
    expr: UpdateExpression | UpdateExpression[],
    arrayFilters: RawObject[] = [],
    condition: RawObject = {}
  ): UpdateResult {
    const query = mkQuery(condition, this.queryOptions);
    const fields = Array.from(
      new Set(
        // apply mutations
        (ensureArray(expr) as UpdateExpression[]).flatMap(e =>
          this.mutate(this.state, e, arrayFilters, query)
        )
      )
    );

    // return if state is unchanged
    if (!fields.length) {
      return { modified: false };
    }

    // maintain stability.
    fields.sort();
    // set modified flag
    this.modified = true;
    // notify subscribers
    let notifyCount = 0;
    for (const { selector, signal } of this.selectors.values()) {
      // record the number of listeners before notifying the selector.
      // upon notification a listener will be removed from the selector if it throws or is configured to run once.
      const size = (selector as Selector).size;
      if ((signal as Signal)(fields)) notifyCount += size;
    }
    return { modified: true, fields, notifyCount };
  }
}
