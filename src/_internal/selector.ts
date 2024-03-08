import { Query } from "mingo";
import { AnyVal, RawObject } from "mingo/types";
import { isEqual } from "mingo/util";

/** The function to query the state from the store. */
export type GetStateFn<T> = (projection: RawObject, condition: Query) => T;

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

/** Represent an unknown value */
const NONE = Symbol();

/**
 * Provides an observable interface for selecting customized views of the state.
 * Listeners can subscribe to be notified of changes in the view repeatedely or once.
 */
export class Selector<T extends RawObject = RawObject> {
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
   * @param stateFn Function to query state from store.
   * @param query Query object for checking conditions based on MongoDB filter query.
   * @param projection View of the state to select expressed as MongoDB projection query.
   */
  constructor(
    private readonly stateFn: GetStateFn<T>,
    private readonly query: Query,
    private readonly projection: Record<keyof T, AnyVal> | RawObject
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
    return (this.value = this.stateFn(this.projection, this.query));
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
    // No change so skip notifications. If a new subscriber was added after the last notification, it will be skipped here as well.
    // This is becuase the state has still not changed after it was added. For new subscribers to receive current state on subcsription,
    // they should be registered with {runImmediately: true}.
    if (isEqual(prev, val)) return;

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
