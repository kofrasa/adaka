import { $mul } from "../../src/_internal/operators";
import { UPDATE_OPTIONS } from "../helper";

describe("operators/mul", () => {
  it("Multiply the Value of a Field", () => {
    const state = { _id: 1, item: "Hats", price: 10.99, quantity: 25 };
    $mul(
      state,
      {
        price: 1.25,
        quantity: 2
      },
      UPDATE_OPTIONS
    );
    expect(state).toEqual({
      _id: 1,
      item: "Hats",
      price: 13.7375,
      quantity: 50
    });
  });

  it("Apply $mul Operator to a Non-existing Field", () => {
    const state = { _id: 2, item: "Unknown" };
    $mul(
      state,
      {
        price: 100
      },
      UPDATE_OPTIONS
    );

    expect(state).toEqual({ _id: 2, item: "Unknown", price: 0 });
  });
});
