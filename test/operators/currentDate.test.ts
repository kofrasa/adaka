import { $currentDate } from "../../src/_internal/operators";
import { UPDATE_OPTIONS } from "../helper";

describe("operators/currentDate", () => {
  it("should set field to current date", () => {
    const state = { _id: 1, status: "a", lastModified: 100 };
    const past = state.lastModified;
    $currentDate(
      state,
      {
        lastModified: true,
        "cancellation.date": true
      },
      UPDATE_OPTIONS
    );
    expect(state.lastModified).toBeGreaterThan(past);
    expect(state["cancellation"]).toEqual({ date: state.lastModified });
  });
});
