import { OAuth2Client } from 'google-auth-library';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import {
  config,
  OAUTH_SCOPES,
  SESSION_COOKIE,
  OAUTH_STATE_COOKIE,
} from './config';
import {
  createSession,
  deleteSession,
  getGoogleTokens,
  getValidSession,
  upsertGoogleTokens,
} from './db';
import { UnauthorizedError } from './errors';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface CurrentUser {
  email: string;
  name: string;
  isAdmin: boolean;
}

export function createOAuthClient(): OAuth2Client {
  return new OAuth2Client(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri,
  );
}

export function buildConsentUrl(): { url: string; state: string } {
  const client = createOAuthClient();
  const state = randomUUID();
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // force a refresh_token every time
    scope: OAUTH_SCOPES,
    state,
  });
  return { url, state };
}

/**
 * Exchange an authorization code, verify the Google identity, persist tokens,
 * and open a session. Any verified Google account is allowed to sign in; the
 * ADMIN_EMAIL match only decides whether they are an admin.
 */
export async function completeOAuthLogin(code: string): Promise<CurrentUser> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.id_token) {
    throw new UnauthorizedError('Google did not return an identity token');
  }

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: config.google.clientId,
  });
  const payload = ticket.getPayload();
  const email = payload?.email?.toLowerCase();

  if (!email || !payload?.email_verified) {
    throw new UnauthorizedError('Could not verify a Google email address');
  }
  if (!tokens.refresh_token) {
    throw new UnauthorizedError(
      'No refresh token returned; revoke access at myaccount.google.com and try again',
    );
  }

  const name = (payload.name || email.split('@')[0]).slice(0, 60);

  upsertGoogleTokens({
    email,
    name,
    access_token: tokens.access_token ?? null,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date ?? null,
  });

  const sessionId = randomUUID();
  createSession(sessionId, email, name, new Date(Date.now() + SESSION_TTL_MS));

  cookies().set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });

  return { email, name, isAdmin: email === config.adminEmail };
}

export function getCurrentUser(): CurrentUser | null {
  const sessionId = cookies().get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;
  const session = getValidSession(sessionId);
  if (!session) return null;
  return {
    email: session.email,
    name: session.name,
    isAdmin: session.email === config.adminEmail,
  };
}

export function requireUser(): CurrentUser {
  const user = getCurrentUser();
  if (!user) {
    throw new UnauthorizedError('Sign-in required');
  }
  return user;
}

export function requireAdmin(): CurrentUser {
  const user = requireUser();
  if (!user.isAdmin) {
    throw new UnauthorizedError('Admin access required');
  }
  return user;
}

export function logout() {
  const sessionId = cookies().get(SESSION_COOKIE)?.value;
  if (sessionId) {
    deleteSession(sessionId);
  }
  cookies().delete(SESSION_COOKIE);
}

export function setOAuthState(state: string) {
  cookies().set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
}

export function consumeOAuthState(): string | undefined {
  const state = cookies().get(OAUTH_STATE_COOKIE)?.value;
  cookies().delete(OAUTH_STATE_COOKIE);
  return state;
}

/**
 * Returns a valid Google access token for the given account, refreshing it via
 * the stored refresh token when the cached one is missing or expired.
 */
export async function getAccessTokenForEmail(email: string): Promise<string> {
  const stored = getGoogleTokens(email);
  if (!stored) {
    throw new UnauthorizedError('This account has not connected Google');
  }

  const client = createOAuthClient();
  client.setCredentials({
    access_token: stored.access_token ?? undefined,
    refresh_token: stored.refresh_token,
    expiry_date: stored.expiry_date ?? undefined,
  });

  // getAccessToken() transparently refreshes when the token is expired.
  const { token } = await client.getAccessToken();
  if (!token) {
    throw new UnauthorizedError('Unable to obtain a Google access token');
  }

  const creds = client.credentials;
  upsertGoogleTokens({
    email: stored.email,
    name: stored.name,
    access_token: creds.access_token ?? token,
    refresh_token: creds.refresh_token ?? stored.refresh_token,
    expiry_date: creds.expiry_date ?? stored.expiry_date,
  });

  return token;
}

/** Access token for the admin account (used to push approved photos). */
export function getAdminAccessToken(): Promise<string> {
  return getAccessTokenForEmail(config.adminEmail);
}
