// just-bash's browser bundle imports node:zlib for gzip/gunzip commands only.
// The shell flow does not offer them; fail plainly if a command reaches here.
const unavailable = () => {
  throw new Error("gzip is not available in this shell");
};
export const constants = {};
export const gzipSync = unavailable;
export const gunzipSync = unavailable;
