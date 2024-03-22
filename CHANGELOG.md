# Changelog

## 0.0.11 / 2024-03-22
**New**
- Add support for multiple update operations in single call.

**Fixes**
- Restore clone mode default to "copy".

## 0.0.10 / 2024-03-04
**New**
- Add `Store.getState` method to directly query state.
- Cache previous value for full retrieval.
- Remove `Selector.removeAll`.

**Changed**
- Rename `Selector.get` to `Selector.getState`.

## 0.0.9 / 2024-02-28

**New**

- Simplify `Selector` API to use common method naming and configuration.
- Validate projection expression immediately on selector creation.
- Support querying the entire object using empty expression.

**Fixes**

- Improve extracting dependent fields in projection and query expressions.

## 0.0.8 / 2024-02-26

**New**

- Replace `boolean` with `UpdateResult` after an update operation.

## 0.0.7 / 2023-09-27

- fix `notifyAll` semantics to behave correctly for conditions.

## 0.0.6 / 2023-09-26

- Pin peer dependency as `mingo@6.x.x`.
- Default clone mode to "copy".

## 0.0.5 / 2023-06-26

- Add `mingo@6.4.2` as peerDependency.

## 0.0.4 / 2023-06-25

- Upgrade to `mingo@6.4.2` for `Context` support.

## 0.0.3 / 2023-06-09

- Load only basic mingo operators by default.

## 0.0.2 / 2023-06-08

- Upgrade to `mingo@6.4.1` for full update operator support.
- Default to not cloning inputs on update.

## 0.0.1 / 2023-06-04

- Moved React integration to separate package [reack-adaka](https://www.npmjs.com/package/react-adaka).

## 0.0.0 / 2023-06-03

- Initial release.
- Support update operators with array filters;
  - `$currentDate`, `$inc`, `$max`, `$min`, `$mul`.
  - `$[]`, `$[<identifier>]`, `$addToSet`, `$pop`, `$pull`, `$pullAll`, `$push`.
  - `$set`, `$unset`.
- Support registering listeners to observe custom views of state.
- React integration via `createSelectorHook`.
