# Current host

The application now installs the pico8 extension with file-backed English knowledge sections and the built-in read tool. Host capability text is generated from app/src/pico8/capabilities.js. This document is a maintainer description, not a registered reference or an additional persistent model section. Workspace operations, tool schemas and session limits belong in the host section and tool descriptions, rather than being repeated in AGENT.md.

- Complete Lua submissions may initialize sprites, maps, SFX and music; exported source retains this initialization.
- The cart is one workspace file, /cart/main.lua. Game tools: read_game, load_game, reset_game, press_buttons and observe_game, plus built-in edit limited to main.lua and read for source and /extensions/pico8/ documentation. load_game takes optional complete source; without it, it commits the edited file. A failed load leaves the file uncommitted for fixing. There is no shell.
- Test input is player 0, up to 600 logical frames. Other game tools return PNG. observe_game defaults to PNG and supports ascii/both with optional {x,y,width,height} cropping at original resolution. ASCII includes all 16 actual display-slot color names, RGB values and display codes. Invalid regions fail; no completed frame is reported without stepping.
- Test and live player sessions are independent. Test persistence is memory; destroying its Worker loses that instance.
- No live-variable query or model audio return is available.
- Document reads use versioned static files, fetched on demand and cached across carts. They do not operate the game. /extensions/pico8/ is read-only; required entry documents load before a session opens.
