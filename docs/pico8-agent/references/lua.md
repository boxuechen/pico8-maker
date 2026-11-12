# P8 Lua, tables, math and strings

Optional parameters appear in brackets below. Use PICO-8 APIs rather than assuming a general-purpose Lua standard library or host filesystem.

## Language

Use local, function, table, if/elseif/else, for/while and return. P8 Lua supports shorthand such as +=. Equality is ==, inequality ~=, and concatenation uses `..`. Only false and nil are false; zero and empty strings are true. Arrays conventionally start at 1, while resource IDs and most machine APIs start at 0. Do not rely on # for sparse tables or on pairs ordering.

Use _init for data initialization, _update/_update60 for simulation and _draw for rendering. Recipes include complete programs. Lua sprite/audio data belongs in source so assets survive export and reload.

## Tables

| Call | Result / behavior |
| --- | --- |
| add(t,value[,index]) | Insert and return value |
| del(t,value) | Remove first matching value, compact array, return removed value; not an index |
| deli(t[,index]) | Remove by index, default last item |
| count(t[,value]) | Count entries or matches |
| all(t) | Iterator for array values |
| foreach(t,fn) | Call fn for each array item |
| pairs(t) / ipairs(t) | Key/value iteration / consecutive integer iteration stopping at nil |
| unpack(t[,i,j]) | Multiple return values from a range |

For numeric-index deletion iterate backwards to avoid skipping shifted elements. PICO all supports common delete-current-item patterns.

## Math

| Call | Meaning |
| --- | --- |
| min(a,b), max(a,b) | Smaller/larger |
| mid(a,b,c) | Middle value; mid(lo,x,hi) clamps |
| flr(x), ceil(x) | Floor/ceiling; floor of a negative number is not truncation |
| abs(x), sgn(x) | Absolute value/sign; sgn(0)=1 |
| sqrt(x) | Square root |
| cos(turn), sin(turn) | Turn-based trig; sin(0.25)=-1 |
| atan2(dx,dy) | Direction in turns; move with cos(a), sin(a) |
| rnd(n) | Random value in [0,n); flr(rnd(n)) for an integer |
| rnd(t) | Random array element; handle empty arrays |
| srand(seed) | Set random sequence seed |

Fixed-point intermediates overflow too: dx*dx+dy*dy can overflow even when coordinates are valid. Scale values first. Bound long-running scores/timers; do not assume unbounded integers.

Bit functions: band, bor, bxor, bnot; shl, shr (arithmetic), lshr (logical), rotl, rotr. Operators include &, |, ^^, ~, <<, >>, >>>, <<>, >><. They operate on fixed-point bit representations. For byte packing, small integer arithmetic is often clearer.

## Strings and other Lua facilities

| Call | Meaning |
| --- | --- |
| sub(s,i[,j]) | 1-based inclusive substring; negative indices count from end |
| split(s[,separator,convert_numbers]) | Array of parts; pass false to retain text |
| tonum(s[,flags]) | Numeric parsing; pixel digit: tonum("0x"..ch); check failure |
| tostr(value[,flags]) | String conversion, with optional numeric-format flags |
| chr(code,...) | Construct byte/P8SCII string |
| ord(s[,index,count]) | Character codes, potentially multiple results |
| type(v) | Type name |
| select(index,...) | Select variadic results; select("#",...) counts them |
| assert(condition[,message]) | Fail with a runtime diagnostic |

Metatables: setmetatable/getmetatable. Raw operations: rawget/rawset/rawequal/rawlen. Coroutines: cocreate/coresume/costatus/yield. Ordinary games should prefer callbacks; Lua suspension does not imply host operations such as flip or cart switching are valid in nested coroutines.

Use ASCII hex digits for pixel rows. Default game text uses P8SCII, not an arbitrary Unicode font. A Chinese conversation does not mean the built-in game font supports Chinese text.
