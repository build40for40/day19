// Everything that talks to Google: the OAuth endpoints and the People API.

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  // Read and write, so "let go" can delete and "keep" can add to Notes later.
  "https://www.googleapis.com/auth/contacts",
];

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const PEOPLE_URL = "https://people.googleapis.com/v1";

/** What we keep about the signed-in user, encrypted inside their grant. */
export interface GoogleProps {
  userId: string; // Google's stable "sub" id
  email: string;
  name: string;
  familyName: string;
  accessToken: string;
  refreshToken: string;
}

/** Thrown when Google says the sign-in is gone for good (revoked, or a 7-day test token expired). */
export class GoogleRevokedError extends Error {}

/** Thrown when a sync token is too old, so the caller should do a full sync. */
export class SyncTokenExpiredError extends Error {}

export function googleAuthorizeUrl(options: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    state: options.state,
    code_challenge: options.codeChallenge,
    code_challenge_method: "S256",
    // Both are needed to get a refresh token back every time.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  }).toString();
  return url.toString();
}

export interface GoogleTokens {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

async function tokenRequest(body: Record<string, string>): Promise<GoogleTokens> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = (await response.json()) as GoogleTokens & { error?: string };
  if (json.error === "invalid_grant") throw new GoogleRevokedError("Google sign-in was revoked or expired");
  if (!response.ok) throw new Error(`Google token endpoint said ${response.status}: ${json.error}`);
  return json;
}

export function exchangeCode(env: Env, code: string, redirectUri: string, verifier: string) {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
  });
}

export function refreshAccessToken(env: Env, refreshToken: string) {
  return tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
  });
}

export async function fetchUserInfo(accessToken: string) {
  const response = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Google userinfo said ${response.status}`);
  return (await response.json()) as { sub: string; email: string; name?: string; family_name?: string };
}

// ---------- People API ----------

/** The fields the brain indexes for every contact. Light enough for 1,000 a page. */
const INDEX_FIELDS = [
  "names",
  "emailAddresses",
  "phoneNumbers",
  "photos",
  "birthdays",
  "biographies",
  "memberships",
  "organizations",
  "metadata",
].join(",");

/** Everything, for the snapshot saved before anyone can delete a contact. */
export const SNAPSHOT_FIELDS = [
  "addresses",
  "biographies",
  "birthdays",
  "emailAddresses",
  "events",
  "memberships",
  "metadata",
  "names",
  "nicknames",
  "organizations",
  "phoneNumbers",
  "photos",
  "relations",
  "urls",
  "userDefined",
].join(",");

/** A Google contact, with only the fields we read typed. */
export interface Person {
  resourceName: string;
  etag: string;
  metadata?: {
    deleted?: boolean;
    sources?: { type: string; updateTime?: string }[];
  };
  names?: { displayName?: string; givenName?: string; familyName?: string; unstructuredName?: string }[];
  emailAddresses?: { value: string }[];
  phoneNumbers?: { value: string }[];
  photos?: { url: string; default?: boolean }[];
  birthdays?: unknown[];
  biographies?: { value: string }[];
  organizations?: { name?: string; title?: string }[];
  memberships?: { contactGroupMembership?: { contactGroupResourceName?: string } }[];
}

interface ConnectionsPage {
  connections?: Person[];
  nextPageToken?: string;
  nextSyncToken?: string;
  totalPeople?: number;
}

async function people<T>(accessToken: string, path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${PEOPLE_URL}/${path}`);
  url.search = new URLSearchParams(params).toString();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (response.ok) return (await response.json()) as T;
  const body = await response.text();
  // An old sync token comes back as 410 Gone, or 400 with EXPIRED_SYNC_TOKEN.
  if (response.status === 410 || body.includes("EXPIRED_SYNC_TOKEN")) throw new SyncTokenExpiredError(body);
  if (response.status === 401) throw new GoogleRevokedError(body);
  throw new Error(`People API ${path} said ${response.status}: ${body.slice(0, 300)}`);
}

/**
 * Lists contacts page by page. With no syncToken it reads everyone (a full sync).
 * With one, Google sends only what changed since then, including deletions.
 * Either way it returns a fresh sync token for next time.
 */
export async function listConnections(accessToken: string, syncToken?: string) {
  const people_: Person[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  do {
    // Every page and every incremental sync must repeat the first request's parameters.
    const params: Record<string, string> = {
      personFields: INDEX_FIELDS,
      pageSize: "1000",
      requestSyncToken: "true",
    };
    if (syncToken) params.syncToken = syncToken;
    if (pageToken) params.pageToken = pageToken;
    const page = await people<ConnectionsPage>(accessToken, "people/me/connections", params);
    people_.push(...(page.connections ?? []));
    pageToken = page.nextPageToken;
    nextSyncToken = page.nextSyncToken ?? nextSyncToken;
  } while (pageToken);
  return { people: people_, syncToken: nextSyncToken };
}

/** Full details for up to 200 contacts at once. */
export async function getPeople(accessToken: string, resourceNames: string[]): Promise<Person[]> {
  if (resourceNames.length === 0) return [];
  const url = new URL(`${PEOPLE_URL}/people:batchGet`);
  url.searchParams.set("personFields", SNAPSHOT_FIELDS);
  for (const name of resourceNames) url.searchParams.append("resourceNames", name);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (response.status === 401) throw new GoogleRevokedError(await response.text());
  if (!response.ok) throw new Error(`People API batchGet said ${response.status}`);
  const json = (await response.json()) as { responses?: { person?: Person }[] };
  return (json.responses ?? []).flatMap((r) => (r.person ? [r.person] : []));
}

/** Deletes a contact from Google, and so from every phone synced to that account. Already gone counts as done. */
export async function deleteContact(accessToken: string, resourceName: string): Promise<void> {
  const response = await fetch(`${PEOPLE_URL}/${resourceName}:deleteContact`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.ok || response.status === 404) return;
  if (response.status === 401) throw new GoogleRevokedError(await response.text());
  throw new Error(`People API deleteContact said ${response.status}`);
}

/** What a snapshot can be written back with. Photos and metadata are Google's own and can't be set here. */
const RESTORE_FIELDS = SNAPSHOT_FIELDS.split(",").filter((field) => field !== "metadata" && field !== "photos");

/** Google refuses a new contact with more than one of these. */
const ONE_ONLY = new Set(["names", "birthdays", "biographies"]);

/**
 * Creates a contact again from a snapshot taken before it was deleted. It comes back with a new id.
 * Only what the person saved on the contact is sent: not values from the contact's own Google profile, and not the photo.
 */
export async function createContact(accessToken: string, snapshot: Person): Promise<Person> {
  const body: Record<string, unknown> = {};
  for (const field of RESTORE_FIELDS) {
    const values = (snapshot as unknown as Record<string, unknown>)[field];
    if (!Array.isArray(values)) continue;
    const own = (values as { metadata?: { source?: { type?: string } } }[])
      .filter((value) => (value.metadata?.source?.type ?? "CONTACT") === "CONTACT")
      // Groups the person put them in are kept. Their organisation's directory isn't ours to write.
      .filter((value) => field !== "memberships" || "contactGroupMembership" in value)
      .map(({ metadata: _metadata, ...rest }) => rest);
    if (own.length) body[field] = ONE_ONLY.has(field) ? own.slice(0, 1) : own;
  }
  const url = new URL(`${PEOPLE_URL}/people:createContact`);
  url.searchParams.set("personFields", INDEX_FIELDS);
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.status === 401) throw new GoogleRevokedError(await response.text());
  if (!response.ok) throw new Error(`People API createContact said ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return (await response.json()) as Person;
}
