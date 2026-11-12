import { defaultConfig, normalizeConfig } from "./model-config.js";

const key = "pico-demo-model";
export function readModelConfig(storage = localStorage) {
  try {
    return normalizeConfig(JSON.parse(storage.getItem(key) ?? "null"));
  } catch {
    return { ...defaultConfig };
  }
}
export function writeModelConfig(config, storage = localStorage) {
  if (config.remember !== false) storage.setItem(key, JSON.stringify(config));
  else clearModelConfig(storage);
}
export function clearModelConfig(storage = localStorage) {
  storage.removeItem(key);
}
