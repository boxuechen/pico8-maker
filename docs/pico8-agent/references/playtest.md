# Gameplay verification

Load source and inspect initialization diagnostics. Establish a reproducible start and record source revision, session/generation and frame identity. Define observable success before sending input, then test the main action, boundaries/failure and retry.

Use short input batches near collisions or transitions. Explicitly release buttons to test new presses. Compare the same sequence before/after a repair. A completed operation or successful compile is not gameplay verification.

| Feature | Useful evidence |
| --- | --- |
| Sprite | Correct pixels, transparency, animation and movement alignment |
| Map | Wall blocking, reachability, collectible removal and count |
| SFX | Correct RAM, trigger channel and actual non-silent PCM |
| Music | Pattern progression/looping and independent sound-effect channel |
| Save | Correct value after the specific tested restart/reload lifecycle |

PNG supports overall visual inspection. ASCII/cropping are not currently available tool parameters. If introduced later, interpret frame dimensions, origin and palette legend explicitly. Color alone does not label game objects.

Separate observed pixels from source inference. Do not claim a hidden velocity or variable was measured without a tool/diagnostic exposing it. Manual test and live player instances have separate state.

Current model tools do not return audio. Local PCM checks do not prove subjective listening quality. Report only the persistence lifecycles actually tested. After cancellation or worker recreation, establish a new baseline rather than replaying unknown-outcome inputs.
