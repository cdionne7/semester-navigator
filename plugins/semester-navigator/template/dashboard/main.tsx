import { createRoot } from "react-dom/client";
import Home from "../app/page";
import "../app/globals.css";
import { normalizePlan } from "../lib/plan-model.mjs";
import type { CloudPlanConnection } from "../app/use-plan";

type CloudProfile = CloudPlanConnection & {
  dashboardUrl: string;
  serviceUrl: string;
};
type ProfileReply = { plan: unknown; cloud?: unknown };

const root = createRoot(document.getElementById("root")!);
const pageUrl = new URL(window.location.href);
const cloudMode = pageUrl.pathname === "/cloud" || pageUrl.pathname === "/cloud/";
const profileId = pageUrl.searchParams.get("profileId") ?? "";
const cloudReturnTo = "/cloud" + (profileId ? "?profileId=" + encodeURIComponent(profileId) : "");
const signInUrl = "/signin-with-chatgpt?return_to=" + encodeURIComponent(cloudReturnTo);

function cloudProfile(value: unknown, expectedProfileId: string): CloudProfile {
  if (!value || typeof value !== "object") throw new Error("Cloud connection missing.");
  const candidate = value as Partial<CloudProfile>;
  if (
    !expectedProfileId ||
    candidate.apiUrl !== "/api/plan?profileId=" + encodeURIComponent(expectedProfileId) ||
    typeof candidate.accountKey !== "string" || !candidate.accountKey ||
    typeof candidate.dashboardUrl !== "string" ||
    typeof candidate.serviceUrl !== "string"
  ) throw new Error("Cloud connection could not be verified.");
  for (const address of [candidate.dashboardUrl, candidate.serviceUrl]) {
    if (new URL(address, window.location.origin).origin !== window.location.origin)
      throw new Error("Cloud connection belongs to a different service.");
  }
  return candidate as CloudProfile;
}

function showSignIn() {
  root.render(
    <main style={{ padding: "2rem" }}>
      <h1>Sign in to open your semester</h1>
      <p>Use the ChatGPT account that has access to this student plan.</p>
      <a href={signInUrl}>Sign in with ChatGPT</a>
    </main>,
  );
}

async function start() {
  root.render(
    <main style={{ padding: "2rem" }}>
      <p>Opening your semester…</p>
    </main>,
  );
  try {
    const response = await fetch(
      cloudMode ? "/api/profile?profileId=" + encodeURIComponent(profileId) : "/api/profile",
      { cache: "no-store" },
    );
    if (cloudMode && response.status === 401) {
      showSignIn();
      return;
    }
    if (!response.ok)
      throw new Error("Your student workspace could not be verified.");
    const result = (await response.json()) as ProfileReply;
    if (cloudMode) {
      const cloud = cloudProfile(result.cloud, profileId);
      const plan = normalizePlan(result.plan, profileId);
      root.render(<Home key={cloud.accountKey + ":" + plan.profileId} initialPlan={plan} cloud={cloud} />);
    } else {
      root.render(<Home initialPlan={normalizePlan(result.plan)} />);
    }
  } catch {
    root.render(
      <main style={{ padding: "2rem" }}>
        <h1>Your semester could not be opened</h1>
        {cloudMode ? (
          <p>Your saved semester could not be loaded. Try again or choose a student plan you can access.</p>
        ) : (
          <p>
            Keep your workspace open in ChatGPT and ask Semester Navigator to
            resume your dashboard.
          </p>
        )}
        <button onClick={() => void start()}>Try again</button>
        {cloudMode && <p><a href="/cloud">Choose student</a></p>}
      </main>,
    );
  }
}
void start();
