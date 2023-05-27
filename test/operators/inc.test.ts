import { $inc } from "../../src/_internal/operators";
import { UPDATE_OPTIONS } from "../helper";

describe("operators/inc", () => {
  it("should set field to current date", () => {
    const state = {
      _id: 1,
      sku: "abc123",
      quantity: 10,
      metrics: { orders: 2, ratings: 3.5 }
    };
    $inc(state, { quantity: -2, "metrics.orders": 1 }, UPDATE_OPTIONS);
    expect(state).toEqual({
      _id: 1,
      sku: "abc123",
      quantity: 8,
      metrics: { orders: 3, ratings: 3.5 }
    });
  });
});
