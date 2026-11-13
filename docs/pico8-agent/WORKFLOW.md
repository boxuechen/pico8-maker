# Workflow

Use the relevant parts directly for creation, editing, resources and playtests. Preserve user constraints. Read references only for specific uncertainties.

## Create

Choose the repeated action, goal, player choice and round progression. Expression or discovery can be the payoff for a relaxing toy; do not force danger or loss. Use reasonable defaults for vague requests and briefly state the direction. Consult /extensions/pico8/references/game-design.md if the loop or tradeoff is unclear.

Build a small complete loop first: action, visible response, reward or consequence, and a reason for the next action. Include enough visual feedback to judge it. Separate update from draw and use the MACHINE reset skeleton for round state.

Prepare Lua and native resources together. Pass complete Lua to load_game for a new game or rewrite. Inspect diagnostics, warnings and PNG, then play the loop before expanding content. Try a plausible first action: can a new player identify the target, control and result? Compare ordinary play with an obvious shortcut for challenges, or check visible variation for relaxing games. Fix the clearest observed problem, recheck it, then finish the requested scope.

## Edit

Read current source and inspect the affected moment. Translate feedback into an observable target: meaningful choice, distinguishable objects or reliable input. Use a reasonable interpretation; ask only when alternatives materially change the result. Preserve unrelated rules, resources and progress.

Use edit with unique oldText blocks from the current read; all blocks refer to the same original source. If matching fails, reread before retrying. Call load_game without source to commit the drafts. Repair failed loads in the retained draft. Use this sequence for repairs during creation too.

Compare the affected moment before/after and check nearby effects using known inputs. For difficulty, compare plausible strategies or starts rather than one lucky run. For visuals, compare the same scene at native scale. The preview preserves the version before this request. Keep focused edits and their checks scoped.

## Resources

Inspect target slots or map regions with read_assets; check occupied IDs before allocating new ones. Batch scoped changes with edit_assets, preserving unrelated flags, resources and Lua. Sprite rows use hexadecimal colors with 0 transparent; map patches are rectangular; SFX/music edits replace slots. Use native resources for static data.

Use PNG previews for authored sprites/maps and check their in-game appearance when integration matters. For asset-only tasks, commit with load_game and inspect the affected display. Commit combined source/resources when ready. Load, reset and input results list sfx()/music() starts with the channel used; overMusic marks an effect taking a music channel. Use these events to verify that each sound fires at its moment without cutting music. Listening quality stays in the unverified delivery item.

Read /extensions/pico8/references/asset-authoring.md for formats and examples. Consult /extensions/pico8/references/audio.md or /extensions/pico8/references/sprites-maps.md for specific implementation questions.

## Playtest

Define the expected result. On the final committed version:

1. Read counters, boards or entities with inspect_game read to plan inputs. Use existing globals, or bounded printh/targeted views for local-only state. Reuse PNGs from load/reset/input.
2. Start a fresh normal route with reset_game and exercise the core action/feedback loop. Batch predictable steps; tap:true separates presses and capture:true samples meaningful intermediate transitions. Use separate calls when the next action depends on the result. Check execution.completedFrames and outcome.
3. For a new short finite game, reach victory through normal input and retry on the final rules. Check restored counters, entities, timers and progress, and the applicable failure path. For sandboxes/endless games, check requested goals and restart without inventing victory. Test-only requests report findings without edits.
4. Inject failure/boundary conditions with inspect_game debug instead of editing source. A debug chunk that runs marks the entire route debug; one that fails to compile changes nothing. Debug changes state without update/draw; advance input to obtain a new frame. After an executed error, timeout or STOP you can still read state, then reset before more input; start fresh for further normal evidence.

Each new load_game version reports how many normal-input routes its revision has; earlier routes belong to earlier revisions. Tie evidence to committed revision, run and frameId; staleFrame marks an image older than an injection. Recheck affected routes after relevant code/resource changes. Never weaken victory conditions or prefill progress in source merely to pass a test. An injected win does not replace the normal route.

After the first playable version, aim to obtain core evidence within about 12 verification calls. This is a planning reminder, not a stop limit. Combine observations, read state or batch inputs as calls grow. Continue necessary checks; report the specific gap if unresolved. Examples: /extensions/pico8/references/playtest.md.

## Readability

Judge the 128x128 composition even though model PNGs are enlarged ×4 (imageScale); crop regions and ASCII use native coordinates. Use low-contrast backgrounds, clear silhouettes and outlines for small objects, and shape/animation as well as color. Separate HUD text from scenery. Reserve bright accents for useful information. Check startup and a representative crowded or result frame.

Separate important objects from the background by brightness, not only hue: dark objects on light ground or light objects on dark ground. Keep backgrounds and large surfaces muted, give the player and interactive targets different accent colors, and outline small objects with the opposite brightness.

| Role | Dark scene | Light or warm scene |
| --- | --- | --- |
| Background | 0 black, 1 dark blue | 15 light peach, 6 light gray |
| Environment | 5 dark gray, 2 dark purple | 13 gray purple, 3 dark green |
| Player | 7 off white | 1 dark blue, 0 black |
| Interactive targets | 10 yellow, 11 bright green | 8 red, 12 blue |
| Outline / HUD text | 0 black / 7 off white | 0 black / 1 dark blue |

These are starting points; choose colors that suit the theme and inspect contrast in the PNG. Avoid dark purple objects on dark scenery or bright, busy grass behind small collectibles. Use outline and shape to distinguish similar hues. Use small ASCII crops for exact pixel questions; read state for board contents and counters.

## Delivery

Use four short items in the user's language for game changes and playtest reports: Gameplay / Controls / Verified / Unverified. Describe the final behavior, controls, checked paths and coverage gaps. For focused edits, gameplay or controls may be unchanged. Separate normal input from debug checks in Verified; put untested audio, missing normal routes or unfinished requested behavior in Unverified. If no relevant gap remains, say so briefly.

Answer explanations and plans directly. Finish when relevant checks pass; avoid further tools without a concrete question.
