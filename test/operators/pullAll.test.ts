import { $pullAll } from "../../src/_internal/operators";
import { UPDATE_OPTIONS } from "../helper";

describe("operators/pullAll", () => {
  it("should $pullAll matching values", () => {
    const state = { _id: 1, scores: [0, 2, 5, 5, 1, 0] };
    $pullAll(state, { scores: [0, 5] }, UPDATE_OPTIONS);
    expect(state).toEqual({ _id: 1, scores: [2, 1] });
  });
});
