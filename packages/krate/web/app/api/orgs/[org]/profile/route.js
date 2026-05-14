import { createAuthProviderConfig, createKrateApiController, orgNamespaceName, parseSessionCookie } from '@a5c-ai/krate-sdk';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

async function getUser() {
  try {
    const config = createAuthProviderConfig();
    const cookieStore = await cookies();
    return parseSessionCookie(config, cookieStore.get(config.session.cookieName)?.value);
  } catch {
    return null;
  }
}

export async function GET(request, { params }) {
  const { org } = await params;
  const user = await getUser();
  if (!user) {
    return Response.json({ error: 'unauthorized', message: 'Not signed in' }, { status: 401 });
  }

  try {
    const controller = createKrateApiController({ namespace: orgNamespaceName(org) });
    const grants = await controller.listResource('AgentSecretGrant');
    const username = user.user || user.subject || '';
    const apiKeys = (grants.items || grants || [])
      .filter(g => {
        const subjectName = g.spec?.subject?.name;
        return subjectName === username && (g.metadata?.name || '').startsWith('user-apikey-');
      })
      .map(g => ({
        name: g.metadata?.name,
        purpose: g.spec?.purpose || 'API key',
        createdAt: g.metadata?.creationTimestamp || null,
      }));

    return Response.json({
      user: {
        user: user.user || user.subject || '',
        email: user.email || user.mail || '',
        org: user.org || org,
        role: user.role || user.roles?.[0] || 'member',
        teams: user.teams || [],
        authProvider: user.authProvider || user.method || 'session cookie',
        lastLogin: user.iat ? new Date(user.iat * 1000).toISOString() : null,
        displayName: user.displayName || user.user || user.subject || '',
        emailNotifications: user.emailNotifications !== false,
      },
      apiKeys,
    });
  } catch (error) {
    return Response.json({ error: 'operation_failed', message: error.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const { org } = await params;
  const user = await getUser();
  if (!user) {
    return Response.json({ error: 'unauthorized', message: 'Not signed in' }, { status: 401 });
  }

  try {
    const body = await request.json();
    // Profile updates are stored as user preferences; in a full implementation
    // this would write to a UserProfile CRD or configmap. For now we acknowledge.
    return Response.json({
      ok: true,
      user: {
        user: user.user || user.subject || '',
        displayName: body.displayName || user.displayName || user.user || '',
        emailNotifications: body.emailNotifications !== undefined ? body.emailNotifications : true,
      },
    });
  } catch (error) {
    return Response.json({ error: 'operation_failed', message: error.message }, { status: 400 });
  }
}
