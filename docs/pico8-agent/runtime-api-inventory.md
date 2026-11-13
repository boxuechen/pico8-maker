# Local Lua API catalog

All 113 entries from the local runtime inventory. Implementation status is distinct from bounded conformance evidence. Standard Lua helpers are not all enumerated here.

## system

| API / aliases | Implementation | Conformance | Evidence |
| --- | --- | --- | --- |
| `load` | implemented | compatible | tests/runtime/guest-load.test.mjs |
| `save` | unsupported | unsupported | inventory |
| `folder` | unsupported | unsupported | inventory |
| `ls` | unsupported | unsupported | inventory |
| `run` | implemented | compatible | tests/runtime/system-integration.test.mjs |
| `stop` | implemented | compatible | tests/runtime/system-integration.test.mjs |
| `resume` | unsupported | unsupported | inventory |
| `assert` | implemented | compatible | tests/runtime/system-integration.test.mjs |
| `reboot` | unsupported | unsupported | inventory |
| `reset` | implemented | compatible | tests/runtime/system-integration.test.mjs |
| `info` | unsupported | unsupported | inventory |
| `flip` | partial | partial | docs/compatibility.md |
| `printh` | partial | partial | tests/runtime/real-cart-gaps.test.mjs |
| `time, t` | implemented | compatible | tests/runtime/system-integration.test.mjs |
| `stat` | partial | partial | docs/compatibility.md |
| `extcmd` | partial | partial | tests/runtime/lua-language.test.mjs |

- `load`: caller-authorized local bundle only; root callback/custom swap, copied breadcrumb/parameter and atomic session replacement; accepts nested-host-suspend as a zero-side-effect Known Difference; arbitrary URL, filesystem and BBS remain unavailable

- `save`: player does not expose a writable virtual cart filesystem

- `run`: fresh root current-cart execution with a copy-owned parameter of at most 4096 bytes exposed by stat(6); nested calls are the accepted nested-host-suspend Known Difference

- `stop`: root execution stop with an optional copy-owned message of at most 4096 bytes; nested calls are the accepted nested-host-suspend Known Difference

- `resume`: console command rather than guest player capability

- `assert`: false conditions become structured E_VM_RUNTIME faults with phase, line and trace

- `reset`: guest reset of 0x5f00..0x5f7f and graphics-private defaults; distinct from host CartSession.reset

- `flip`: root custom-loop continuation is compatible; P5-KD-01 keeps single/multi-level guest-coroutine suspension as an explicit zero-side-effect nested-host-suspend Known Difference

- `printh`: browser-safe diagnostic-only subset: applies PICO-8 tostr conversion and writes to a bounded session-local log buffer exposed by readLogs; cart-selected filename, overwrite, desktop, clipboard and filesystem effects are intentionally unavailable

- `time`: committed logical-slice clock is exact across 30/60/custom and ordinary slow frames; it never reads host wall-clock

- `stat`: regression extends the typed deterministic profile to: 0 memory KiB; 1 CPU; 4 empty clipboard string; 6 parameter; 7/8/9 target FPS; 16..26 and 46..57 audio/music; 30..39 input; 80..85 and 90..95 numeric zero; 100/101 nil; 102 web platform; 110 and 120..122 booleans; every unlisted selector returns false

- `extcmd`: ADR-026 browser-safe profile accepts at most 256 command bytes into a bounded null sink; process, recording, window, clipboard, network and filesystem effects remain unsupported

## graphics

| API / aliases | Implementation | Conformance | Evidence |
| --- | --- | --- | --- |
| `clip` | implemented | compatible | tests/runtime/draw-state.test.mjs |
| `pset` | implemented | compatible | tests/runtime/draw-state.test.mjs |
| `pget` | implemented | compatible | tests/runtime/draw-state.test.mjs |
| `sget` | implemented | compatible | tests/runtime/sprites.test.mjs |
| `sset` | implemented | compatible | tests/runtime/sprites.test.mjs |
| `fget` | implemented | compatible | tests/runtime/sprites.test.mjs |
| `fset` | implemented | compatible | tests/runtime/sprites.test.mjs |
| `print` | partial | partial | docs/compatibility.md |
| `cursor` | implemented | compatible | tests/runtime/real-cart-gaps.test.mjs |
| `color` | implemented | compatible | tests/runtime/draw-state.test.mjs |
| `cls` | implemented | compatible | tests/runtime/lua-language.test.mjs |
| `camera` | implemented | compatible | tests/runtime/api-coercion.test.mjs |
| `circ` | implemented | compatible | tests/runtime/draw-state.test.mjs |
| `circfill` | implemented | compatible | tests/runtime/draw-state.test.mjs |
| `oval` | implemented | compatible | tests/runtime/draw-state.test.mjs |
| `ovalfill` | implemented | compatible | tests/runtime/draw-state.test.mjs |
| `line` | implemented | compatible | tests/runtime/draw-state.test.mjs |
| `rect` | implemented | compatible | tests/runtime/draw-state.test.mjs |
| `rectfill` | implemented | compatible | tests/runtime/draw-state.test.mjs |
| `rrect` | implemented | compatible | tests/runtime/graphics-memory-text.test.mjs |
| `rrectfill` | implemented | compatible | tests/runtime/graphics-memory-text.test.mjs |
| `pal` | implemented | compatible | tests/runtime/pal-table-compat.test.mjs |
| `palt` | implemented | compatible | tests/runtime/draw-state.test.mjs |
| `spr` | implemented | compatible | tests/runtime/sprites.test.mjs |
| `sspr` | implemented | compatible | tests/runtime/sprites.test.mjs |
| `fillp` | implemented | compatible | tests/runtime/draw-state.test.mjs |

- `print`: regression locks PICO tostr conversion for the first value; ordinary visual text, P8SCII controls, custom font and synchronous audio controls are supported; P4-KD-03 keeps timed delay suspension explicit because the root VM/scheduler contract has no such boundary

- `cursor`: generated host binding mutates draw-state RAM while a VM-local wrapper returns the previous x/y pair and cursor() resets to 0,0

- `cls`: host numeric lowering uses Lua coercion, including numeric and empty strings

- `camera`: RAM-backed set/reset is owned by the generated host binding; a VM-local wrapper returns the previous signed x/y pair

- `rrect`: bounded PICO-8 0.2.7 width/height, radius clamp, camera, clip, palette and fill-pattern profile

- `rrectfill`: bounded PICO-8 0.2.7 width/height, radius clamp, camera, clip, palette, fill-pattern and inversion profile

## table

| API / aliases | Implementation | Conformance | Evidence |
| --- | --- | --- | --- |
| `add` | implemented | compatible | tests/runtime/core-library.test.mjs |
| `del` | implemented | compatible | tests/runtime/core-library.test.mjs |
| `deli` | implemented | compatible | tests/runtime/core-library.test.mjs |
| `count` | implemented | compatible | tests/runtime/core-library.test.mjs |
| `all` | implemented | compatible | tests/runtime/api-coercion.test.mjs |
| `foreach` | implemented | compatible | tests/runtime/core-library.test.mjs |
| `unpack` | implemented | compatible | tests/runtime/lua-helpers.test.mjs |
| `pairs` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |

- `all`: table iteration preserves deletion behavior; string iteration yields one byte at a time; explicit nil and an absent argument are empty

- `unpack`: global alias of VM-local table.unpack with default/ranged/empty/nil-hole multi-return coverage

- `pairs`: mixed-key aggregation without order assumptions, empty/nil iteration, key/value returns, termination, __pairs and invalid input are covered by real-WASM Node/Chrome vectors

## input

| API / aliases | Implementation | Conformance | Evidence |
| --- | --- | --- | --- |
| `btn` | implemented | compatible | tests/runtime/controller-input.test.mjs |
| `btnp` | implemented | compatible | tests/runtime/lua-language.test.mjs |

- `btnp`: with a button returns boolean edge/repeat state; with no arguments returns the player 0/1 edge/repeat bitmask

## audio

| API / aliases | Implementation | Conformance | Evidence |
| --- | --- | --- | --- |
| `sfx` | implemented | compatible | tests/runtime/music-audio.test.mjs |
| `music` | implemented | compatible | tests/runtime/music-audio.test.mjs |

## map

| API / aliases | Implementation | Conformance | Evidence |
| --- | --- | --- | --- |
| `mget` | implemented | compatible | tests/runtime/map-tline.test.mjs |
| `mset` | implemented | compatible | tests/runtime/map-tline.test.mjs |
| `map` | implemented | compatible | tests/runtime/map-tline.test.mjs |
| `tline` | implemented | compatible | tests/runtime/map-tline.test.mjs |

- `tline`: project cart covers the default 13-bit and one-argument 16-bit source-coordinate profiles

## memory

| API / aliases | Implementation | Conformance | Evidence |
| --- | --- | --- | --- |
| `peek` | implemented | compatible | tests/runtime/memory-abi.test.mjs |
| `poke` | implemented | compatible | tests/runtime/lua-language.test.mjs |
| `peek2` | implemented | compatible | tests/runtime/memory-abi.test.mjs |
| `poke2` | implemented | compatible | tests/runtime/memory-abi.test.mjs |
| `peek4` | implemented | compatible | tests/runtime/memory-abi.test.mjs |
| `poke4` | implemented | compatible | tests/runtime/memory-abi.test.mjs |
| `memcpy` | implemented | compatible | tests/runtime/memory-abi.test.mjs |
| `reload` | implemented | compatible | tests/runtime/external-cart-data.test.mjs |
| `cstore` | implemented | compatible | tests/runtime/external-cart-data.test.mjs |
| `memset` | implemented | compatible | tests/runtime/memory-abi.test.mjs |

- `poke`: no value is a no-op; nil writes zero; finite varargs are preflight-bounded to 65536 values and wrap 16-bit guest addresses

- `reload`: current-cart synchronous path plus caller-authorized local external data/overlay read; accepts nested-host-suspend with zero repository access; no URL/filesystem/BBS fallback

- `cstore`: current-cart synchronous path plus call-point RAM snapshot into a caller-authorized target identity's Worker-local COW overlay; proves nested calls commit no overlay; no durable external write

## math

| API / aliases | Implementation | Conformance | Evidence |
| --- | --- | --- | --- |
| `max` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |
| `min` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |
| `mid` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |
| `flr` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |
| `ceil` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |
| `cos` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |
| `sin` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |
| `atan2` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |
| `sqrt` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |
| `abs` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |
| `sgn` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |
| `rnd` | implemented | compatible | tests/runtime/lua-language.test.mjs |
| `srand` | implemented | compatible | tests/runtime/core-library.test.mjs |

- `rnd`: fresh load and reset use a deterministic project seed; number/table and PICO hexadecimal string ranges use shared 0x5f44 state

## bitwise

| API / aliases | Implementation | Conformance | Evidence |
| --- | --- | --- | --- |
| `band` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |
| `bor` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |
| `bxor` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |
| `bnot` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |
| `shl` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |
| `shr` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |
| `lshr` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |
| `rotl` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |
| `rotr` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |

## menu

| API / aliases | Implementation | Conformance | Evidence |
| --- | --- | --- | --- |
| `menuitem` | implemented | compatible | tests/runtime/menu-label.test.mjs |

- `menuitem`: ADR-023/030: VM-local five-slot registration and callback lifetime; labels retain the 16-P8SCII-character display bound without turning longer input into a cart-fatal error; copied snapshot, L/R/X filter and argument, true keep-open, close/remove/replace/fault, generation cleanup and Canvas-external Chrome DOM menu are covered

## string

| API / aliases | Implementation | Conformance | Evidence |
| --- | --- | --- | --- |
| `tostr` | implemented | compatible | tests/runtime/graphics-memory-text.test.mjs |
| `tonum` | implemented | compatible | tests/runtime/graphics-memory-text.test.mjs |
| `chr` | implemented | compatible | tests/runtime/graphics-memory-text.test.mjs |
| `ord` | implemented | compatible | tests/runtime/graphics-memory-text.test.mjs |
| `sub` | implemented | compatible | tests/runtime/graphics-memory-text.test.mjs |
| `split` | implemented | compatible | tests/runtime/graphics-memory-text.test.mjs |
| `type` | implemented | compatible | tests/runtime/graphics-memory-text.test.mjs |

- `tostr`: manual default/nil and flags 1..3 examples locked in real WASM

- `tonum`: decimal, hex/raw flags, invalid fallback and boolean bounded profile

- `chr`: byte wrapping, embedded NUL byte-length and up to 8192 bounded values returned by the memory vector profile

- `ord`: index, nil failure and bounded multi-return profile

- `split`: default numeric conversion, retained empty fields, numeric grouping and literal mode

- `type`: nil, boolean, number, string, table, function and thread profile

## persistence

| API / aliases | Implementation | Conformance | Evidence |
| --- | --- | --- | --- |
| `cartdata` | implemented | compatible | tests/runtime/cartdata.test.mjs |
| `dget` | implemented | compatible | tests/runtime/lua-language.test.mjs |
| `dset` | implemented | compatible | tests/runtime/lua-language.test.mjs |

- `dget`: slots 0..63 return stored Q16 values; an out-of-range slot returns zero without a host exception

- `dset`: slots 0..63 update the mirror; an out-of-range slot is a no-op without dirtying persistence

## gpio

| API / aliases | Implementation | Conformance | Evidence |
| --- | --- | --- | --- |
| `serial` | unsupported | unsupported | inventory |

- `serial`: GPIO, serial and host bytestreams are outside the web player sandbox

## lua

| API / aliases | Implementation | Conformance | Evidence |
| --- | --- | --- | --- |
| `setmetatable` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |
| `getmetatable` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |
| `rawset` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |
| `rawget` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |
| `rawequal` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |
| `rawlen` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |
| `select` | implemented | compatible | tests/runtime/lua-standard-library.test.mjs |
| `cocreate` | implemented | compatible | tests/runtime/core-library.test.mjs |
| `coresume` | implemented | compatible | tests/runtime/core-library.test.mjs |
| `costatus` | implemented | compatible | tests/runtime/core-library.test.mjs |
| `yield` | implemented | compatible | tests/runtime/core-library.test.mjs |

- `cocreate`: guest coroutine alias; root frame-slice coroutine remains bridge-owned

- `coresume`: nested budget exhaustion remains a structured root runtime fault

- `yield`: guest nested-coroutine yield only; root flip/host suspension remains controlled by the bridge
