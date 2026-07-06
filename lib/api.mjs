// Shared authed HTTP client for the TxLINE API.
// Every /api/... data request needs BOTH headers (see docs/connect.md):
//   Authorization: Bearer <jwt>      X-Api-Token: <apiToken>
import axios from "axios";

// Thrown on 401 (bad/missing JWT) or 403 (bad/expired API token or no active subscription).
// Lets callers tell a dead credential apart from a per-fixture "no data yet" — the bug that
// used to make a global auth failure look identical to "no live data right now".
export class AuthError extends Error {
  constructor(status, body) {
    super(`TxLINE auth/subscription failed (HTTP ${status}) — re-run: node setup.mjs`);
    this.status = status;
    this.body = body;
    this.name = "AuthError";
  }
}

// net: an entry from NETWORKS in lib/config.mjs (needs net.apiOrigin).
export const makeClient = ({ net, jwt, apiToken }) => {
  const http = axios.create({
    baseURL: net.apiOrigin,
    timeout: 30000,
    headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken },
  });
  return {
    async get(path) {
      try {
        return await http.get(path);
      } catch (e) {
        const status = e?.response?.status;
        if (status === 401 || status === 403) {
          throw new AuthError(status, JSON.stringify(e?.response?.data || "").slice(0, 200));
        }
        throw e; // timeout / per-fixture 404 / 500 → propagate as-is
      }
    },
  };
};
