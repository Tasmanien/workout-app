import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify } from "jose";

type AuthEnv = { Bindings: Env & { AUTH_DISABLED?: string } };

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function keySetFor(teamDomain: string) {
  let keySet = keySets.get(teamDomain);
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    keySets.set(teamDomain, keySet);
  }
  return keySet;
}

export const requireAccess = createMiddleware<AuthEnv>(async (c, next) => {
  if (c.env.AUTH_DISABLED === "true") return next();

  const { ACCESS_TEAM_DOMAIN: teamDomain, ACCESS_AUD: audience } = c.env;
  if (!teamDomain || !audience) return c.json({ error: "Access is not configured" }, 503);

  const token = c.req.header("Cf-Access-Jwt-Assertion");
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  try {
    await jwtVerify(token, keySetFor(teamDomain), { issuer: `https://${teamDomain}`, audience });
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
});
