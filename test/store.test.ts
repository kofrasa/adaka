import { OperatorMap, OperatorType, useOperators } from "mingo/core";
import { $concat, $map, $trunc } from "mingo/operators/expression";

import { createStore, Selector, Store } from "../src";

// register new expresions
useOperators(OperatorType.EXPRESSION, {
  $trunc,
  $map,
  $concat
} as OperatorMap);

const noop = () => {
  return;
};

describe("store", () => {
  type Person = {
    firstName: string;
    lastName: string;
    age: number;
    children?: string[];
  };
  let store: Store<Person>;
  let selector: Selector<Pick<Person, "firstName">>;
  let counter = 0;
  const subscriber = (_: ReturnType<typeof selector.get>) => {
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

  describe("selector", () => {
    describe("notifyAll", () => {
      it("should notify all subscribers", () => {
        selector.listen(subscriber);
        expect(counter).toEqual(0);

        selector.notifyAll();
        expect(counter).toEqual(1);

        selector.notifyAll();
        expect(counter).toEqual(2);
      });
    });

    describe("removeAll", () => {
      it("should remove all listeners", () => {
        selector.listen(subscriber);
        expect(counter).toEqual(0);

        selector.notifyAll();
        expect(counter).toEqual(1);

        selector.removeAll();
        selector.notifyAll();
        expect(counter).toEqual(1);
      });
    });

    describe("listen", () => {
      it("should fail if subscriber is already registered to listen once", () => {
        // register to listen oncs
        selector.listenOnce(subscriber);
        expect(() => selector.listen(subscriber)).toThrowError(
          /Already subscribed to listen once/
        );
      });

      it("should not notify when state does not change", () => {
        selector.listen(subscriber);
        expect(counter).toEqual(0);
        // Henry - notify
        store.update({ $set: { firstName: "Henry" } });
        expect(counter).toEqual(1);
        // Kwame - notify
        store.update({ $set: { firstName: "Kwame" } });
        expect(counter).toEqual(2);
        // Kwame - no notification
        store.update({ $set: { firstName: "Kwame" } });
        expect(counter).toEqual(2);
      });

      it("should remove listener on failure", () => {
        let counter2 = 0;
        selector.listen(_ => {
          counter2++;
          if (counter2 > 1) throw "stop here";
        });

        expect(counter2).toEqual(0);
        store.update({ $set: { firstName: "Tiffany" } });
        expect(counter2).toEqual(1);

        // remove subscriber here.
        store.update({ $set: { firstName: "Tighe" } });
        expect(counter2).toEqual(2);

        // no more notifications
        store.update({ $set: { firstName: "Kwame" } });
        expect(counter2).toEqual(2);
      });

      it("should listen repeatedly for changes and notify", () => {
        const selector = store.select<Pick<Person, "firstName">>({
          firstName: 1
        });

        const unsub = selector.listen(subscriber);
        expect(counter).toEqual(0);

        store.update({ $set: { firstName: "Kofi" } });
        expect(counter).toEqual(1);

        store.update({ $set: { firstName: "Adwoa" } });
        expect(counter).toEqual(2);

        // update different part of object
        store.update({ $push: { children: "Ama" } });
        // no notification
        expect(counter).toEqual(2);

        // remove subscriber
        unsub();
        // update previously subscribed
        store.update({ $set: { firstName: "Kobby" } });
        // no notification
        expect(counter).toEqual(2);
      });
    });

    describe("listenOnce", () => {
      it("should fail if subscriber is already registered to listen repeatedly", () => {
        // register to listen repeatedly
        selector.listen(subscriber);
        expect(() => selector.listenOnce(subscriber)).toThrowError(
          /Already subscribed to listen repeatedly/
        );
      });

      it("should listen once for change and notify", () => {
        const unsub = selector.listenOnce(subscriber);
        expect(counter).toEqual(0);

        // listen once
        store.update({ $set: { firstName: "Amoah" } });
        expect(counter).toEqual(1);

        // no more notifications
        store.update({ $set: { firstName: "Donkor" } });
        expect(counter).toEqual(1);
        store.update({ $push: { children: "Ama" } });
        expect(counter).toEqual(1);

        // can still remove subscriber safely no-op since already removed automatically.
        unsub();
        store.update({ $set: { firstName: "Odame" } });
        // still no notification
        expect(counter).toEqual(1);
      });
    });

    describe("listenNow", () => {
      it("should notify immediately on subscription and then listen repeatedly", () => {
        expect(counter).toEqual(0);
        // notify on subscription
        selector.listenNow(subscriber);
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
        selector.listenNow(_ => {
          counter++;
        });

        // notify on subscription.
        expect(counter).toEqual(1);

        // does not pass condition. no notification.
        store.update({ $set: { age: 20 } });
        expect(counter).toEqual(1);

        // notify subscriber. condition passes.
        store.update({ $set: { age: 40 } });
        expect(counter).toEqual(2);
      });

      it("should unsubscribe listener and bubble exception on error", () => {
        expect(() =>
          selector.listenNow(_ => {
            throw new Error("failed immediate invoke");
          })
        ).toThrowError(/failed immediate invoke/);

        // subscriber was removed.
        selector.notifyAll();
      });
    });

    describe("get", () => {
      it("should select derived field", () => {
        const selector = store.select<{ fullName: string }>({
          fullName: { $concat: ["$firstName", " ", "$lastName"] }
        });
        expect(selector.get()).toEqual({ fullName: "Kwame Osei" });
      });

      it("should select field with condition", () => {
        // children only when parent is over 30+ years
        const selector = store.select<{ children: string[] }>(
          {
            children: 1
          },
          {
            age: { $gte: 30 }
          }
        );
        selector.listen(noop);
        expect(selector.get()).toEqual({ children: ["Bediako"] });

        store.update({ $set: { age: 25 } });
        expect(selector.get()).toBeUndefined();

        store.update({ $set: { age: 40 } });
        expect(selector.get()).toEqual({ children: ["Bediako"] });
      });
    });
  });
});
