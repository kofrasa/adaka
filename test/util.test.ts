import {
  cloneFrozen,
  extractKeyPaths,
  sameAncestor
} from "../src/_internal/util";

describe("store", () => {
  describe("cloneFrozen", () => {
    it("should return same value for primitive", () => {
      expect(cloneFrozen("a")).toEqual("a");
      expect(cloneFrozen(2.5)).toEqual(2.5);
      expect(cloneFrozen(true)).toEqual(true);
      expect(cloneFrozen(null)).toEqual(null);
    });

    it("should freeze deeply nested objects", () => {
      const o = cloneFrozen({ a: { b: { c: 1 } } });
      expect(() => {
        o.a.b.c = 4;
      }).toThrowError();
      const a = cloneFrozen([{}, "hello", 5]);
      expect(() => {
        a[1] = "world";
      }).toThrowError();
    });
  });
  describe("sameAncestor", () => {
    it.each([
      ["a", "a"],
      ["a.b", "a.b"],
      ["a.b", "a.b.c"],
      ["a.b.c", "a.b"],
      ["a.b", "a.b.c.d"],
      ["a.b.c.d", "a.b"]
    ])("should have common ancestor for %p and %p", (a, b) => {
      expect(sameAncestor([a], b)).toBe(true);
    });

    it.each([
      ["a", "b"],
      ["a.b", "b.a"],
      ["a.b.c", "a.c.b"],
      ["a.c.e", "a.a.c"],
      ["a.b.d.d", "a.b.c.d"],
      ["a.e.c.d", "a.b.c.d"]
    ])("should NOT have common ancestor for %p and %p", (a, b) => {
      expect(sameAncestor([a], b)).toBe(false);
    });
  });

  describe("extractKeyPaths", () => {
    it.each([
      [["friend"], "$friend"],
      [["name"], { name: "henry" }],
      [["frank"], { $and: ["john", "$frank"] }],
      [[], { $literal: { $literal: "$hero" } }],
      [
        ["price", "qty"],
        {
          $expr: {
            $lt: [
              {
                $cond: {
                  if: { $gte: ["$qty", 100] },
                  then: { $multiply: ["$price", 0.5] },
                  else: { $multiply: ["$price", 0.7] }
                }
              },
              5
            ]
          }
        }
      ],
      [["x"], { $expr: { $eq: [{ $divide: [1, "$x"] }, 3] } }],
      [
        ["results.product", "results.score"],
        { results: { $elemMatch: { product: "xyz", score: { $gte: 8 } } } }
      ],
      [["tags"], { $and: [{ tags: "ssl" }, { tags: "security" }] }],
      [
        ["item", "discount", "qty"],
        {
          item: 1,
          discount: {
            $cond: [{ $gte: ["$qty", 250] }, 30, 20]
          }
        }
      ],
      [
        ["message", "scores", "total"],
        {
          $switch: {
            branches: [
              {
                case: { $gte: [{ $avg: "$scores" }, 90] },
                then: "Doing great!"
              },
              {
                case: {
                  $and: [
                    { $gte: [{ $avg: "$scores" }, 80] },
                    { $lt: [{ $avg: "$total" }, 90] }
                  ]
                },
                then: "Doing pretty well."
              },
              {
                case: { $lt: [{ $avg: "$scores" }, 80] },
                then: "$message"
              }
            ],
            default: "No scores found."
          }
        }
      ],
      [
        [],
        {
          $filter: {
            input: [1, "a", 2, null, 3.1, 4, "5"],
            as: "num",
            cond: { $and: [{ $gte: ["$$num", 3] }, { $gte: ["$$num", 5] }] },
            limit: { $add: [0, 1] }
          }
        }
      ],
      [
        ["quizzes"],
        {
          $map: {
            input: "$quizzes",
            as: "grade",
            in: { $add: ["$$grade", 2] }
          }
        }
      ],
      [
        ["items"],
        {
          $filter: {
            input: "$items",
            as: "item",
            cond: { $gte: ["$$item.price", 100] },
            limit: 1
          }
        }
      ],
      [
        ["quantity", "details.make", "details.model", "tags"],
        {
          $set: {
            quantity: 500,
            details: { model: "2600", make: "Fashionaires" },
            tags: ["coats", "outerwear", "clothing"]
          }
        }
      ],
      [
        ["quantity", "metrics.orders"],
        { $inc: { quantity: -2, "metrics.orders": 1 } }
      ]
    ])("should return %p for %j", (expected, input) => {
      const actual = Array.from(extractKeyPaths(input));
      actual.sort();
      expected.sort();
      expect(actual).toEqual(expected);
    });
  });
});
