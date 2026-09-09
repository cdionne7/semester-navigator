import { createRoot } from "react-dom/client";
import Home from "../app/page";
import "../app/globals.css";
import { normalizePlan } from "../lib/plan-model.mjs";
const root = createRoot(document.getElementById("root")!);
async function start() {
  root.render(
    <main style={{ padding: "2rem" }}>
      <p>Opening your semester…</p>
    </main>,
  );
  try {
    const response = await fetch("/api/profile", { cache: "no-store" });
    if (!response.ok)
      throw new Error("Your student workspace could not be verified.");
    const result = (await response.json()) as { plan: unknown };
    root.render(<Home initialPlan={normalizePlan(result.plan)} />);
  } catch {
    root.render(
      <main style={{ padding: "2rem" }}>
        <h1>Your semester could not be opened</h1>
        <p>
          Keep your workspace open in ChatGPT and ask Semester Navigator to
          resume your dashboard.
        </p>
        <button onClick={() => void start()}>Try again</button>
      </main>,
    );
  }
}
void start();
