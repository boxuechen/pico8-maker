# Playtesting with p8: details

SKILL.md has the press syntax, the commands, the checks.json format and what to verify. This file adds the details.

## Presses and p8 run

- At most 3600 frames per token. `o` is the Z key in the browser, `x` the X key.
- Only globals can be read with `--read`; for locals use `printh(...)`, whose last 20 lines `p8 run` prints.
- Paths index lists by number: `g.enemies.1.x`. `--read "#g.bullets"` gives a length.

## --setup

```sh
p8 run --setup "g.lives=1 g.enemies={{x=60,y=100,vx=0}}" --press "wait*5" --read g.mode
```

Runs after `_init`, before the presses. Use it to reach a win, a loss, a late level or a rare event quickly and to check edge cases. Setup runs are never recorded as normal play: when a result was only reached with `--setup`, Maker says so, and the result belongs under Unverified until presses alone reach it.

## --bot

```sh
p8 run --bot "local f=g.fruits[1] if f then return f.x<g.basket.x and 1 or 2 end" --until "g.mode=='win'" --read g.score
p8 run --press "x" --bot "return 16" --until "g.mode~='play'" --frames 3600
```

`--press` is an optional prefix played first (leaving a title screen, say). The bot stops when `--until` is true or after `--frames` (default 1800, at most 3600). Only its buttons are kept: they are printed as a press string and replayed in a fresh session with presses only, and that replay is the result (recorded as normal play). A bot that changes state proves nothing, because the replay does not include the change. `--bot` cannot be combined with `--setup`.

## p8 look

The 32x32 picture shows the most common colour of each 4x4 block, so small objects can vanish; use `--crop` around them. In a `--png` image, divide positions by 4 for screen pixels. Example: `p8 look --setup "g.inv=30" --press wait*7 --crop 56,96,16,16` shows whether the player is drawn on that frame.

## More checks.json cases

```json
{"cases":[
 {"name":"starts with 3 lives","press":"wait","expect":[{"path":"g.lives","equals":3}]},
 {"name":"x restarts","setup":"g.mode='lose' g.wait=20","press":"x wait","expect":[{"path":"g.mode","equals":"play"},{"path":"g.lives","equals":3}]},
 {"name":"invincibility never exceeds 20","setup":"g.player.hp=1","press":"wait*200","expect":[{"path":"g.player.inv","atMost":20,"always":true}]}
]}
```

- Something that may flicker: check a few different frames (`wait*6`, `wait*7`) or use `"always": true`.
- `changes` compares with the value right after setup; it is not supported with `each`.
- When the user changes a rule a case checks, change that case's numbers to the new rule; do not delete it.
