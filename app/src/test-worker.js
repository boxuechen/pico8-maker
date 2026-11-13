let session, lib;
self.onmessage = async ({ data }) => {
  try {
    if (data.action === "init") {
      lib = await import(/* @vite-ignore */ data.url);
      self.postMessage({ id: data.id, result: true });
      return;
    }
    let result;
    if (data.action === "load") {
      await session?.dispose();
      session = await lib.createPico8Session({ inspection: true });
      result = await session.loadCart(data.cart);
    } else if (data.action === "observe") result = session.observe();
    else if (data.action === "inspect")
      result = {
        inspection: await session.inspect(data.request),
        observation: session.observe(),
      };
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
    if (result && typeof result === "object") {
      const observation = result.observation ?? result;
      observation.logs = session.readLogs();
    }
    self.postMessage({ id: data.id, result });
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message });
  }
};
