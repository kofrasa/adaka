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
import { assert, cloneDeep, isEqual, normalize, stringify } from "mingo/util";

import {
  cloneFrozen,
  getDependentPaths,
  isProjectExpression,
  sameAncestor
} from "./util";

/** Observes a selector for changes in store and optionally return updates to apply. */
export type Listener<T> = (data: T) => void;

/** Unsbuscribe from receiving further notifications */
export type Unsubscribe = () => void;

/** Options to pass on subscription. */
export interface SubscribeOptions {
  /** Immediately run the listener when register. Any error will bubble up immediately. */
  readonly runImmediately?: boolean;
  /** Run only once. */
  readonly runOnce?: boolean;
}

/** Result from update operation which returns useful details. */
export interface UpdateResult {
  /** Represents whether the state was modified */
  readonly modified: boolean;
  /** The fields in the state object that were modified. */
  readonly fields?: string[];
  /** The number of listeners notified. */
  readonly notifyCount?: number;
}

const NONE = Symbol();

/**
 * Creates a new store object.
 *
 * @param initialState The initial state object
 * @param updateOptions Options to be used for updates and queries.
 * @returns {Store}
 */
export function createStore<T extends RawObject>(
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
export class Store<T extends RawObject> {
  // internal reference to state object
  private readonly state: T;
  // ordered set of selectors. only selectors with subscribers are kept here.
  private readonly selectors = new Set<Selector<RawObject>>();
  private readonly cache = new Map<string, Selector<RawObject>>();
  // signals for notifying selectors of changes.
  private readonly signals = new Map<
    Selector<RawObject>,
    (s: string[]) => boolean
  >();
  // query options to pass to MongoDB processing engine.
  private readonly queryOptions: QueryOptions;
  // the updater function
  private readonly mutate: Updater;

  constructor(initialState: T, options?: UpdateOptions) {
    this.state = cloneDeep(initialState) as T;
    this.queryOptions = initOptions({
      ...options?.queryOptions,
      // use normal JavaScript semantics.
      useStrictMode: false
    });
    this.mutate = createUpdater({ cloneMode: "none", ...options });
  }

  /**
   * Returns the current state as a frozen object subject to the given criteria.
   * When no options are specified, returns the full state.
   *
   * @param projection An optional projection expression. @default {}
   * @param condition An optional condition expression.
   * @returns {T|undefined}
   */
  getState<P extends RawObject>(
    projection: Record<keyof P, AnyVal> | RawObject = {},
    condition: RawObject = {}
  ): T | undefined {
    // project fields and freeze final value if query passes
    return new Query(condition, this.queryOptions).test(this.state)
      ? ($project(Lazy([this.state]), projection, this.queryOptions)
          .map(cloneFrozen)
          .next().value as T)
      : undefined;
  }

  /**
   * Creates a new observable for a view of the state.
   *
   * @param projection Fields of the state to view. Expressed as MongoDB projection query.
   * @param condition Conditions to match for a valid state view. Expressed as MongoDB filter query.
   * @returns {Selector}
   */
  select<P extends RawObject>(
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

    // reuse selectors
    const hash = stringify({ c: condition, p: projection });
    if (this.cache.has(hash)) {
      // anytime we pull selector from cache, we should mark it as dirty.
      return this.cache.get(hash) as Selector<P>;
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
      this.state,
      projection,
      new Query(condition, this.queryOptions),
      this.queryOptions
    );

    // if no field is specified, select everything.
    const pred = !expected.size
      ? () => true
      : (sameAncestor.bind(null, expected) as Predicate<AnyVal>);
    // function to detect changes and notify observers
    const signal = (changed: string[]) => {
      const isize = new Set(changed.concat(Array.from(expected))).size; // intersection
      const usize = expected.size + changed.length; // union
      const notify = isize < usize || changed.some(pred);
      // notify listeners only when change is detected
      if (notify) selector.notifyAll();
      return notify;
    };
    this.selectors.add(selector);
    this.signals.set(selector as Selector<RawObject>, signal);
    this.cache.set(hash, selector as Selector<RawObject>);
    return selector;
  }

  /**
   * Dispatches an update expression to mutate the state. Triggers a notification to relevant selectors only.
   *
   * @param {UpdateExpression} expr Update expression as a MongoDB update query.
   * @param {Array<RawObject>} arrayFilters Array filter expressions to filter elements to update.
   * @param {RawObject} condition Condition to check before applying update.
   * @returns {UpdateResult} Result of the update operation.
   */
  update(
    expr: UpdateExpression,
    arrayFilters: RawObject[] = [],
    condition: RawObject = {}
  ): UpdateResult {
    const fields = this.mutate(this.state, expr, arrayFilters, condition);
    // return if state is unchanged
    if (!fields.length) {
      return { modified: false };
    }
    // notify subscribers
    let notifyCount = 0;
    for (const k of this.selectors) {
      const selector = k as Selector<RawObject>;
      const signal = this.signals.get(selector);
      // record the number of listeners before signalling which may remove a listener if it throws or is configured to run once.
      const size = selector.size;
      if (signal(fields)) {
        notifyCount += size;
      }
    }
    return { modified: true, fields, notifyCount };
  }
}

/**
 * Provides an observable interface for selecting customized views of the state.
 * Listeners can subscribe to be notified of changes in the view repeatedely or once.
 */
export class Selector<T extends RawObject> {
  // iteration happens in insertion order.
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set
  private readonly listeners = new Set<Listener<T>>();
  // listeners to be run once only also included in the main listener set.
  private readonly onceOnly = new Set<Listener<T>>();
  // the last value computed for this selector.
  private value: T | undefined;
  // flag used to control when to use cached value.
  private cached = false;

  /**
   * Construct a new selector
   * @param state Reference to the state object.
   * @param projection View of the state to select expressed as MongoDB projection query.
   * @param query Query object for checking conditions based on MongoDB filter query.
   * @param options Options to use for the query.
   */
  constructor(
    private readonly state: RawObject,
    private readonly projection: Record<keyof T, AnyVal> | RawObject,
    private readonly query: Query,
    private readonly options: QueryOptions
  ) {}

  /** Returns the number of subscribers to this selector. */
  get size(): number {
    return this.listeners.size;
  }

  /**
   * Returns the current state view subject to the selector criteria.
   * The value is only recomputed when the depedent fields in the criteria change.
   *
   * @returns {T | undefined}
   */
  getState(): T | undefined {
    // return cached if value has not changed since
    if (this.cached) return this.value;
    // update cached status
    this.cached = true;
    // project fields and freeze final value if query passes
    this.value = this.query.test(this.state)
      ? ($project(Lazy([this.state]), this.projection, this.options)
          .map(cloneFrozen)
          .next().value as T)
      : undefined;
    return this.value;
  }

  /**
   * Notify all listeners with the current value of the selector if different from the previous value.
   * If a listener throws an exception when notified, it is removed and does not receive future notifications.
   */
  notifyAll() {
    // only recompute if there are active listeners.
    if (!this.listeners.size) return;
    const prev = this.cached ? this.getState() : NONE;
    // reset the cache when notifyAll() is called.
    this.cached = false;
    // compute new value.
    const val = this.getState();
    if (!isEqual(prev, val)) {
      for (const f of this.listeners) {
        /*eslint-disable*/
        try {
          f(val);
        } catch {
          // on error unsubscribe listener
          this.listeners.delete(f);
        } finally {
          // if runOnce, cleanup afterwards
          if (this.onceOnly.delete(f)) {
            this.listeners.delete(f);
          }
        }
        /*eslint-disable-enable*/
      }
    }
  }

  /**
   * Remove all registered listeners.
   */
  removeAll() {
    this.listeners.clear();
  }

  /**
   * Subscribe a listener to be notified about state updates.
   *
   * @param listener The function to receive new data on update.
   * @returns {Unsubscribe} Function to unsubscribe listener.
   */
  subscribe(listener: Listener<T>, options?: SubscribeOptions): Unsubscribe {
    // check if we are reregistering the same observer
    if (this.listeners.has(listener)) {
      throw new Error("Listener already subscribed.");
    }

    // setup to throw after first run.
    if (options && options.runOnce) {
      this.onceOnly.add(listener);
    }

    this.listeners.add(listener);

    const unsub = () => {
      this.onceOnly.delete(listener);
      this.listeners.delete(listener);
    };

    if (options && options.runImmediately) {
      // immediately invoke
      const val = this.getState();
      if (val !== undefined) {
        try {
          listener(val);
        } catch (e) {
          unsub();
          throw e;
        } finally {
          if (this.onceOnly.has(listener)) unsub();
        }
      }
    }

    return unsub;
  }
}
