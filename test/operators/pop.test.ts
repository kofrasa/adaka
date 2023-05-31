import { $pop } from "../../src/_internal/operators";
import { UPDATE_OPTIONS } from "../helper";

describe("operators/pop", () => {
  it("Remove the First Item of an Array", () => {
    const state = { _id: 1, scores: [8, 9, 10] };
    $pop(state, { scores: -1 }, [], UPDATE_OPTIONS);
    expect(state).toEqual({ _id: 1, scores: [9, 10] });
  });

  it("Remove the Last Item of an Array", () => {
    const state = { _id: 10, scores: [9, 10] };
    $pop(state, { scores: 1 }, [], UPDATE_OPTIONS);
    expect(state).toEqual({ _id: 10, scores: [9] });
  });
});
