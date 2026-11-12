import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./demo.css";
import "./workbench.css";
import "./player-shell.css";

createRoot(document.getElementById("root")).render(<App />);
