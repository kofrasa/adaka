import { Callback, RawObject } from "mingo/types";
import { useSyncExternalStore } from "react"; /*eslint-disable-line import/no-unresolved*/

import { Selector, Store } from "./_internal/store";

/**
 * Creates and returns a React selector hook to be used for retrieving data from the store.
 * @param store The store to use for obtaining data.
 * @returns {Callback}
 */
export const createSelectorHook = <T extends RawObject>(
  store: Store<T>
): Callback => {
  const subscribers = new Map<Selector<RawObject>, Callback>();
  return ((projection: RawObject, condition: RawObject = {}) => {
    // returns same instance for identical inputs.
    const selector = store.select(projection, condition);
    if (!subscribers.has(selector)) {
      subscribers.set(selector, ((cb: Callback<void>) =>
        selector.listen(cb)) as Callback);
    }
    return useSyncExternalStore(
      subscribers.get(selector) as Callback<Callback>,
      () => selector.get()
    );
  }) as Callback;
};
