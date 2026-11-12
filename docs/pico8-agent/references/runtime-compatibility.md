# Browser runtime differences

- Keep game source and native resources in the current cart. The host has no writable guest cart filesystem. Console commands such as save, folder, ls, resume, reboot and info are unavailable.
- Guest load depends on a host-authorized local cart bundle. Prefer self-contained carts. Use run or stop only when the requested behavior needs them. Prefer standard update/draw callbacks over custom flip loops.
- printh and extcmd do not write files, record media or access the system. Use returned diagnostics and visual evidence for playtesting.
- stat is a partial local profile. Use time() for the simulation clock and read /extensions/pico8/references/input-system.md for covered audio and input selectors. Prefer directly observed behavior over assuming an undocumented stat value.
- menuitem supports five VM-local slots. Serial I/O is unavailable. Test saves live in a separate in-memory Worker. Check any required save lifecycle explicitly.
- Tool token counts, frame instruction counts and startup checks describe this host. Test official cart compatibility separately when required.
