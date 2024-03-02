import { OperatorType, useOperators } from "mingo/core";
import { $concat } from "mingo/operators/expression";

import { createStore, Selector, Store } from "../src";

useOperators(OperatorType.EXPRESSION, { $concat });

describe("Store", () => {
  type Person = {
    firstName: string;
    lastName: string;
    age: number;
    children?: string[];
  };
  let store: Store<Person>;
  let selector: Selector<Pick<Person, "firstName">>;
  let counter = 0;
  const listener = (_: ReturnType<typeof selector.getState>) => {
    counter++;
  };

  beforeEach(() => {
    store = createStore<Person>({
      firstName: "Kwame",
      lastName: "Osei",
      age: 30,
      children: ["Bediako"]
    });
    counter = 0;
    selector = store.select<Pick<Person, "firstName">>({ firstName: 1 });
  });

  describe("getState", () => {
    it("should return the entire state", () => {
      expect(store.getState()).toEqual({
        firstName: "Kwame",
        lastName: "Osei",
        age: 30,
        children: ["Bediako"]
      });
    });

    it("should return a frozen object", () => {
      const obj = store.getState()!;
      expect(() => {
        obj.age = 43;
      }).toThrow();

      expect(() => {
        obj.children?.push("Adwoa");
      }).toThrow();
    });
  });

  describe("update", () => {
    it("should notify subscriber with full state when empty projection specified", () => {
      const selector = store.select<Person>({});
      const res: Person[] = [];
      selector.subscribe(state => res.push({ ...state }));
      expect(store.update({ $set: { firstName: "John" } })).toEqual({
        modified: true,
        fields: ["firstName"],
        notifyCount: 1
      });
      expect(res.pop()).toEqual({
        firstName: "John",
        lastName: "Osei",
        age: 30,
        children: ["Bediako"]
      });
    });

    it("should notify subscriber with full state when empty projection specified and condition holds", () => {
      const selector = store.select<Person>({}, { age: { $gt: 30 } });
      const res: Person[] = [];
      selector.subscribe(state => res.push({ ...state }));
      expect(store.update({ $set: { firstName: "John" } })).toEqual({
        modified: true,
        fields: ["firstName"],
        notifyCount: 0
      });
      expect(res.length).toEqual(0);

      expect(store.update({ $set: { age: 35 } })).toEqual({
        modified: true,
        fields: ["age"],
        notifyCount: 1
      });

      expect(res.pop()).toEqual({
        firstName: "John",
        lastName: "Osei",
        age: 35,
        children: ["Bediako"]
      });
    });

    it("should update store with condition", () => {
      let status = store.update(
        {
          $set: { lasName: "Ankrah" }
        },
        [],
        { lastName: "Appiah" }
      );

      expect(status).toEqual({
        modified: false
      });

      status = store.update(
        {
          $set: { lastName: "Adjei" }
        },
        [],
        { lastName: "Osei" }
      );

      expect(status).toEqual({
        modified: true,
        fields: ["lastName"],
        notifyCount: 0
      });
    });
  });

  describe("Selector", () => {
    describe("notifyAll", () => {
      it("should notify all subscribers only when the selector value changes", () => {
        selector.subscribe(listener);
        expect(counter).toEqual(0);

        selector.notifyAll();
        expect(counter).toEqual(1);

        selector.notifyAll();
        expect(counter).toEqual(1);
      });
    });

    describe("removeAll", () => {
      it("should remove all listeners", () => {
        selector.subscribe(listener);
        expect(counter).toEqual(0);

        selector.notifyAll();
        expect(counter).toEqual(1);

        selector.removeAll();
        selector.notifyAll();
        expect(counter).toEqual(1);
      });
    });

    describe("subscribe", () => {
      it("should fail if subscriber is already registered to listen once", () => {
        // register to listen oncs
        selector.subscribe(listener);
        expect(() => selector.subscribe(listener)).toThrowError(
          /Listener already subscribed/
        );
      });

      it("should not notify when state does not change", () => {
        selector.subscribe(listener);
        expect(counter).toEqual(0);
        // Henry - notify
        expect(store.update({ $set: { firstName: "Henry" } })).toEqual({
          modified: true,
          fields: ["firstName"],
          notifyCount: 1
        });
        expect(counter).toEqual(1);
        // Kwame - notify
        expect(store.update({ $set: { firstName: "Kwame" } })).toEqual({
          modified: true,
          fields: ["firstName"],
          notifyCount: 1
        });
        expect(counter).toEqual(2);
        // Kwame - no notification
        expect(store.update({ $set: { firstName: "Kwame" } })).toEqual({
          modified: false
        });
        expect(counter).toEqual(2);
      });

      it("should remove listener on failure", () => {
        let counter2 = 0;
        selector.subscribe(_ => {
          counter2++;
          if (counter2 > 1) throw "stop here";
        });

        expect(counter2).toEqual(0);
        expect(store.update({ $set: { firstName: "Tiffany" } })).toEqual({
          modified: true,
          fields: ["firstName"],
          notifyCount: 1
        });
        expect(counter2).toEqual(1);

        // remove subscriber here.
        expect(store.update({ $set: { firstName: "Tighe" } })).toEqual({
          modified: true,
          fields: ["firstName"],
          notifyCount: 1
        });
        expect(counter2).toEqual(2);

        // no more notifications
        expect(store.update({ $set: { firstName: "Kwame" } })).toEqual({
          modified: true,
          fields: ["firstName"],
          notifyCount: 0
        });
        expect(counter2).toEqual(2);
      });

      it("should listen repeatedly for changes and notify", () => {
        const selector = store.select<Pick<Person, "firstName">>({
          firstName: 1
        });

        const unsub = selector.subscribe(listener);
        expect(counter).toEqual(0);

        expect(store.update({ $set: { firstName: "Kofi" } })).toEqual({
          modified: true,
          fields: ["firstName"],
          notifyCount: 1
        });
        expect(counter).toEqual(1);

        expect(store.update({ $set: { firstName: "Adwoa" } })).toEqual({
          modified: true,
          fields: ["firstName"],
          notifyCount: 1
        });
        expect(counter).toEqual(2);

        // update different part of object
        expect(store.update({ $push: { children: "Ama" } })).toEqual({
          modified: true,
          fields: ["children"],
          notifyCount: 0
        });
        // no notification
        expect(counter).toEqual(2);

        // remove subscriber
        unsub();
        // update previously subscribed
        expect(store.update({ $set: { firstName: "Kobby" } })).toEqual({
          modified: true,
          fields: ["firstName"],
          notifyCount: 0
        });
        // no notification
        expect(counter).toEqual(2);
      });
    });

    describe("subcribe with runOnce=true", () => {
      const opts = {
        runOnce: true
      };

      it("should fail if subscriber is already registered to listen repeatedly", () => {
        // register to listen repeatedly
        selector.subscribe(listener, opts);
        expect(() => selector.subscribe(listener, opts)).toThrowError(
          /Listener already subscribed/
        );
      });

      it("should cleanup on failure", () => {
        const unsub = selector.subscribe(() => {
          throw new Error();
        }, opts);

        expect(store.update({ $set: { firstName: "Amoah" } })).toEqual({
          modified: true,
          fields: ["firstName"],
          notifyCount: 1
        });
        expect(counter).toEqual(0);

        expect(store.update({ $set: { firstName: "John" } })).toEqual({
          modified: true,
          fields: ["firstName"],
          notifyCount: 0
        });

        // no-op
        unsub();
      });

      it("should subscribe once for change and notify", () => {
        const unsub = selector.subscribe(listener, opts);
        expect(counter).toEqual(0);

        // listen once
        expect(store.update({ $set: { firstName: "Amoah" } })).toEqual({
          modified: true,
          fields: ["firstName"],
          notifyCount: 1
        });
        expect(counter).toEqual(1);

        expect(store.update({ $set: { firstName: "Amoah" } })).toEqual({
          modified: false
        });
        expect(counter).toEqual(1);

        // no more notifications
        expect(store.update({ $set: { firstName: "Donkor" } })).toEqual({
          modified: true,
          fields: ["firstName"],
          notifyCount: 0
        });
        expect(counter).toEqual(1);
        expect(store.update({ $push: { children: "Ama" } })).toEqual({
          modified: true,
          fields: ["children"],
          notifyCount: 0
        });
        expect(counter).toEqual(1);

        // can still remove subscriber safely no-op since already removed automatically.
        unsub();
        expect(store.update({ $set: { firstName: "Odame" } })).toEqual({
          modified: true,
          fields: ["firstName"],
          notifyCount: 0
        });
        // still no notification
        expect(counter).toEqual(1);
      });
    });

    describe("subscribe with runImmediately=true", () => {
      const opts = { runImmediately: true };
      it("should notify immediately on subscription and then listen repeatedly", () => {
        expect(counter).toEqual(0);
        // notify on subscription
        selector.subscribe(listener, opts);
        expect(counter).toEqual(1);

        // do not notify. unselected field updated.
        store.update({ $set: { age: 27 } });
        expect(counter).toEqual(1);

        // notify again
        store.update({ $set: { firstName: "Clement" } });
        expect(counter).toEqual(2);
      });

      it("should notify only when condition passes", () => {
        const selector = store.select<Pick<Person, "age">>(
          { age: 1 },
          { age: { $gt: 25 } }
        );
        let counter = 0;
        selector.subscribe(_ => {
          counter++;
        }, opts);

        // notify on subscription.
        expect(counter).toEqual(1);

        // does not pass condition. notify to reflect change in condition.
        store.update({ $set: { age: 20 } });
        expect(counter).toEqual(2);

        // does not pass condition. last value has not changed
        store.update({ $set: { age: 24 } });
        expect(counter).toEqual(2);

        // notify subscriber. condition passes.
        store.update({ $set: { age: 40 } });
        expect(counter).toEqual(3);
      });

      it("should unsubscribe listener and bubble exception on error", () => {
        expect(() =>
          selector.subscribe(_ => {
            throw new Error("failed immediate invoke");
          }, opts)
        ).toThrowError(/failed immediate invoke/);

        // subscriber was removed.
        selector.notifyAll();
      });
    });

    describe("getState", () => {
      it("should return a frozen object", () => {
        const obj = store
          .select<{ fullName: string }>({
            fullName: { $concat: ["$firstName", " ", "$lastName"] }
          })
          .getState()!;

        expect(() => {
          obj.fullName = "Josh";
        }).toThrow();
      });

      it("should select derived field", () => {
        const selector = store.select<{ fullName: string }>({
          fullName: { $concat: ["$firstName", " ", "$lastName"] }
        });
        expect(selector.getState()).toEqual({ fullName: "Kwame Osei" });
      });

      it("should select field based on condition", () => {
        // children only when parent is over 30+ years
        const store = createStore({
          age: 30,
          children: ["Luke"]
        });
        const selector = store.select<{ secondChild: string }>(
          { secondChild: "$children.1" },
          { age: { $lt: 25 } }
        );
        let n = 0;
        selector.subscribe(_ => {
          n++;
        });

        // failed condition
        expect(selector.getState()).toBeUndefined();

        store.update({ $set: { age: 20 } });
        // no second child yet.
        expect(selector.getState()).toEqual({});
        expect(n).toEqual(1); // notified

        store.update({ $push: { children: "Adrian" } });
        expect(selector.getState()).toEqual({ secondChild: "Adrian" });
        expect(n).toEqual(2); // notified

        store.update({ $set: { age: 35 } });
        expect(selector.getState()).toBeUndefined();
        expect(n).toEqual(3); // notified

        store.update({ $set: { age: 40 } });
        expect(n).toEqual(3); // no notification
      });
    });
  });
});
