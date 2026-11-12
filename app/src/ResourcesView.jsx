import { useEffect, useMemo, useRef, useState } from "react";
import {
  assetSummary,
  decodeAssets,
  sprite,
  sound,
  music,
  sameSnapshot,
} from "./pico8/assets.js";
import { renderSheet, renderMap } from "./pico8/asset-preview.js";
function Pixels({ bytes, mode, page = 0, selected, onSelect }) {
  const ref = useRef(null);
  useEffect(() => {
    const context = ref.current.getContext("2d");
    const image =
      mode === "map"
        ? renderMap(bytes, {
            x: (page % 8) * 16,
            y: Math.floor(page / 8) * 16,
            width: 16,
            height: 16,
          })
        : renderSheet(bytes);
    context.putImageData(
      new ImageData(image.rgba, image.width, image.height),
      0,
      0,
    );
    if (mode === "sprites") {
      context.strokeStyle = "#ff77a8";
      context.lineWidth = 1;
      context.strokeRect(
        (selected % 16) * 8 + 0.5,
        Math.floor(selected / 16) * 8 + 0.5,
        7,
        7,
      );
    }
  }, [bytes, mode, page, selected]);
  return (
    <canvas
      ref={ref}
      width={128}
      height={128}
      aria-label={
        mode === "map"
          ? `Map room ${page}`
          : "Sprite sheet; select a sprite with the Sprite control"
      }
      onClick={
        onSelect
          ? (e) => {
              const r = e.currentTarget.getBoundingClientRect();
              onSelect(
                Math.min(
                  15,
                  Math.floor(((e.clientX - r.left) / r.width) * 16),
                ) +
                  Math.min(
                    15,
                    Math.floor(((e.clientY - r.top) / r.height) * 16),
                  ) *
                    16,
              );
            }
          : undefined
      }
    />
  );
}
function Slots({ label, value, onChange, count }) {
  return (
    <label>
      {label}{" "}
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {Array.from({ length: count }, (_, id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
    </label>
  );
}
export function ResourcesView({ draft, snapshot, revision, hasGame }) {
  const [committed, setCommitted] = useState(false);
  const [spriteId, setSprite] = useState(0),
    [page, setPage] = useState(0),
    [sfxId, setSfx] = useState(0),
    [musicId, setMusic] = useState(0);
  const current = committed && hasGame ? snapshot : draft;
  const bytes = useMemo(() => decodeAssets(current.assets), [current.assets]);
  const summary = useMemo(() => assetSummary(current.assets), [current.assets]);
  const selectedSprite = sprite(bytes, spriteId),
    selectedSound = sound(bytes, sfxId),
    pattern = music(bytes, musicId);
  return (
    <section className="resources-view" aria-label="Cartridge resources">
      <div className="resources-heading">
        <h2>Resources</h2>
        <label>
          Version{" "}
          <select
            value={committed && hasGame ? "committed" : "draft"}
            onChange={(e) => setCommitted(e.target.value === "committed")}
          >
            <option value="draft">Working draft</option>
            {hasGame && (
              <option value="committed">Committed v{revision}</option>
            )}
          </select>
        </label>
      </div>
      <p className="resource-note">
        {!committed && !sameSnapshot(draft, snapshot)
          ? "Uncommitted changes · preview and export use the committed cart."
          : "Source and resources are saved together."}{" "}
        Read-only preview. Ask the assistant to edit resources.
      </p>
      <div className="resource-stats">
        <span>{summary.sprites.length}/256 sprites</span>
        <span>{summary.mapCells} map cells</span>
        <span>{summary.sfx.length}/64 sounds</span>
        <span>{summary.music.length}/64 patterns</span>
      </div>
      <div className="resource-grid">
        <section>
          <div className="resource-title">
            <h3>Sprites</h3>
            <Slots
              label="Sprite"
              value={spriteId}
              onChange={setSprite}
              count={256}
            />
          </div>
          <Pixels
            bytes={bytes}
            mode="sprites"
            selected={spriteId}
            onSelect={setSprite}
          />
          <p className="resource-note">
            Sprite {spriteId} · flags{" "}
            {selectedSprite.flags.toString(2).padStart(8, "0")}
          </p>
        </section>
        <section>
          <div className="resource-title">
            <h3>Map</h3>
            <Slots label="Room" value={page} onChange={setPage} count={16} />
          </div>
          <Pixels bytes={bytes} mode="map" page={page} />
          <p className="resource-note">
            16×16 tiles · origin ({(page % 8) * 16}, {Math.floor(page / 8) * 16}
            )<br />
            Authored map: 128×32. Tile 0 is empty.
          </p>
        </section>
      </div>
      <section className="resource-audio">
        <div className="resource-title">
          <h3>Sound effects</h3>
          <Slots label="SFX" value={sfxId} onChange={setSfx} count={64} />
        </div>
        <div
          className="note-chart"
          role="img"
          aria-label={`SFX ${sfxId}: ${selectedSound.notes.filter((n) => n.volume).length} audible notes`}
        >
          {selectedSound.notes.map((n, i) => (
            <span
              key={i}
              title={`Note ${i}: pitch ${n.pitch}, wave ${n.waveform}, volume ${n.volume}, effect ${n.effect}`}
              style={{
                height: `${4 + (n.pitch / 63) * 96}%`,
                opacity: n.volume ? 0.3 + n.volume / 10 : 0.08,
              }}
            />
          ))}
        </div>
        <p className="resource-note">
          Speed {selectedSound.speed} ·{" "}
          {selectedSound.loopEnd
            ? `loop ${selectedSound.loopStart}–${selectedSound.loopEnd}`
            : "no loop"}{" "}
          · 32 notes
        </p>
        <details>
          <summary>Note data</summary>
          <div className="note-table">
            <table>
              <thead>
                <tr>
                  {["Note", "Pitch", "Wave", "Volume", "Effect"].map((x) => (
                    <th key={x}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedSound.notes.map((n, i) => (
                  <tr key={i}>
                    <td>{i}</td>
                    <td>{n.pitch}</td>
                    <td>{n.waveform}</td>
                    <td>{n.volume}</td>
                    <td>{n.effect}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <section className="resource-audio">
        <div className="resource-title">
          <h3>Music</h3>
          <Slots
            label="Pattern"
            value={musicId}
            onChange={setMusic}
            count={64}
          />
        </div>
        <div className="resource-stats">
          {pattern.channels.map((id, i) => (
            <span key={i}>
              CH {i}: {id === null ? "off" : `SFX ${id}`}
            </span>
          ))}
        </div>
        <p className="resource-note">
          {[
            pattern.loopStart && "loop start",
            pattern.loopEnd && "loop end",
            pattern.stop && "stop",
          ]
            .filter(Boolean)
            .join(" · ") || "Continue to next pattern"}
          . Audio is heard during gameplay.
        </p>
      </section>
    </section>
  );
}
