export async function verifyAdminToken(token) {
  if (!token) return null;
  const baseUrl = (process.env.ADMIN_BACKEND_URL || 'http://localhost:5001').replace(/\/$/, '');
  try {
    const response = await fetch(`${baseUrl}/loggedinadmin`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store'
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.loggedIn && data?.admin?.id ? data.admin : null;
  } catch {
    return null;
  }
}
