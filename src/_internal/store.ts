import "mingo/init/basic";

import { initOptions, Options } from "mingo/core";
import { Lazy } from "mingo/lazy";
import { $project } from "mingo/operators/pipeline";
import { Query } from "mingo/query";
import { AnyVal, Callback, Predicate, RawObject } from "mingo/types";
import { assert, cloneDeep, has, stringify } from "mingo/util";

import * as UPDATE_OPERATORS from "./operators";
import { Listener, UpdateOperator } from "./types";
import { cloneFrozen, extractKeyPaths, sameAncestor } from "./util";

// https://stackoverflow.com/questions/60872063/enforce-typescript-object-has-exactly-one-key-from-a-set
/** Define maps to enforce a single key from a union. */
type OneKey<K extends keyof any, V, KK extends keyof any = K> = {
  [P in K]: { [Q in P]: V } & { [Q in Exclude<KK, P>]?: never } extends infer O
    ? { [Q in keyof O]: O[Q] }
    : never;
}[K];

export type UpdateExpression = OneKey<keyof typeof UPDATE_OPERATORS, RawObject>;

/**
 * Creates a new store object.
 *
 * @param initialState The initial state object
 * @param options Options to be used for updates and queries.
 * @returns {Store}
 */
export function createStore<T extends RawObject>(
  initialState: T,
  options?: { queryOptions: Options }
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
  private readonly queryOptions: Options;

  constructor(initialState: T, options?: { queryOptions: Options }) {
    this.state = cloneDeep(initialState) as T;
    this.queryOptions = initOptions({
      ...options?.queryOptions,
      useStrictMode: false // force normal JavaScript semantics.
    });
  }

  /** A callback to ensure only selectors with subscribers are notified.  */
  private emit(s: Selector<RawObject>, subs: number) {
    if (subs === 0) {
      this.selectors.delete(s);
    } else if (this.signals.has(s)) {
      this.selectors.add(s);
    }
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
      return this.hashIndex.get(hash) as Selector<P>;
    }

    // get expected paths to monitor for changes. use fields in both projection and condition
    const [cond, proj] = [condition, projection].map(o =>
      Array.from(extractKeyPaths(o))
    );
    const expected = cloneFrozen(Array.from(new Set(cond.concat(proj))));
    // create and add a new selector
    const selector = new Selector<P>(
      this.state,
      projection,
      new Query(condition, this.queryOptions),
      this.queryOptions,
      (s: Selector<P>, n: number) => this.emit(s as Selector<RawObject>, n)
    );
    const pred = sameAncestor.bind(null, expected) as Predicate<AnyVal>;
    // function to detect changes and notify observers
    const signal = (changed: string[]) => {
      const usize = new Set(changed.concat(expected)).size;
      const tsize = expected.length + changed.length;
      // notify listeners only when change is detected
      if (usize < tsize || changed.some(pred)) selector.notifyAll();
    };
    this.signals.set(selector as Selector<RawObject>, signal);
    this.hashIndex.set(hash, selector as Selector<RawObject>);
    return selector;
  }

  /**
   * Dispatches an update expression to mutate the state. Triggers a notification to relevant selectors only.
   * @param expr A MongoDB update expression.
   */
  update(expr: UpdateExpression, arrayFilters: RawObject[] = []): void {
    // vaidate operator
    const e = Object.entries(expr);
    // check for single entry
    assert(e.length === 1, "Update expression must contain only one operator.");
    const [op, args] = e[0];
    // check operator exists
    assert(has(UPDATE_OPERATORS, op), `Operator '${op}' is not supported.`);
    const mutate = UPDATE_OPERATORS[op] as UpdateOperator;
    // setup change tracker
    const set = new Set<string>();
    const emit = (selector: string) => set.add(selector);
    // apply updates
    mutate(this.state, args, arrayFilters, { emit });
    // notify subscribers
    const changed = Array.from(set);
    this.selectors.forEach(o => {
      const cb = this.signals.get(o);
      if (cb) cb(changed);
    });
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
    private readonly options: Options,
    private readonly emit: (s: Selector<T>, n: number) => void
  ) {}

  private doEmit() {
    const size = this.listeners.size;
    if (size === 1 || size === 0) {
      this.emit(this, this.listeners.size);
    }
  }

  /**
   * Return the current value from state if the condition is fulfilled.
   * The returned value is cached for subsequent calls until notifyAll() is called.
   * @returns {T | undefined}
   */
  get(): T | undefined {
    if (this.cached) return this.value;
    // update cached status
    this.cached = true;
    // project fields and freeze final value if query passes
    const exists = this.query.test(this.state);
    return (this.value = exists
      ? ($project(Lazy([this.state]), this.projection, this.options)
          .map(cloneFrozen)
          .next().value as T)
      : undefined);
  }

  /**
   * Run all the listeners with the current value of the selector if not undefined.
   * When the value is 'undefined' the listeners will not be invoked because it is indistinguishable from a failed condition.
   * Callers should never store undefined values in the store. Update operations ignore undefined values.
   * If a listener throws an exception when notified, it is removed and does not receive future notifications.
   */
  notifyAll(): void {
    // clear cache when notifyAll() is called.
    this.cached = false;
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
      this.doEmit();
      /*eslint-disable-enable*/
    }
  }

  /**
   * Remove all registered listeners.
   */
  removeAll() {
    this.listeners.clear();
    this.onceOnly.clear();
    this.doEmit();
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
      this.doEmit();
    }
    return () => {
      this.listeners.delete(listener);
      this.doEmit();
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
      this.doEmit();
    }
    return () => {
      this.listeners.delete(listener);
      this.onceOnly.delete(listener);
      this.doEmit();
    };
  }
}
