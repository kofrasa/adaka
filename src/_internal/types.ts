import { Callback, RawObject } from "mingo/types";

/** Observes a selector for changes in store and optionally return updates to apply. */
export type Listener<T extends RawObject> = Callback<void, T>;

// like compute options. each expression gets an instance.
// enables reporting which fields actually got updated.
export interface UpdateOptions {
  /** Emits a selector into a buffer for use to notify subscribers of changes. */
  emit: (_: string) => void;
}

/** Function interface for update operators */
export type UpdateOperator = (
  obj: RawObject,
  expr: RawObject,
  arrayFilters: RawObject[],
  options: UpdateOptions
) => void;
