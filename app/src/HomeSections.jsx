// Below-the-fold content in the official site's style: pixel art left, pink
// Proggy heading and short body copy right.
function BubbleArt() {
  return (
    <svg className="pixel-icon" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M4 4h24v2h2v14h-2v2H12l-4 4v-4H4v-2H2V6h2z" fill="#fff1e8" />
      <path d="M6 9h14v2H6zM6 13h18v2H6zM6 17h8v2H6z" fill="#1d2b53" />
      <path d="M16 17h2v2h-2z" fill="#ff77a8" />
    </svg>
  );
}
function PlaytestArt() {
  return (
    <svg className="pixel-icon" viewBox="0 0 128 128" aria-hidden="true">
      <rect width="128" height="128" fill="#1d2b53" />
      <path
        d="M12 20h1v1h-1zM30 44h1v1h-1zM52 14h1v1h-1zM70 32h1v1h-1zM96 18h1v1h-1zM118 40h1v1h-1z"
        fill="#83769c"
      />
      <path d="M0 100h128v3H0z" fill="#008751" />
      <path d="M0 103h128v25H0z" fill="#7e2553" />
      <path d="M78 72h12v28H78z" fill="#ffa300" />
      <path d="M78 78h12v1H78zM78 84h12v1H78zM78 90h12v1H78z" fill="#ab5236" />
      <path d="M112 78h1v22h-1z" fill="#c2c3c7" />
      <path d="M113 78h9v6h-9z" fill="#ffec27" />
      <path d="M72 54h8v8h-8z" fill="#00e436" />
      <path d="M74 56h1v2h-1zM77 56h1v2h-1z" fill="#1d2b53" />
      <path d="M50 82h3v3h-3zM58 70h3v3h-3zM66 62h3v3h-3z" fill="#ff77a8" />
      <path
        d="M2 2h14v3H5v11H2zM126 2h-14v3h11v11h3zM2 126h14v-3H5v-11H2zM126 126h-14v-3h11v-11h3z"
        fill="#ff77a8"
      />
    </svg>
  );
}
function CartArt() {
  return (
    <svg className="pixel-icon" viewBox="0 0 32 40" aria-hidden="true">
      <path d="M2 0h28v2h2v36h-2v2H2v-2H0V2h2z" fill="#5f574f" />
      <path d="M3 2h26v1H3z" fill="#83769c" />
      <path d="M4 5h24v20H4z" fill="#1d2b53" />
      <path d="M4 21h24v4H4z" fill="#7e2553" />
      <path d="M4 20h24v1H4z" fill="#008751" />
      <path d="M17 14h3v6h-3z" fill="#ffa300" />
      <path d="M23 15h1v5h-1zM24 15h2v1h-2z" fill="#c2c3c7" />
      <path d="M21 18h2v2h-2z" fill="#00e436" />
      <path d="M4 28h24v8H4z" fill="#3b3633" />
      <path d="M6 30h12v2H6zM6 33h8v1H6z" fill="#fff1e8" />
    </svg>
  );
}
const steps = [
  [
    BubbleArt,
    "Describe it",
    "One sentence is enough. Ask for a frog, a moon, a wall to jump over — the AI writes P8 Lua inside the real console limits.",
  ],
  [
    PlaytestArt,
    "AI playtests it",
    "It presses the buttons, watches real frames from the console and fixes what breaks before you ever touch it.",
  ],
  [
    CartArt,
    "Keep the cart",
    "Save a .p8 cartridge labelled with a frame from the playtest. Open it in PICO-8 and keep going.",
  ],
];
export function HowItWorks() {
  return (
    <section className="how-it-works" aria-labelledby="how-title">
      <h2 id="how-title">How it works</h2>
      <div className="how-steps">
        {steps.map(([Art, title, body]) => (
          <article key={title}>
            <span className="how-art">
              <Art />
            </span>
            <div>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
export function HomeFooter() {
  return (
    <footer className="home-footer">
      <span>DISPLAY 128×128 · 16 COLOURS · CODE P8 LUA · 8192 TOKENS</span>
      <span>
        Community carts by their original creators · An independent maker.
        PICO-8 is a trademark of Lexaloffle Games.
      </span>
    </footer>
  );
}
