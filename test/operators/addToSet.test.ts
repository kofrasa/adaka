import { $addToSet } from "../../src/_internal/operators";
import { UPDATE_OPTIONS } from "../helper";

describe("operators/addToSet", () => {
  it("Value to Add is An Array", () => {
    const state = { _id: 1, letters: ["a", "b"] };
    $addToSet(state, { letters: ["c", "d"] }, UPDATE_OPTIONS);
    expect(state).toEqual({ _id: 1, letters: ["a", "b", ["c", "d"]] });
  });

  it("Value to Add is a Document", () => {
    const state = {
      _id: 1,
      item: "polarizing_filter",
      tags: ["electronics", "camera"]
    };
    $addToSet(state, { tags: "accessories" }, UPDATE_OPTIONS);
    $addToSet(state, { tags: "camera" }, UPDATE_OPTIONS);
    expect(state).toEqual({
      _id: 1,
      item: "polarizing_filter",
      tags: ["electronics", "camera", "accessories"]
    });
  });

  it("Add with $each Modifier", () => {
    const state = { _id: 2, item: "cable", tags: ["electronics", "supplies"] };
    $addToSet(
      state,
      { tags: { $each: ["camera", "electronics", "accessories"] } },
      UPDATE_OPTIONS
    );
    expect(state).toEqual({
      _id: 2,
      item: "cable",
      tags: ["electronics", "supplies", "camera", "accessories"]
    });
  });
});
