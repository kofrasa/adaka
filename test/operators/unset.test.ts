import { $unset } from "../../src/_internal/operators";
import { UPDATE_OPTIONS } from "../helper";

describe("operators/unset", () => {
  it("Unset Fields in the Object", () => {
    const state = { item: "chisel", sku: "C001", quantity: 4, instock: true };
    $unset(state, { quantity: "", instock: "" }, UPDATE_OPTIONS);
    expect(state).toEqual({
      item: "chisel",
      sku: "C001"
    });
  });
});
