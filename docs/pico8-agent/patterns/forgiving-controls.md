# Forgiving controls

These are transferable design proposals, not universal rules or copied implementations.

## Purpose

Make a deliberate action survive a small input-timing error. Useful for platforming; not a substitute for reachable geometry.

## Implementation

Track a brief jump buffer after a fresh press and a brief grace window after leaving ground. Consume both on a successful jump. Convert seconds to ticks at the actual update rate. Keep jump release behavior explicit.

## Tuning experiment

Starting experiment at 60 Hz: buffer 4 ticks, grace 5 ticks. These are our example parameters, not measured universal optima. Change one window at a time.

## Failure modes

Too-long windows create surprise jumps; stale buffers can jump after respawn. Clear them on reset. Do not let grace grant repeated midair jumps.

## Verification

Replay early press before landing, a late press after an edge, release/repress and continuous hold. Check failure outside the window as well as success inside it.

Read through read_reference: case/celeste-classic; recipe/spring-courier.
