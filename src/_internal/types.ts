import { Callback, RawObject } from "mingo/types";

/** Observes a selector for changes in store and optionally return updates to apply. */
export type Listener<T extends RawObject> = Callback<void, T>;
