# 生成提示词

工具：内置 image_gen；未使用 CLI/API fallback。

## 状态 1

Use case: ui-mockup. Create one realistic, production-quality desktop web-app UI design, 1440 x 1024, Chinese-language AI game creation workspace. This is the FIRST STATE of a consistent three-state flow: user playtesting and preparing to request a fix. Create ONE full screen, no collage, browser chrome, device frame or perspective.

Design brief: users chat to create, run, observe and improve small PICO-8 games. The key demonstration is a character unable to jump over a wall. Prioritize the game, understandable AI actions, and a clear handoff between human and AI. Use crisp Chinese typography like Noto Sans SC, normal 15-16px body text (not pixel fonts outside game), dark ink, warm near-white surfaces, subtle gray dividers, elegant restrained teal accent. Native polished productivity app, precise spacing, few borders, no nested cards, no gradients, no giant marketing headings, no dashboard statistics.

FIXED LAYOUT TO REUSE: full-width 64px top bar. Top left small restrained square pixel icon then "游戏工作台", divider, project name "越过高墙" with "v1". Right "模型已连接" with small green dot, settings icon, quiet button "导出". Below, left conversation panel takes 35% width (about 500px), right game stage takes 65%, separated by thin vertical line. Left panel header "创作对话"; large comfortable content space and fixed bottom composer. Right header shows game title "越过高墙", subtle secondary "试玩并告诉 AI 你的想法", and small teal status "你在试玩". Game canvas is precisely square 512x512, centered in right region, starting around y=205. Below the square a compact controls strip, under that modest reserved result/evidence area, no unnecessary cards. Main interface reaches full viewport edges.

GAME INVARIANTS: draw a clear coherent 128x128 pixel-art side-view platformer, upscaled nearest-neighbor to 512px square. Deep indigo/charcoal sky, a few distant subtle pixel stars, layered dark background silhouettes. Ground across whole bottom at y=108 in game coordinates, emerald grass top and dark blue stone below. An orange/red brick wall with visible chunky brick pixels at game x=72..84, y=72..108 (36px tall). Right beyond wall a small golden flag at x=111. Small expressive mint-green square robot protagonist with pale eye pixels around x=55, on ground immediately before wall; no jump trail in this state. Solid obstacle understandable at a glance. Keep all terrain, wall, flag positions and art consistent for next states.

LEFT CONTENT: tiny assistant identity "AI"; message "先试玩一下，试着跳过前方的墙。遇到问题，直接告诉我。" One restrained inline suggested-prompt chip below, "帮我修复跳跃". Avoid filling the left panel with prose. At composer bottom show typed unsent request exactly "角色跳不过这堵墙，帮我修复。" A small attach-image icon and a clear teal send arrow button. Helper under composer "Enter 发送 · Shift + Enter 换行".
GAME CONTROLS: small keycaps with left/right arrows and label "移动", keycap "X" label "跳跃"; quiet restart icon plus "重新开始". Under controls place a quiet single-line hint "点击游戏画面开始操作". No progress charts, no success card yet.
This is a visual design concept, no real testing claims beyond the designed UI. No dates, API key text, code editor or version sidebar. Focus on balanced usable spacing, legible Chinese and exceptional game-stage hierarchy.

## 状态 2

Use case: ui-mockup. Edit the supplied UI design into the SECOND STATE, named "AI 测试", of the SAME Chinese desktop game-creation workspace. This is not an alternative style: preserve the reference's layout, typography, colors, panel widths, game canvas size and position, top bar, icons, terrain, brick wall, flag, background and protagonist design exactly. Target design dimensions 1440 x 1024, preserve reference aspect ratio. One full-screen UI mockup only; no collage, browser/device frame, perspective, explanatory labels outside UI.

Create realistic, production-quality UI design with clear hierarchy, readable 15-16px Chinese typography, generous spacing, one primary action, and minimal borders. Preserve the white app surface, thin gray dividers, restrained teal accents and dark indigo pixel game. No new navigation, dashboards or feature inventory.

Change only the following state-specific content:
1. Top bar version changes from "v1" to "v2". Keep "模型已连接", settings and export.
2. Game header secondary copy becomes "正在验证修改后的跳跃". Right header status becomes amber "AI 正在测试". Add a small clear outlined control "停止并接管" near this status while fitting the existing header.
3. The game character is airborne just above the top edge of the SAME orange brick wall, moving right. Its feet are slightly above wall top. Do not move/change the wall, ground, golden flag, stars, mountains or robot appearance. Add a restrained faint dotted trajectory behind robot as a test overlay, not new game geometry.
4. Left conversation replaces introductory message with a compact sent user message exactly "角色跳不过这堵墙，帮我修复。" followed by assistant text "我会先复现问题，再验证修改结果。"
Then a clean vertical action timeline, left-aligned without nested cards:
- completed check "复现问题"; subline "角色撞到墙侧面，未能越过。" Include one modest actual-looking thumbnail of the same game's earlier failed jump, clearly labeled "修复前".
- completed check "调整跳跃"; subline "已更新跳跃初速度。" with restrained text link "查看修改".
- active amber progress glyph "验证修改"; subline "正在执行相同的移动与跳跃操作…". Current step visually clearest, no fake percentage, no success claim.
Keep this within left panel with realistic whitespace and no clipped text.
5. Bottom composer is same location/size, now empty with placeholder "继续描述你的想法…" and square stop control instead of send arrow. Text under it "AI 测试中 · 可随时停止".
6. Under-game control strip keeps same keycaps and restart positions. Right arrow and X keycaps lightly teal-highlighted to convey AI simulated input. Helper becomes "AI 正在操作 · 你的键盘输入已暂停". Keep screen uncluttered.

All test claims are illustrative content within a UI DESIGN MOCKUP, not actual executed results. No dates or secrets. Ensure Chinese text is accurate and legible and the visual continuity with reference is exceptionally strong.

## 状态 3

Use case: ui-mockup. Edit the supplied SECOND-state UI into the THIRD STATE named "修复完成". Same Chinese desktop AI game creation workspace, target 1440 x 1024, same aspect ratio. This is one state in a sequence, not an alternative design. Preserve the reference's exact full-width header, 35/65 split, Chinese typography, colors, game canvas size and position, subtle dividers, background, terrain, wall and flag. One realistic, production-quality full-screen UI design, no device/browser chrome, no collage.

Keep white UI, dark indigo pixel-art game and restrained teal accent. Clear hierarchy, readable Chinese, generous spacing. Show a completed fix and invite user to play. Current version remains "v2", top-right remains "模型已连接", settings and export. Game header secondary text becomes "修复已验证，现在轮到你了". The previous amber test label changes to a green check label "验证通过"; remove "停止并接管" now that testing is complete.

Inside the exact same square game frame: keep the same orange wall unchanged at its existing position and height, ground unchanged, same stars and mountains and golden flag. Move the SAME mint robot to the ground to the RIGHT of the wall, just left of the golden flag, visibly fully landed with feet on grass. Remove all trajectory dots. Exactly one robot. No confetti, no reward screens, no success text embedded in game.

Left conversation:
- Show a compact, right-aligned pale teal USER bubble labeled "你" with text "角色跳不过这堵墙，帮我修复。". Do NOT attribute this user message to AI.
- Below, AI identity and short response "已修复。角色能够越过墙，并安全落地。"
- Compact action timeline of three steps, all completed with teal check circles:
  "复现问题" — "修复前：角色未能越过墙。"
  "调整跳跃" — "已更新跳跃初速度。" with text link "查看修改".
  "验证通过" — "使用相同操作，成功越墙并落地。"
Below timeline, an understated evidence summary with two plain rows separated by a light rule, not a dashboard:
  "修复前  v1" with muted amber text "未通过"
  "修复后  v2" with teal text "通过"
Small quiet link "回放本次测试". No fake charts, timestamps, metrics or additional feature cards.
Keep bottom composer at exactly same location, placeholder "继续描述你的想法…" and restore teal send arrow (not stop). Helper "Enter 发送 · Shift + Enter 换行".

UNDER GAME, replace prior keyboard-controls strip with compact completion/handoff area within same remaining space:
- First line teal check and exactly "已验证：成功越过墙并安全落地"
- Second line quiet action "修复前后对比", quiet action "撤销修改", and a large clear teal PRIMARY button "亲自试玩" on the right.
The primary button should be the most obvious UI action after looking at the game. Preserve ample bottom padding, no clipping. This screen awaits the user clicking to take keyboard control.
All completion claims are illustrative copy for a DESIGN MOCKUP, not actual execution results. Do not add dates, secrets, code editor or sidebar. Keep it consistent with reference and polished for a live demo presentation.

## 测试态修订

Use case: ui-mockup correction. Image 1 is the EDIT TARGET: "AI 正在测试" state. Image 2 is a CONSISTENCY REFERENCE ONLY showing correct user-versus-AI message attribution. Return just one corrected version of Image 1 at its original aspect ratio, target design 1440x1024.

Make ONLY two focused corrections to Image 1, keep all other UI, text, game artwork, canvas position/size, column widths, controls, header, testing status, colors, and game robot above wall EXACTLY unchanged:
1) The sentence "角色跳不过这堵墙，帮我修复。" is from the USER, not AI. Remove the AI icon/AI label currently above that bubble. Right-align that pale-teal bubble within the left conversation panel and add a tiny "你" label at its upper right, as in Image 2. The response "我会先复现问题，再验证修改结果。" is AI's response: give that gray bubble a modest AI label/icon before it. Fit in existing space, preserve action timeline and composer positions, do not crowd.
2) The small thumbnail under "复现问题" labeled "修复前" must show a SINGLE mint robot failing to jump, immediately against the LEFT SIDE of the orange wall, its feet above ground but its head BELOW wall top. Remove the extra ghost/robot above the wall in that thumbnail. Keep wall, ground, flag and background unchanged. Exactly one robot inside that thumbnail. The main game canvas still shows the successful attempt being tested with ONE robot airborne above the wall and dotted trail.
This is a visual design mockup only. Do not transform it into the completed state of Image 2. Do not change version, amber status or progress step. Chinese typography remains sharp and clear.
