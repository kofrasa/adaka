# Changelog

## 0.0.0 / 2023-06-03

- Initial release.
- Support update operators with array filters;
  - `$currentDate`, `$inc`, `$max`, `$min`, `$mul`.
  - `$[]`, `$[<identifier>]`, `$addToSet`, `$pop`, `$pull`, `$pullAll`, `$push`.
  - `$set`, `$unset`.
- Support registering listeners to observe custom views of state.
- React integration via `createSelectorHook`.
