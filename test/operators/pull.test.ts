import { $pull } from "../../src/_internal/operators";
import { UPDATE_OPTIONS } from "../helper";

describe("operators/pull", () => {
  it("Remove All Items That Equal a Specified Value", () => {
    const state = {
      _id: 1,
      fruits: ["apples", "pears", "oranges", "grapes", "bananas"],
      vegetables: ["carrots", "celery", "squash", "carrots"]
    };
    $pull(
      state,
      { fruits: { $in: ["apples", "oranges"] }, vegetables: "carrots" },
      UPDATE_OPTIONS
    );
    expect(state).toEqual({
      _id: 1,
      fruits: ["pears", "grapes", "bananas"],
      vegetables: ["celery", "squash"]
    });
  });

  it("Remove All Items That Match a Specified $pull Condition", () => {
    const state = { _id: 1, votes: [3, 5, 6, 7, 7, 8] };
    $pull(state, { votes: { $gte: 6 } }, UPDATE_OPTIONS);
    expect(state).toEqual({ _id: 1, votes: [3, 5] });
  });

  it("Remove Items from an Array of Documents", () => {
    const state = {
      _id: 1,
      results: [
        { item: "A", score: 5 },
        { item: "B", score: 8 }
      ]
    };
    $pull(state, { results: { score: 8, item: "B" } }, UPDATE_OPTIONS);
    expect(state).toEqual({ _id: 1, results: [{ item: "A", score: 5 }] });
  });
});
