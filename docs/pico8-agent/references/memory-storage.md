# Memory, asset reconstruction and saves

## Memory API

| Call | Behavior |
| --- | --- |
| peek(address[,count]) | Read bytes, potentially multiple return values |
| poke(address,value,...) | Write consecutive bytes, low 8 bits each |
| peek2/poke2 | Little-endian 16-bit units |
| peek4/poke4 | Raw 32-bit fixed-point representation, not ordinary unsigned integer serialization |
| memcpy(dest,src,length) | Copy RAM; destination first |
| memset(dest,value,length) | Fill bytes; value precedes length |
| reload([dest,src,length,filename]) | Restore cart data into RAM |
| cstore(dest,src,length[,filename]) | Write RAM to cart-data target; external targets/lifetime depend on host |

Use sset/mset/fset for art where practical. Screen/sprite bytes pack two pixels, low nibble left. ASCII digit bytes cannot be copied directly as pixels. Check address ranges before clearing memory, especially cartdata at 0x5e00 and machine state at 0x5fxx.

## Asset lifetime

Source tables/strings are the asset definitions. _init writes them into RAM; spr/map/sfx/music use that RAM. Runtime edits affect the current run. Reinitialization reconstructs assets; permanent progress is stored separately and reapplied afterwards.

Current export builds a .p8 from source. cstore does not automatically add RAM changes to that exported Lua. Include initialization data in source. reload can replace generated resources with blank original cart data and does not rerun initialization.

## Save API and schema

cartdata(id) selects a namespace and returns whether existing data was loaded. Select once per cart execution. dget(index) reads a fixed-point value and dset(index,value) writes it, for slots 0–63, after cartdata. The mapped data occupies 256 bytes at 0x5e00–0x5eff.

Use a stable distinctive ID of at most 64 lowercase letters, digits or underscores. Change it once for an independently copied game, not on each source update. Do not include timestamps, random seeds or source hashes.

Slots store numbers, not arbitrary tables/strings. Document the layout, e.g. slot 0 schema version, slot 1 best score, remaining slots reserved. Bound scores to the numeric range. Unit/encoding changes require a schema migration.

Read recipe/save-high-score. It migrates schema 0 to 1 while preserving the old best, bounds best to 0–30000, and treats newer unknown schemas as read-only. X scores; O restarts the round without clearing best. It does not zero every slot or write every draw frame.

Migrate stepwise and preserve unknown slots. Do not erase user progress as a default repair. Handle corrupted data with a deliberate policy.

## Persistence checks

Distinguish round restart, same-session reset, same-session source reload, new session and browser refresh. Default manual sessions use memory persistence: same-instance reset can preserve data, destroying the instance does not. IndexedDB requires separate host configuration and browser lifecycle testing.

Project-source localStorage, game cartdata and Pi conversation storage are distinct. Verified recipe tests cover memory-session reset/reload, fresh-instance isolation, legacy migration and future-schema preservation, not browser refresh persistence.
