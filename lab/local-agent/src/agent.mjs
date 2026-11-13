// One agent run in process: stock Pi session, Pi's default system prompt, the
// pico8 skill expanded into the first message exactly as Pi's /skill: command
// does (with virtual locations), and tools backed by the agent environment.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { SKILL } from "./env.mjs";
import { piTools } from "./pi-tools.mjs";

const stripFrontmatter = (text) => text.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();

/** Same block Pi builds for `/skill:pico8 <task>`, pointing at the virtual skill directory. */
export function skillPrompt(skillMd, task) {
  return `<skill name="pico8" location="${SKILL}/SKILL.md">\nReferences are relative to ${SKILL}.\n\n${stripFrontmatter(skillMd)}\n</skill>\n\n${task}`;
}

/** Stock Pi session over the environment's tools; nothing touches the host but a temp agentDir. */
export async function openSession({ env, model, thinking = "high" }) {
  const agentDir = mkdtempSync(join(tmpdir(), "lab-pi-"));
  const modelRuntime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: model.modelsPath ?? join(agentDir, "models.json"),
  });
  if (model.apiKey) await modelRuntime.setRuntimeApiKey(model.provider, model.apiKey);
  const resolved = modelRuntime.getModel(model.provider, model.id);
  if (!resolved) throw new Error(`unknown model ${model.provider}/${model.id}`);
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: true, maxRetries: 2 } });
  const resourceLoader = new DefaultResourceLoader({
    cwd: env.cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await resourceLoader.reload();
  const { session } = await createAgentSession({
    cwd: env.cwd,
    agentDir,
    model: resolved,
    thinkingLevel: thinking,
    modelRuntime,
    resourceLoader,
    settingsManager,
    sessionManager: SessionManager.inMemory(env.cwd),
    tools: ["read", "edit", "write", "bash"],
    customTools: piTools(env),
  });
  return session;
}

/** The exact system prompt Pi sends for this environment (the browser run reuses it). */
export async function piSystemPrompt(env, model) {
  const session = await openSession({ env, model });
  try {
    return session.systemPrompt;
  } finally {
    session.dispose();
  }
}

/**
 * @param env from createEnvironment()
 * @param model { provider, id, apiKey?, modelsPath? }
 * @returns { status: "done" | "timeout" | "error", events, seconds, error? }
 */
export async function runAgent({ env, prompt, model, thinking = "high", timeMs = 600000, onEvent }) {
  const session = await openSession({ env, model, thinking });
  const events = [];
  const unsubscribe = session.subscribe((e) => {
    if (e.type === "message_end") events.push(e);
    onEvent?.(e);
  });
  const t0 = Date.now();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    session.abort().catch(() => {});
  }, timeMs);
  try {
    await session.prompt(prompt);
    return { status: timedOut ? "timeout" : "done", events, seconds: Math.round((Date.now() - t0) / 1000) };
  } catch (error) {
    return { status: timedOut ? "timeout" : "error", error: String(error?.message ?? error), events, seconds: Math.round((Date.now() - t0) / 1000) };
  } finally {
    clearTimeout(timer);
    unsubscribe();
    session.dispose();
  }
}
