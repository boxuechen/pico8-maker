const int = (minimum, maximum, description) => ({
  type: "integer",
  minimum,
  maximum,
  ...(description ? { description } : {}),
});
const object = (properties, required) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const array = (items, minItems, maxItems) => ({
  type: "array",
  items,
  minItems,
  maxItems,
});
const kind = (name) => ({ type: "string", enum: [name] });
const flag = { type: "boolean" };
export const readAssetsSchema = object(
  {
    version: {
      type: "string",
      enum: ["draft", "committed"],
      description: "Defaults to draft. committed requires a playable version.",
    },
    format: {
      type: "string",
      enum: ["data", "png", "both"],
      description: "Defaults to data. png/both support sprite and map reads.",
    },
    kind: {
      type: "string",
      enum: ["sprite", "map", "sfx", "music"],
      description: "Omit for an inventory of used slots.",
    },
    id: int(
      0,
      255,
      "Required for sprite/sfx/music; sfx and music ids are 0–63.",
    ),
    count: int(1, 16, "Default 1. SFX max 4, other slot kinds max 16."),
    x: int(0, 127),
    y: int(0, 31),
    width: int(1, 32),
    height: int(1, 32),
  },
  [],
);
export const editAssetsSchema = object(
  {
    edits: array(
      {
        anyOf: [
          object(
            {
              kind: kind("sprite"),
              id: int(0, 255),
              rows: {
                ...array({ type: "string", pattern: "^[0-9a-f]{8}$" }, 8, 8),
                description:
                  'Exactly 8 strings of 8 lowercase hex digits, one palette index per pixel (0 is transparent by default), e.g. "00077000".',
              },
              flags: int(
                0,
                255,
                "Whole 8-bit sprite flag mask; omit to preserve.",
              ),
            },
            ["kind", "id"],
          ),
          object(
            {
              kind: kind("map"),
              x: int(0, 127),
              y: int(0, 31),
              rows: array(array(int(0, 255), 1, 32), 1, 32),
            },
            ["kind", "x", "y", "rows"],
          ),
          object(
            {
              kind: kind("sfx"),
              id: int(0, 63),
              speed: int(1, 255),
              loopStart: int(0, 31),
              loopEnd: int(
                0,
                32,
                "0 disables looping; otherwise must exceed loopStart.",
              ),
              notes: array(
                object(
                  {
                    pitch: int(0, 63),
                    waveform: int(0, 7),
                    volume: int(0, 7),
                    effect: int(0, 7),
                  },
                  ["pitch", "waveform", "volume", "effect"],
                ),
                0,
                32,
              ),
            },
            ["kind", "id", "speed", "notes"],
          ),
          object(
            {
              kind: kind("music"),
              id: int(0, 63),
              channels: array({ anyOf: [int(0, 63), { type: "null" }] }, 4, 4),
              loopStart: flag,
              loopEnd: flag,
              stop: flag,
            },
            ["kind", "id", "channels"],
          ),
        ],
      },
      1,
      64,
    ),
  },
  ["edits"],
);
