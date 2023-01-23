import { expect, test, describe } from "vitest";

import { evalLayerAppearances, evalSimpleLayer } from ".";

test("evalSimpleLayer", async () => {
  expect(
    await evalSimpleLayer(
      {
        id: "x",
        type: "simple",
        data: {
          type: "geojson",
        },
        marker: {
          pointColor: "#FF0000",
          pointSize: { expression: { conditions: [["true", "1"]] } },
        },
      },
      {
        getAllFeatures: async () => [{ type: "feature", id: "a" }],
        getFeatures: async () => undefined,
      },
    ),
  ).toEqual({
    layer: {
      marker: {
        pointColor: "#FF0000",
        pointSize: 1,
      },
    },
    features: [
      {
        type: "computedFeature",
        id: "a",
        marker: {
          pointColor: "#FF0000",
          pointSize: 1,
        },
      },
    ],
  });
});

describe("Conditional styling", () => {
  test("conditions with variables from properties, members and Strictly Equals", () => {
    expect(
      evalLayerAppearances(
        {
          marker: {
            pointColor: "#FF0000",
            pointSize: {
              expression: {
                conditions: [
                  ["${id} === '2432432'", "2"],
                  ["true", "1"],
                ],
              },
            },
          },
        },
        {
          id: "x",
          type: "simple",
        },
        {
          type: "feature",
          id: "1233",
          properties: {
            id: "2432432",
          },
        },
      ),
    ).toEqual({
      marker: {
        pointColor: "#FF0000",
        pointSize: 2,
      },
    });
  });

  test("conditions with variables from feature, members and Strictly Equals", () => {
    expect(
      evalLayerAppearances(
        {
          marker: {
            pointColor: "#FF0000",
            pointSize: {
              expression: {
                conditions: [
                  ["${id} === '1233'", "4232"],
                  ["true", "1"],
                ],
              },
            },
          },
        },
        {
          id: "x",
          type: "simple",
        },
        {
          type: "feature",
          id: "1233",
          properties: {
            foo: "122",
          },
        },
      ),
    ).toEqual({
      marker: {
        pointColor: "#FF0000",
        pointSize: 4232,
      },
    });
  });

  test("conditions with variables, builtIn function and GreaterThan", () => {
    expect(
      evalLayerAppearances(
        {
          marker: {
            pointColor: {
              expression: {
                conditions: [
                  ["atan2(${GridY}, ${GridX}) > 0.0", "14343"],
                  ["true", "123232"],
                ],
              },
            },
            pointSize: 23213,
          },
        },
        {
          id: "x",
          type: "simple",
        },
        {
          type: "feature",
          id: "blah",
          properties: {
            GridY: 5,
            GridX: 5,
            properties: {
              id: "2432432",
            },
          },
        },
      ),
    ).toEqual({
      marker: {
        pointColor: 14343,
        pointSize: 23213,
      },
    });
  });

  test("Conditions with JSONPath, strictly equal and JSONPath result", () => {
    expect(
      evalLayerAppearances(
        {
          marker: {
            pointColor: "#FF0000",
            pointSize: {
              expression: {
                conditions: [
                  ["${$.phoneNumbers[:1].type} === 'iPhone'", "${$.age}"],
                  ["true", "1"],
                ],
              },
            },
          },
        },
        {
          id: "x",
          type: "simple",
        },
        {
          type: "feature",
          id: "blah",
          properties: {
            firstName: "John",
            lastName: "doe",
            age: 26,
            address: {
              streetAddress: "naist street",
              city: "Nara",
              postalCode: "630-0192",
            },
            phoneNumbers: [
              {
                type: "iPhone",
                number: "0123-4567-8888",
              },
              {
                type: "home",
                number: "0123-4567-8910",
              },
            ],
          },
        },
      ),
    ).toEqual({
      marker: {
        pointColor: "#FF0000",
        pointSize: 26,
      },
    });
  });

  test("Conditions with Color in HexCode", () => {
    expect(
      evalLayerAppearances(
        {
          marker: {
            pointSize: 26,
            pointColor: {
              expression: {
                conditions: [
                  ["${bgColor} === color('red')", "color('blue')"],
                  ["true", "color('white')"],
                ],
              },
            },
          },
        },
        {
          id: "x",
          type: "simple",
        },
        {
          type: "feature",
          id: "blah",
          properties: {
            bgColor: "#FF0000",
          },
        },
      ),
    ).toEqual({
      marker: {
        pointColor: "#0000FF", // blue
        pointSize: 26,
      },
    });
  });

  test("Expression with defines field in the layer", () => {
    expect(
      evalLayerAppearances(
        {
          marker: {
            pointSize: 26,
            pointColor: {
              expression: {
                conditions: [
                  ["(${NewHeight} >= 100.0)", "${HeightColor}"],
                  ["(${NewHeight} >= 1.0)", "color('#FF0000')"],
                  ["true", "color('blue')"],
                ],
              },
            },
          },
        },
        {
          id: "x",
          type: "simple",
          defines: {
            NewHeight: "${Height}/2.0",
            HeightColor: "color('#FF2000')",
          },
        },
        {
          type: "feature",
          id: "blah",
          properties: {
            bgColor: "#FF0000",
            Height: 200,
          },
        },
      ),
    ).toEqual({
      marker: {
        pointColor: "#FF2000", // blue
        pointSize: 26,
      },
    });
  });
});
