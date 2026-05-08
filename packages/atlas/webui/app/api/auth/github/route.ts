import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ATLAS_GITHUB_STATE_COOKIE,
  buildAppOrigin,
  createOAuthStateToken,
  getGitHubClientConfig,
  normalizeCallbackUrl,
} from "@/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const config = getGitHubClientConfig();
  if (!config) {
    return NextResponse.json({ error: "Authentication is not configured" }, { status: 503 });
  }
  const { clientId } = config;
  const url = new URL(request.url);
  const callbackUrl = normalizeCallbackUrl(url.searchParams.get("callbackUrl"), "/workspace");
  const stateToken = createOAuthStateToken(callbackUrl);
  if (!stateToken) {
    return NextResponse.json({ error: "Authentication is not configured" }, { status: 503 });
  }
  const origin = buildAppOrigin(request);
  const redirectUri = `${origin}/api/auth/callback/github`;
  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", "read:user user:email");
  authorizeUrl.searchParams.set("state", stateToken);

  const cookieStore = await cookies();
  cookieStore.set(ATLAS_GITHUB_STATE_COOKIE, stateToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge: 60 * 10,
  });

  return NextResponse.redirect(authorizeUrl);
}
