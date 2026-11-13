import { useEffect, useMemo, useRef, useState } from "react";
import {
  assetSummary,
  decodeAssets,
  sprite,
  sound,
  music,
} from "./pico8/assets.js";
import { CartVersion } from "./CartVersion.jsx";
import { t, useLang } from "./i18n.js";
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
      aria-label={mode === "map" ? t("mapRoom", { n: page }) : t("spriteSheet")}
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
export function ResourcesView({ current, versionProps }) {
  useLang();
  const [spriteId, setSprite] = useState(0),
    [page, setPage] = useState(0),
    [sfxId, setSfx] = useState(0),
    [musicId, setMusic] = useState(0);
  const bytes = useMemo(() => decodeAssets(current.assets), [current.assets]);
  const summary = useMemo(() => assetSummary(current.assets), [current.assets]);
  const selectedSprite = sprite(bytes, spriteId),
    selectedSound = sound(bytes, sfxId),
    pattern = music(bytes, musicId);
  return (
    <section className="resources-view" aria-label={t("resources")}>
      <CartVersion title={t("viewResources")} {...versionProps} />
      <p className="resource-note">{t("readOnly")}</p>
      <div className="resource-stats">
        <span>{t("nSprites", { n: summary.sprites.length })}</span>
        <span>{t("nMapCells", { n: summary.mapCells })}</span>
        <span>{t("nSounds", { n: summary.sfx.length })}</span>
        <span>{t("nPatterns", { n: summary.music.length })}</span>
      </div>
      <div className="resource-grid">
        <section>
          <div className="resource-title">
            <h3>{t("sprites")}</h3>
            <Slots
              label={t("sprite")}
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
            {t("spriteFlags", {
              id: spriteId,
              flags: selectedSprite.flags.toString(2).padStart(8, "0"),
            })}
          </p>
        </section>
        <section>
          <div className="resource-title">
            <h3>{t("map")}</h3>
            <Slots
              label={t("room")}
              value={page}
              onChange={setPage}
              count={16}
            />
          </div>
          <Pixels bytes={bytes} mode="map" page={page} />
          <p className="resource-note">
            {t("mapNote", { x: (page % 8) * 16, y: Math.floor(page / 8) * 16 })}
            <br />
            {t("mapAuthored")}
          </p>
        </section>
      </div>
      <section className="resource-audio">
        <div className="resource-title">
          <h3>{t("soundEffects")}</h3>
          <Slots label="SFX" value={sfxId} onChange={setSfx} count={64} />
        </div>
        <div
          className="note-chart"
          role="img"
          aria-label={t("audibleNotes", {
            id: sfxId,
            n: selectedSound.notes.filter((n) => n.volume).length,
          })}
        >
          {selectedSound.notes.map((n, i) => (
            <span
              key={i}
              title={t("noteTitle", {
                i,
                pitch: n.pitch,
                wave: n.waveform,
                volume: n.volume,
                effect: n.effect,
              })}
              style={{
                height: `${4 + (n.pitch / 63) * 96}%`,
                opacity: n.volume ? 0.3 + n.volume / 10 : 0.08,
              }}
            />
          ))}
        </div>
        <p className="resource-note">
          {t("speed", { n: selectedSound.speed })} ·{" "}
          {selectedSound.loopEnd
            ? t("loop", {
                a: selectedSound.loopStart,
                b: selectedSound.loopEnd,
              })
            : t("noLoop")}{" "}
          · {t("notes32")}
        </p>
        <details>
          <summary>{t("noteData")}</summary>
          <div className="note-table">
            <table>
              <thead>
                <tr>
                  {t("noteCols").map((x) => (
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
          <h3>{t("music")}</h3>
          <Slots
            label={t("pattern")}
            value={musicId}
            onChange={setMusic}
            count={64}
          />
        </div>
        <div className="resource-stats">
          {pattern.channels.map((id, i) => (
            <span key={i}>
              CH {i}: {id === null ? t("channelOff") : `SFX ${id}`}
            </span>
          ))}
        </div>
        <p className="resource-note">
          {[
            pattern.loopStart && t("loopStart"),
            pattern.loopEnd && t("loopEnd"),
            pattern.stop && t("stopFlag"),
          ]
            .filter(Boolean)
            .join(" · ") || t("continueNext")}
          {t("audioHeard")}
        </p>
      </section>
    </section>
  );
}
