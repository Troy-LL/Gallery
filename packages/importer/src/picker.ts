export type DownloadedPickerItem = { id: string; filename: string; bytes: Uint8Array };

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function googleAuthUrl(options: { clientId: string; redirectUri: string; state: string }): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/photospicker.mediaitems.readonly");
  url.searchParams.set("state", options.state);
  url.searchParams.set("access_type", "offline");
  return url.toString();
}

export async function exchangeCode(
  fetchImpl: FetchLike,
  options: { code: string; clientId: string; clientSecret: string; redirectUri: string },
): Promise<{ accessToken: string }> {
  const body = new URLSearchParams({
    code: options.code,
    client_id: options.clientId,
    client_secret: options.clientSecret,
    redirect_uri: options.redirectUri,
    grant_type: "authorization_code",
  });
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`token exchange failed ${response.status}`);
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("token exchange returned no access token");
  return { accessToken: json.access_token };
}

export async function runPickerDownload(
  fetchImpl: FetchLike,
  options: { accessToken: string; apiBase?: string; poll?: () => Promise<void> },
): Promise<{ sessionId: string; files: DownloadedPickerItem[] }> {
  const apiBase = options.apiBase ?? "https://photospicker.googleapis.com/v1";
  const headers = { authorization: `Bearer ${options.accessToken}` };
  const created = await fetchImpl(`${apiBase}/sessions`, { method: "POST", headers });
  if (!created.ok) throw new Error(`picker session failed ${created.status}`);
  const session = (await created.json()) as { id: string; pickerUri: string };
  let ready = false;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const polled = await fetchImpl(`${apiBase}/sessions/${session.id}`, { headers });
    if (!polled.ok) throw new Error(`picker poll failed ${polled.status}`);
    const body = (await polled.json()) as { mediaItemsSet?: boolean };
    if (body.mediaItemsSet) {
      ready = true;
      break;
    }
    if (options.poll) await options.poll();
  }
  if (!ready) throw new Error("picker selection was not ready");
  try {
    const listed = await fetchImpl(`${apiBase}/mediaItems?sessionId=${session.id}`, { headers });
    if (!listed.ok) throw new Error(`picker list failed ${listed.status}`);
    const payload = (await listed.json()) as {
      mediaItems?: { id: string; mediaFile?: { baseUrl?: string; filename?: string } }[];
    };
    const files: DownloadedPickerItem[] = [];
    for (const item of payload.mediaItems ?? []) {
      const baseUrl = item.mediaFile?.baseUrl;
      if (!baseUrl) continue;
      const downloaded = await fetchImpl(baseUrl, { headers });
      if (!downloaded.ok) throw new Error(`picker download failed ${downloaded.status}`);
      files.push({
        id: item.id,
        filename: item.mediaFile?.filename ?? `${item.id}.jpg`,
        bytes: new Uint8Array(await downloaded.arrayBuffer()),
      });
    }
    return { sessionId: session.id, files };
  } finally {
    await fetchImpl(`${apiBase}/sessions/${session.id}`, { method: "DELETE", headers });
  }
}
