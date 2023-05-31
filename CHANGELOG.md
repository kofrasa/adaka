# Changelog

## 0.0.1 / 2023-06-xx

- Initial release.
- Support update operators;
  - `$currentDate`, `$inc`, `$max`, `$min`, `$mul`.
  - `$[]`, `$[<identifier>]`, `$addToSet`, `$pop`, `$pull`, `$pullAll`, `$push`.
  - `$set`, `$unset`.
- Support registering listeners to observe custom views of state.
- React integration via `createSelectorHook`.
