import { $min } from "../../src/_internal/operators";
import { UPDATE_OPTIONS } from "../helper";

describe("operators/min", () => {
  it("should use $min to compare values", () => {
    const state = { _id: 1, highScore: 800, lowScore: 200 };
    $min(state, { lowScore: 150 }, [], UPDATE_OPTIONS);
    expect(state).toEqual({ _id: 1, highScore: 800, lowScore: 150 });
  });
});
