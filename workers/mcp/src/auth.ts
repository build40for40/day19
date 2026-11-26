// The sign-in pages. Claude or ChatGPT sends the user to /authorize, we ask them to
// approve that app, hand them to Google, and finish when Google sends them back to /callback.

import {
  authorizationErrorRedirect,
  AuthorizationError,
  CimdFetchError,
  type ConsentDescription,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { exchangeCode, fetchUserInfo, googleAuthorizeUrl, type GoogleProps } from "./google";

type Env_ = Env & { OAUTH_PROVIDER: OAuthHelpers };

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const base64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function s256(verifier: string) {
  return base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
}

function page(title: string, body: string, headers = new Headers(), status = 200) {
  headers.set("Content-Type", "text/html; charset=utf-8");
  const html = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
  :root { color-scheme: light dark; --bg: #faf6f0; --fg: #2b2118; --muted: #6b5d50; --accent: #b4532a; }
  @media (prefers-color-scheme: dark) { :root { --bg: #1c1713; --fg: #f3ebe1; --muted: #b8a999; --accent: #e07b4c; } }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 17px/1.5 system-ui, sans-serif; }
  main { max-width: 32rem; margin: 0 auto; padding: 2.5rem 1rem; }
  h1 { font-size: 1.5rem; line-height: 1.25; }
  .muted { color: var(--muted); font-size: 0.95rem; }
  .warn { border-left: 3px solid var(--accent); padding-left: 0.75rem; }
  button { font: inherit; padding: 0.7rem 1.2rem; border-radius: 0.6rem; border: 1px solid var(--muted); background: transparent; color: var(--fg); cursor: pointer; }
  button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .actions { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 1.5rem; }
</style>
<main>${body}</main></html>`;
  return new Response(html, { status, headers });
}

function consentPage(details: ConsentDescription, handle: string, headers: Headers) {
  const name = escape(details.clientName);
  const origin = details.clientDomain
    ? `Published by <strong>${escape(details.clientDomain)}</strong>.`
    : "This app registered itself, so its name isn't verified.";
  return page(
    `Connect ${details.clientName}`,
    `<h1>Let ${name} help you thank the people in your contacts?</h1>
<p>Next, Google will ask you to share your contacts. ${name} will be able to read them, and later, delete the ones you choose to let go. A copy of each one is saved first, so nobody is ever truly lost.</p>
<p class="muted">${origin} Access goes to <strong>${escape(details.redirectHost)}</strong>.</p>
${details.redirectIsLoopback ? '<p class="warn">This sends access to an app on your computer. Only continue if you just started signing in from it.</p>' : ""}
<p class="muted">Today Google will show an "unverified app" warning. That's expected: click Advanced, then continue.</p>
<form method="post">
  <input type="hidden" name="handle" value="${escape(handle)}">
  <div class="actions">
    <button class="primary" name="decision" value="approve">Continue with Google</button>
    <button name="decision" value="deny">No thanks</button>
  </div>
</form>`,
    headers,
  );
}

function errorPage(message: string) {
  return page(
    "Sign-in didn't work",
    `<h1>Sign-in didn't work</h1><p>${escape(message)}</p><p class="muted">Close this window and try connecting again.</p>`,
    new Headers(),
    400,
  );
}

/** Handles everything that isn't the MCP endpoint or the OAuth protocol routes. */
export const authHandler = {
  async fetch(request: Request, env: Env_, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const oauth = env.OAUTH_PROVIDER;
    try {
      if (url.pathname === "/authorize" && request.method === "GET") {
        const authRequest = await oauth.parseAuthRequest(request);
        const details = await oauth.describeConsent(authRequest);
        const consent = await oauth.beginConsent(authRequest);
        return consentPage(details, consent.handle, consent.headers);
      }

      if (url.pathname === "/authorize" && request.method === "POST") {
        const form = await request.formData();
        const handle = String(form.get("handle"));
        if (form.get("decision") !== "approve") {
          const denied = await oauth.denyConsent(request, handle);
          return new Response(null, { status: 302, headers: denied.headers });
        }
        const approved = await oauth.approveConsent(request, handle);
        // PKCE: Google only hands the code back to whoever holds this verifier.
        const verifier = crypto.randomUUID() + crypto.randomUUID();
        const { state, headers } = await oauth.beginUpstream(approved.request, {
          data: { verifier },
          headers: approved.headers,
        });
        headers.set(
          "Location",
          googleAuthorizeUrl({
            clientId: env.GOOGLE_CLIENT_ID,
            redirectUri: `${url.origin}/callback`,
            state,
            codeChallenge: await s256(verifier),
          }),
        );
        return new Response(null, { status: 302, headers });
      }

      if (url.pathname === "/callback" && request.method === "GET") {
        const { request: original, data, headers } = await oauth.finishUpstream<{ verifier: string }>(request);
        const code = url.searchParams.get("code");
        if (url.searchParams.get("error") || !code) {
          headers.set("Location", authorizationErrorRedirect(original, "access_denied"));
          return new Response(null, { status: 302, headers });
        }

        const tokens = await exchangeCode(env, code, `${url.origin}/callback`, data.verifier);
        if (!tokens.scope.includes("https://www.googleapis.com/auth/contacts")) {
          return errorPage("Google didn't share your contacts. Connect again and tick the contacts box on Google's screen.");
        }
        if (!tokens.refresh_token) {
          return errorPage("Google didn't send a refresh token. Remove the app at myaccount.google.com/permissions and connect again.");
        }
        const user = await fetchUserInfo(tokens.access_token);

        const props: GoogleProps = {
          userId: user.sub,
          email: user.email,
          name: user.name ?? user.email,
          familyName: user.family_name ?? "",
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
        };

        // Fill the brain while the user heads back to Claude, so the first tool call is quick.
        const brain = env.BRAIN.get(env.BRAIN.idFromName(user.sub));
        await brain.setProfile({ userId: user.sub, email: user.email, familyName: props.familyName });
        ctx.waitUntil(brain.sync(tokens.access_token, { force: true }).then(() => undefined, (e) => console.error("first sync failed", e)));

        const { redirectTo } = await oauth.completeAuthorization({
          request: original,
          userId: user.sub,
          metadata: { email: user.email },
          scope: original.scope,
          props,
        });
        headers.set("Location", redirectTo);
        return new Response(null, { status: 302, headers });
      }

      if (url.pathname === "/") {
        return page(
          "Day 19",
          `<h1>Day 19: Gratitude stays unsaid</h1><p>This is the MCP server for Day 19 of <a href="https://build40for40.com">40 for 40</a>. Add <code>${escape(url.origin)}/mcp</code> to Claude or ChatGPT as a custom connector.</p>`,
        );
      }

      return new Response("Not found", { status: 404 });
    } catch (error) {
      if (error instanceof AuthorizationError && error.redirectTo) return Response.redirect(error.redirectTo, 302);
      if (error instanceof AuthorizationError) return errorPage(error.description ?? "This sign-in link has expired or was already used.");
      if (error instanceof CimdFetchError) return errorPage("This app could not be verified.");
      throw error;
    }
  },
};
