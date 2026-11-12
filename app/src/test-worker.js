let session;
self.onmessage = async ({ data }) => {
  try {
    if (data.action === "init") {
      const lib = await import(/* @vite-ignore */ data.url);
      session = await lib.createPico8Session();
      self.postMessage({ id: data.id, result: true });
      return;
    }
    let result;
    if (data.action === "load")
      result = await session.loadSource(data.source, {
        instructionBudget: 1000000,
      });
    else if (data.action === "reset") result = await session.reset();
    else if (data.action === "observe") result = session.observe();
    else if (data.action === "advance")
      result = await session.advance({
        frames: data.frames,
        input: {
          controllers: [data.buttons ?? 0, 0, 0, 0, 0, 0, 0, 0],
          devkit: {
            mouseXRaw: 0,
            mouseYRaw: 0,
            mouseButtons: 0,
            wheelRaw: 0,
            movementXRaw: 0,
            movementYRaw: 0,
            keypresses: [],
          },
        },
      });
    else throw new Error("Unknown test action");
    self.postMessage({ id: data.id, result });
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message });
  }
};
