# Coordinate art and audio around events

These are transferable design proposals, not universal rules or copied implementations.

## Purpose

Make important state transitions recognizable without overwhelming the playfield.

## Implementation

For each event choose a visual cue, sound cue and optional motion response. Prefer a distinct silhouette/pose and timing over color alone. Reserve channels so frequent SFX do not erase the music.

## Tuning experiment

Example layout: music on channel 0, feedback on 3. Use different pitch contours for pickup, hurt and success. Tune duration before increasing volume or shake.

## Failure modes

More particles can hide hazards. Loud repeating steps can mask damage. PCM activity confirms synthesis, not pleasantness; do not claim a listening review from RAM checks.

## Verification

Disable sound and verify critical states remain readable; inspect audio channel continuity and non-silent PCM. Have a human compare feedback intensity and perceived clarity.

Related references (optional): /extensions/pico8/cases/just-one-boss.md; /extensions/pico8/references/audio.md; all three microgame recipes.
