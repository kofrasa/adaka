import "mingo/init/basic";

import { Query } from "mingo";
import {
  initOptions,
  OperatorType,
  Options as QueryOptions,
  UpdateOptions,
  useOperators
} from "mingo/core";
import { Lazy } from "mingo/lazy";
import * as expressionOperators from "mingo/operators/expression";
import { $project } from "mingo/operators/pipeline";
import { AnyVal, Callback, Predicate, RawObject } from "mingo/types";
import { createUpdater, UpdateExpression, Updater } from "mingo/updater";
import { cloneDeep, stringify } from "mingo/util";

import { cloneFrozen, extractKeyPaths, sameAncestor } from "./util";

// supports queries using $expr
useOperators(OperatorType.EXPRESSION, expressionOperators);

/** Observes a selector for changes in store and optionally return updates to apply. */
export type Listener<T extends RawObject> = Callback<void, T>;

/** Options for use when creating a new store. */
export type Options = UpdateOptions;

/**
 * Creates a new store object.
 *
 * @param initialState The initial state object
 * @param options Options to be used for updates and queries.
 * @returns {Store}
 */
export function createStore<T extends RawObject>(
  initialState: T,
  options?: Options
): Store<T> {
  return new Store<T>(initialState, options);
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
  private readonly hashIndex = new Map<string, Selector<RawObject>>();
  // signals for notifying selectors of changes.
  private readonly signals = new Map<
    Selector<RawObject>,
    Callback<void, string[]>
  >();
  // query options to pass to MongoDB processing engine.
  private readonly queryOptions: QueryOptions;
  // the updater function
  private readonly mutate: Updater;

  constructor(initialState: T, options?: Options) {
    this.state = cloneDeep(initialState) as T;
    this.queryOptions = initOptions({
      ...options?.queryOptions,
      useStrictMode: false // force normal JavaScript semantics.
    });
    this.mutate = createUpdater(options);
  }

  /**
   * Creates a new observable for a view of the state.
   * @param projection Fields of the state to view. Expressed as MongoDB projection query.
   * @param condition Conditions to match for a valid state view. Expressed as MongoDB filter query.
   * @returns {Selector}
   */
  select<P extends RawObject>(
    projection: Record<keyof P, AnyVal>,
    condition: RawObject = {}
  ): Selector<P> {
    // ensure not modifiable. some guards for sanity
    condition = cloneFrozen(condition);
    projection = cloneFrozen(projection);

    // reuse selectors
    const hash = stringify({ c: condition, p: projection });
    if (this.hashIndex.has(hash)) {
      // anytime we pull selector from cache, we should mark it as dirty.
      return this.hashIndex.get(hash) as Selector<P>;
    }

    // get expected paths to monitor for changes. use fields in both projection and condition
    const [cond, proj] = [condition, projection].map(o =>
      Array.from(extractKeyPaths(o))
    );
    const expected = Array.from(new Set(cond.concat(proj)));
    // create and add a new selector
    const selector = new Selector<P>(
      this.state,
      projection,
      new Query(condition, this.queryOptions),
      this.queryOptions
    );
    const pred = sameAncestor.bind(null, expected) as Predicate<AnyVal>;
    // function to detect changes and notify observers
    const signal = (changed: string[]) => {
      const usize = new Set(changed.concat(expected)).size;
      const tsize = expected.length + changed.length;
      // notify listeners only when change is detected
      if (usize < tsize || changed.some(pred)) {
        selector.notifyAll();
      }
    };
    this.selectors.add(selector);
    this.signals.set(selector as Selector<RawObject>, signal);
    this.hashIndex.set(hash, selector as Selector<RawObject>);
    return selector;
  }

  /**
   * Dispatches an update expression to mutate the state. Triggers a notification to relevant selectors only.
   * @param {RawObject} expr Update expression as a MongoDB update query.
   * @param {Array<RawObject>} arrayFilters Array filter expressions to filter elements to update.
   * @param {RawObject} condition Condition to check before applying update.
   * @returns {Boolean} Status of update representing whether data changed.
   */
  update(
    expr: UpdateExpression,
    arrayFilters: RawObject[] = [],
    condition: RawObject = {}
  ): boolean {
    const changed = this.mutate(this.state, expr, arrayFilters, condition);
    // return if state is unchanged
    if (!changed.length) return false;
    // notify subscribers
    this.selectors.forEach(o => {
      const cb = this.signals.get(o);
      if (cb) cb(changed);
    });
    return true;
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
    private readonly projection: Record<keyof T, AnyVal>,
    private readonly query: Query,
    private readonly options: QueryOptions
  ) {}

  /**
   * Return the current value from state if the condition is fulfilled.
   * The returned value is cached for subsequent calls until notifyAll() is called.
   * @returns {T | undefined}
   */
  get(): T | undefined {
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
   * Run all the listeners with the current value of the selector if not undefined.
   * When the value is 'undefined' the listeners will not be invoked because it is indistinguishable from a failed condition.
   * Callers should never store undefined values in the store. Update operations ignore undefined values.
   * If a listener throws an exception when notified, it is removed and does not receive future notifications.
   */
  notifyAll(): void {
    // reset the cache when notifyAll() is called.
    this.cached = false;
    // only recompute if there are active listeners.
    if (!this.listeners.size) return;
    // compute new value.
    const val = this.get();
    if (val !== undefined) {
      /*eslint-disable*/
      for (const cb of this.listeners) {
        try {
          cb(val);
        } catch {
          this.listeners.delete(cb);
        } finally {
          if (this.onceOnly.has(cb)) {
            this.listeners.delete(cb);
            this.onceOnly.delete(cb);
          }
        }
      }
      /*eslint-disable-enable*/
    }
  }

  /**
   * Remove all registered listeners.
   */
  removeAll() {
    this.listeners.clear();
    this.onceOnly.clear();
  }

  /**
   * Register a listener to be notified about state updates.
   * The listener is immediately invoked if the selector matches the state.
   * @param listener The observer function to receive data.
   * @returns {Callback} Function to unsubscribe listener.
   */
  listen(listener: Listener<T>): Callback<void> {
    // check if we are reregistering the same observer
    if (this.onceOnly.has(listener)) {
      throw new Error(`Already subscribed to listen once.`);
    }
    if (!this.listeners.has(listener)) {
      this.listeners.add(listener);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Like listen() but also immediately invoke the listener if a value is pending for selector.
   * @param listener The observer function to receive data.
   * @returns {Callback} Function to unsubscribe listener.
   */
  listenNow(listener: Listener<T>): Callback<void> {
    // check if we are reregistering the same observer
    const unsub = this.listen(listener);
    // immediately invoke
    const val = this.get();
    if (val !== undefined) {
      try {
        listener(val);
      } catch (e) {
        unsub();
        throw e;
      }
    }
    return unsub;
  }

  /**
   * Like listen(), but invokes the listener only once and then automatically removes it.
   * @param listener The observer functino to receive data.
   * @returns {Callback} Function to unsubscribe listener explicitly before it is called.
   */
  listenOnce(listener: Listener<T>): Callback<void> {
    // check if we are reregistering the same observer
    if (this.listeners.has(listener) && !this.onceOnly.has(listener)) {
      throw new Error(`Already subscribed to listen repeatedly.`);
    }
    if (!this.onceOnly.has(listener)) {
      this.listeners.add(listener);
      this.onceOnly.add(listener);
    }
    return () => {
      this.listeners.delete(listener);
      this.onceOnly.delete(listener);
    };
  }
}
