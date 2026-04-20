import "./styles.css";
import { buildAppShell, setAppStateRef } from "./chat/render.ts";
import { connect, state } from "./chat/app.ts";

const root = document.getElementById("app");
if (!root) throw new Error("#app not found");

setAppStateRef({ state });
buildAppShell(root);
connect();
