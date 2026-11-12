# Telegraph, attack, recover

These are transferable design proposals, not universal rules or copied implementations.

## Purpose

Create an attack the player can anticipate, avoid and exploit.

## Implementation

Enter warning with a locked target. Show its future hit area. After a finite delay, activate exactly that area, then disable damage during recovery. Expose the vulnerable opportunity using shape/pose as well as color.

## Tuning experiment

In signal-arena, warning is 48/40/32 ticks across phases, active is 12, recovery is 60 at 60 Hz. Start long enough to teach; reduce only after a successful response.

## Failure modes

Tracking a player after the warning locks makes the cue misleading. Damage before the active state is unfair. A flash with no safe route is not a meaningful warning.

## Verification

Test staying in the lane, crossing during warning, leaving before activation and attacking during recovery. Assert the warning/active region does not change mid-cycle.

Related references (optional): /extensions/pico8/cases/just-one-boss.md; /extensions/pico8/games/signal-arena.lua.
