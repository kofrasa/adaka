import { $max } from "../../src/_internal/operators";
import { UPDATE_OPTIONS } from "../helper";

describe("operators/max", () => {
  it("should use $max to compare values", () => {
    const state = { _id: 1, highScore: 800, lowScore: 200 };
    $max(state, { highScore: 950 }, [], UPDATE_OPTIONS);
    expect(state).toEqual({ _id: 1, highScore: 950, lowScore: 200 });
  });
});
