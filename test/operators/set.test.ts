import { $set } from "../../src/_internal/operators";
import { UPDATE_OPTIONS } from "../helper";

describe("operators/set", () => {
  it("Set Top-Level Fields", () => {
    const state = {
      _id: 100,
      quantity: 250,
      instock: true,
      reorder: false,
      details: { model: "14QQ", make: "Clothes Corp" },
      tags: ["apparel", "clothing"],
      ratings: [{ by: "Customer007", rating: 4 }]
    };
    $set(
      state,
      {
        quantity: 500,
        details: { model: "2600", make: "Fashionaires" },
        tags: ["coats", "outerwear", "clothing"]
      },
      UPDATE_OPTIONS
    );
    expect(state).toEqual({
      _id: 100,
      quantity: 500,
      instock: true,
      reorder: false,
      details: { model: "2600", make: "Fashionaires" },
      tags: ["coats", "outerwear", "clothing"],
      ratings: [{ by: "Customer007", rating: 4 }]
    });
  });

  it("Set Fields in Embedded Documents", () => {
    const state = {
      _id: 100,
      quantity: 500,
      instock: true,
      reorder: false,
      details: { model: "2600", make: "Fashionaires" },
      tags: ["coats", "outerwear", "clothing"],
      ratings: [{ by: "Customer007", rating: 4 }]
    };
    $set(state, { "details.make": "Kustom Kidz" }, UPDATE_OPTIONS);
    expect(state).toEqual({
      _id: 100,
      quantity: 500,
      instock: true,
      reorder: false,
      details: { model: "2600", make: "Kustom Kidz" },
      tags: ["coats", "outerwear", "clothing"],
      ratings: [{ by: "Customer007", rating: 4 }]
    });
  });

  it("Set Elements in Arrays", () => {
    const state = {
      _id: 100,
      quantity: 500,
      instock: true,
      reorder: false,
      details: { model: "2600", make: "Kustom Kidz" },
      tags: ["coats", "outerwear", "clothing"],
      ratings: [{ by: "Customer007", rating: 4 }]
    };
    $set(
      state,
      {
        "tags.1": "rain gear",
        "ratings.0.rating": 2
      },
      UPDATE_OPTIONS
    );
    expect(state).toEqual({
      _id: 100,
      quantity: 500,
      instock: true,
      reorder: false,
      details: { model: "2600", make: "Kustom Kidz" },
      tags: ["coats", "rain gear", "clothing"],
      ratings: [{ by: "Customer007", rating: 2 }]
    });
  });
});
