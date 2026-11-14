# Input, time, system and menus

## Button indices and p8 names

| Action | Lua button | `p8 --press` name |
| --- | --- | --- |
| Left | 0 | left |
| Right | 1 | right |
| Up | 2 | up |
| Down | 3 | down |
| O / Z | 4 | o |
| X | 5 | x |

btn tests held state; btnp includes new presses and automatic repeats. Hold two buttons at once with `right+x`. Player defaults to 0; p8 supplies only player 0.

## System API

| Call | Behavior |
| --- | --- |
| btn([i,p]) | Held button boolean; no button can return a bitfield; player defaults to 0 |
| btnp([i,p]) | New press and automatic repeat; use during update |
| time(), t() | Logical runtime seconds, not operating-system time |
| stat(selector) | Selector-dependent return type; unsupported selectors are not valid measurements |
| menuitem(index[,label,callback]) | Pause menu slots 1–5; omit label to remove; callback can receive button information |
| assert(condition[,message]) | Fail with runtime diagnostics |
| run([parameter]) | Restart cart execution |
| stop([message]) | Stop execution |
| reset() | Reset machine/draw state; not session reset or global-variable reinitialization |
| flip() | Frame boundary in custom loops; ordinary games should use callbacks |
| load(filename[,breadcrumb,parameter]) | Cart switch; requires host-supplied cart bundle, not arbitrary URL access |
| printh(text,...) | Printed in `p8 run` / `p8 look` output (last 20 lines); no file output |
| extcmd(command) | Platform commands; do not assume external recording/clipboard/network capabilities |

Console/platform entries such as save/folder/ls/resume/reboot/info/serial are listed in the API catalog. Normal game states (title/play/win/gameover) should be implemented in Lua with input transitions rather than depending on console/editor operations.

Useful local stat selectors: 0 memory KiB, 1 CPU fraction; 16–19 or 46–49 channel SFX IDs; 20–23 or 50–53 note positions; 24/54 music pattern, 25/55 pattern count, 26/56 music tick, 57 music-playing boolean.

p8 cannot query arbitrary stat values. A game may render a diagnostic HUD; development verification can instrument assertions. Neither implies a general live-variable tool exists.

For a fresh btnp edge, advance a release frame with buttons=0 before pressing again. Held movement uses btn; menu/grid input using btnp must account for repeats. To ignore automatic repeats, compare current btn with previous-frame state yourself. Test reset/focus/pause boundaries where relevant.
