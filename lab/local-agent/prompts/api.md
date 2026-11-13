PICO-8 API (most used). Numbers are 16.16 fixed point: range -32768..32767.

Callbacks: _init() once; _update() 30 fps (or _update60() 60 fps); _draw() every frame.

Input:
- btn(b) true while button b is held; btnp(b) true on the frame it is pressed (repeats when held). b: 0 left, 1 right, 2 up, 3 down, 4 O, 5 X.

Drawing (c = colour 0-15):
- cls(c) clear the screen
- pset(x,y,c) one pixel; pget(x,y) read a pixel
- line(x0,y0,x1,y1,c)
- rect(x0,y0,x1,y1,c) outline; rectfill(x0,y0,x1,y1,c) filled
- circ(x,y,r,c) outline; circfill(x,y,r,c) filled
- oval(x0,y0,x1,y1,c); ovalfill(x0,y0,x1,y1,c)
- print(str,x,y,c) text; each character is 4 px wide, 6 px tall
- spr(n,x,y) draw sprite n (only if sprites exist; prefer shapes)
- camera(x,y) offset drawing; camera() resets
- pal(c0,c1) swap colours; pal() resets

Colours: 0 black, 1 dark blue, 2 dark purple, 3 dark green, 4 brown, 5 dark grey, 6 light grey, 7 white, 8 red, 9 orange, 10 yellow, 11 green, 12 blue, 13 lavender, 14 pink, 15 peach.

Math:
- flr(x) round down; ceil(x); abs(x); sgn(x); min(a,b); max(a,b); mid(a,b,c) clamp
- rnd(n) random 0<=r<n; rnd(tbl) random element; srand(seed)
- sqrt(x); sin(t) cos(t) with t in turns (0..1), sin is inverted for screen y
- atan2(dx,dy) angle in turns
- a\b integer divide; a%b modulo

Tables:
- add(t,v) append; del(t,v) remove value; deli(t,i) remove index; count(t) or #t length
- for v in all(t) do ... end  (safe to del(t,v) while iterating)
- foreach(t,f); pairs(t); ipairs(t)

Strings: s1..s2 join; #s length; sub(s,i,j); tostr(n); tonum(s); chr(n); ord(s)

Sound (built-in bank):
- sfx(0) pickup, sfx(1) shoot, sfx(2) hit, sfx(3) win, sfx(4) lose, sfx(5) jump, sfx(6) blip, sfx(7) explode
- sfx(-1) stop all sound

Time and misc: t() seconds since start; stat(n) system info; printh(str) debug log; stop() halts the cart (do not use).

Lua syntax notes: x+=1 and x-=1 work; != and ~= both mean not equal; comments start with --; use local for temporaries inside functions.
