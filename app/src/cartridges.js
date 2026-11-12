let embedded;
function library() {
  return (embedded ??= JSON.parse(
    document.getElementById("pico-cartridges").textContent,
  ));
}
export function cartridgeImage(id) {
  return `data:image/png;base64,${library()[id]}`;
}
export function cartridgeBytes(id) {
  const encoded = library()[id];
  if (!encoded) throw new Error("This cartridge is not bundled with the page.");
  return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
}
