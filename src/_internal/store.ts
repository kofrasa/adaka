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
import { cloneDeep, isEqual, stringify } from "mingo/util";

import { cloneFrozen, extractKeyPaths, sameAncestor } from "./util";

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
  /** Indicates whether the state was modified */
  readonly modified: boolean;
  /** Indicates the fields in the state that were changed if modified. */
  readonly fields?: string[];
  /** Indicates the number of listeners notified. */
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
  private readonly hashIndex = new Map<string, Selector<RawObject>>();
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
      useStrictMode: false // force normal JavaScript semantics.
    });
    this.mutate = createUpdater({ cloneMode: "none", ...options });
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
      const isize = new Set(changed.concat(expected)).size; // intersection
      const usize = expected.length + changed.length; // union
      const notify = isize < usize || changed.some(pred);
      // notify listeners only when change is detected
      if (notify) selector.notifyAll();
      return notify;
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
      // record the count of listeners befor signalling which may modify the selector if a listener throws or is configured to run once.
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
    private readonly projection: Record<keyof T, AnyVal>,
    private readonly query: Query,
    private readonly options: QueryOptions
  ) {}

  /** Returns the number of subscribers to this selector. */
  get size(): number {
    return this.listeners.size;
  }

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
   * Notify all listeners with the current value of the selector if different from the previous value.
   * If a listener throws an exception when notified, it is removed and does not receive future notifications.
   */
  notifyAll() {
    // only recompute if there are active listeners.
    if (!this.listeners.size) return;
    const prev = this.cached ? this.get() : NONE;
    // reset the cache when notifyAll() is called.
    this.cached = false;
    // compute new value.
    const val = this.get();
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
      const val = this.get();
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
