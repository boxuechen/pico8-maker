// The only import path from the lab into Maker. Keep this list small: the
// player runtime, pure cart/codec helpers, the shell-flow p8 core (shared with
// Maker so the lab measures the code Maker runs) and the S4 evaluation tasks/oracle.
// Never import game.js, agent.js, Maker tools or the knowledge package here.
import { createPico8Session } from "../../../app/public/player/main/player.mjs";
import { setSessionFactory } from "../../../app/src/pico8/shell/runtime.js";

setSessionFactory(createPico8Session);

export { createPico8Session };
export { cartBytes, cartText } from "../../../app/src/pico8/cart.js";
export { editAssets, emptySnapshot } from "../../../app/src/pico8/assets.js";
export { countTokens, TOKEN_LIMIT } from "../../../app/src/pico8/tokens.js";
export { compactInspected } from "../../../app/src/pico8/observation.js";
export { runP8, TEMPLATE_DIR } from "../../../app/src/pico8/shell/p8.js";
export { checkSource, explainFault, loadCasesText, parsePress, scoreSource } from "../../../app/src/pico8/shell/checks.js";
export { BUTTONS, Runtime } from "../../../app/src/pico8/shell/runtime.js";
export { SOUNDS, soundAssets, withSoundBank } from "../../../app/src/pico8/shell/sounds.js";
export { applyResourceFiles, assetFiles, RESOURCE_FILES } from "../../../app/src/pico8/shell/resource-files.js";
export { p8Host, portSender, remoteP8 } from "../../../app/src/pico8/shell/p8-remote.js";
export { durableEnv } from "../../../app/src/pico8/shell/durable-env.js";
export { posix } from "../../../app/src/pico8/shell/posix-path.js";
export const SKILL_DIR = new URL("../../../app/src/pico8/shell/skill/", import.meta.url).pathname;
export {
  shooterCases,
  shooterContract,
  shooterSource,
} from "../../../app/scripts/evaluation/shooter-case.mjs";
export { verifyShooter } from "../../../app/scripts/evaluation/shooter-oracle.mjs";
