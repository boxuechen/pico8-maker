// The production Agent with p8 in a Node worker_thread instead of a browser Worker.
import { Agent as BrowserAgent } from "../../src/agent.js";
import { startNodeP8Worker } from "../../scripts/evaluation/p8-worker-node.mjs";
export class Agent extends BrowserAgent {
  constructor(game, onUpdate, options = {}) {
    super(game, onUpdate, { startP8: startNodeP8Worker, ...options });
  }
}
