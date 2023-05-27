# adaka

High-precision state management using MongoDB query language.

![license](https://img.shields.io/github/license/kofrasa/adaka)
[![version](https://img.shields.io/npm/v/adaka)](https://www.npmjs.org/package/adaka)
[![build](https://github.com/kofrasa/adaka/actions/workflows/node.js.yml/badge.svg)](https://github.com/kofrasa/adaka/actions/workflows/node.js.yml)
![issues](https://img.shields.io/github/issues/kofrasa/adaka)
[![codecov](https://img.shields.io/codecov/c/github/kofrasa/adaka)](https://codecov.io/gh/kofrasa/adaka)
[![npm downloads](https://img.shields.io/npm/dm/adaka)](https://www.npmjs.org/package/adaka)

## Install

`npm i adaka`

## Features

- Manage state as a single document modifiable only through the store API.
- Update state using MongoDB [update query](https://www.mongodb.com/docs/manual/reference/operator/update/) language. Supported operators include;
  - Field Update Operators; `$currentDate`, `$inc`, `$max`, `$min`, `$mul`, `$set`, `$unset`.
  - Array Update Operators; `$addToSet`, `$pop`, `$pull`, `$pullAll`, `$push`.
- Create selectors to observe a view of the state with full access to query language for reshaping data.
- Listen for changes in state view in order to react to updates.
- Restrict state notifications with conditions expressed as MongoDB queries.
- Automatically unsubscribes a listener if it throws an exception.
- Performs value equality using deep equal.

## Usage

### Import the `createStore` function to get started.

```ts
import { createStore } from "adaka";
```

### Create store and select some data.

```ts
type Person = { name: string; age: number; children?: string[] };

const store = createStore<Person>({
  name: "John",
  age: 30,
  children: ["Luke"]
});

// create a selector
const selector = store.select<{ name: string }>({ name: 1 });

// subcriber runs whenever name changes.
const unsubscribe = selector.listen(view => {
  console.log("->", view);
});

// first update
store.update({ $set: { name: "Amoah" } }); //output: '-> {name:"Amoah"}'

// can also use selector.get() to obtain the value directly.
console.log(selector.get()); // {name: "Amoah"}

// second update
store.update({ $set: { name: "Donkor" } }); //output: '-> {name:"Donkor"}'

// third update on different part of the state. subscriber is not notified.
store.update({ $push: { children: "Ama" } }); // no output

// remove subscriber by calling return method.
unsubscribe();

// subscriber no longer runs
store.update({ $set: { name: "Odame" } }); // no output
```

### Select data only on condition

```ts
// second child if person under 30
const selector = store.select<{ secondChild: string }>({
  secondChild: "$children.1"
}), {age: {$lt: 30}};

selector.get() // undefined

store.update({$set: {age: 25}})

// no second child yet.
selector.get() // {}

store.update({ $push: { children: "Adrian"} })

selector.get() // { secondChild: 'Adrian' }
```

## MongoDB Query Support

This package uses the [mingo](https://npmjs.com/package/mingo) library for MongoDB query support and loads only the basic operators for booleans and comparisons by default. To get access to more expression or accumulator operators, you can register them directly before use. See [readme](https://www.npmjs.com/package/mingo) page for more information.

### Example: Registering and using an expression operators.

```js
import { useOperators, OperatorType, OperatorMap } from "mingo/core";
import { $trunc, $map } from "mingo/operators/expression";
import { createStore } from "adaka"

// register operators to support
useOperators(OperatorType.EXPRESSION, { $trunc, $map } as OperatorMap);

// referring to previous example.
const store = createStore<{metrics: number[]}>({
  metrics: [55.97234, 12.08834, 78.80023, 53.0098832]
})

const truncatedMetrics = store.select<{metrics: number[]}>({
  metrics: {
    $map: {
      input: "$metrics",
      in: { $trunc: [ "$$this", 2 ] }
    }
  }
})

console.log(truncatedMetrics.get()) // {"metrics": [55.97, 12.08, 78.8, 53.01]}
```

## TODO

- Support schema validation

## License
MIT