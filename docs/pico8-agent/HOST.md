# Current host

The application now installs the pico8 extension with English knowledge sections and read_reference. Host capability text is generated from app/src/pico8/capabilities.js.

- Complete Lua submissions may initialize sprites, maps, SFX and music; exported source retains this initialization.
- Five game tools remain: read_game, load_game, reset_game, press_buttons and observe_game.
- Test input is player 0, up to 120 logical frames. Other game tools return PNG. observe_game defaults to PNG and supports ascii/both with optional {x,y,width,height} cropping at original resolution. ASCII includes all 16 actual display-slot color names, RGB values and display codes. Invalid regions fail; no completed frame is reported without stepping.
- Test and live player sessions are independent. Test persistence is memory; destroying its Worker loses that instance.
- No live-variable query or model audio return is available.
- Reference reads use the bundled pack and do not operate the game or access the network.
