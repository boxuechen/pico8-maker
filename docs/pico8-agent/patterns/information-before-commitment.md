# Information before commitment

These are transferable design proposals, not universal rules or copied implementations.

## Purpose

Allow the player to understand what is being risked before an irreversible action.

## Implementation

Show the current state, predicted consequence where deterministic, and cost of information where uncertain. Keep known and unknown facts visually distinct. A preview must use the same rules as execution.

## Tuning experiment

Begin with deterministic hazard previews. Add randomness only with a defined distribution and meaningful ways to respond.

## Failure modes

A flashing warning that differs from the actual hitbox teaches distrust. Invented probability labels mislead. Do not reveal hidden outcomes accidentally through UI or sound.

## Verification

Compare preview and outcome for every relevant state. Test whether a cautious and a risky policy yield distinguishable outcomes, and whether the player can explain the tradeoff.

Read through read_reference: case/high-stakes; recipe/signal-arena; recipe/lantern-vault.
