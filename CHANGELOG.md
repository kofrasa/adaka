# Changelog

## 0.0.5 / 2023-06-25
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
