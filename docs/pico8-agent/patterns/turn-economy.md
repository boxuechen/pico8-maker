# Explicit turn economy

These are transferable design proposals, not universal rules or copied implementations.

## Purpose

Make action costs predictable in grid-based games.

## Implementation

Resolve input to one action, validate it, then commit world changes once. Decide whether blocked moves consume a turn. Keep animation clocks separate from simulation turns. Communicate wait as an intentional action.

## Tuning experiment

The vault charges one fuel for each valid move or wait. Each optional gem costs two additional fuel, stated above the board. Blocked moves and idle frames are free. A dangerous row resolves after the player action, then the next warning appears.

## Failure modes

Animation callbacks can accidentally run the enemy twice. Auto-repeat can spend several turns on one held key. Avoid ambiguous cancel or inventory costs.

## Verification

Check idle, wall bump, valid move, wait and fresh versus held input. Verify the same action list creates the same logical state regardless of idle frames inserted.

Related references (optional): /extensions/pico8/cases/porklike.md; /extensions/pico8/games/lantern-vault.lua.
