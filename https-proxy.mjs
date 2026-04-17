import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { Socket } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || "3443", 10);
const HTTP_PORT = parseInt(process.env.HTTP_PORT || "3000", 10);
const API_PORT = parseInt(process.env.API_PORT || "8741", 10);
const HOST = process.env.HOST || "0.0.0.0";

const options = {
  key: readFileSync(join(__dirname, "certs", "server.key")),
  cert: readFileSync(join(__dirname, "certs", "server.crt")),
};

// Routes that go to the Sygen API backend instead of Next.js
const API_PREFIXES = ["/api/", "/upload", "/files", "/health", "/ws/"];

// Endpoints where we don't (yet) rely on double-submit CSRF and therefore
// must enforce an Origin/Referer check to block cross-site POSTs.
const CSRF_STRICT_ENDPOINTS = ["/api/auth/login", "/api/auth/2fa/login"];

function isApiRoute(url) {
  return API_PREFIXES.some((p) => url.startsWith(p));
}

function hostnameFromUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function requestHost(req) {
  return (req.headers.host || "").split(":")[0].toLowerCase();
}

function isSameSiteRequest(req) {
  const expected = requestHost(req);
  if (!expected) return false;
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  if (origin) {
    const host = hostnameFromUrl(origin);
    return host === expected;
  }
  if (referer) {
    const host = hostnameFromUrl(referer);
    return host === expected;
  }
  // No Origin or Referer on a state-changing POST — reject.
  return false;
}

function stripHopAndSpoofableHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    const key = k.toLowerCase();
    // Drop any client-supplied forwarded/proxy chain headers so the
    // backend cannot be tricked about the originating address.
    if (key === "x-forwarded-for" || key === "x-forwarded-host" ||
        key === "x-forwarded-proto" || key === "x-forwarded-port" ||
        key === "x-real-ip" || key === "forwarded" ||
        key === "via") {
      continue;
    }
    out[k] = v;
  }
  return out;
}

const proxy = createServer(options, (req, res) => {
  const method = (req.method || "GET").toUpperCase();
  const path = req.url || "/";

  // CSRF hardening for endpoints that cannot use the double-submit cookie
  // pattern (pre-session login). Only POST/PUT/PATCH/DELETE can mutate
  // state, so only enforce on those.
  if (CSRF_STRICT_ENDPOINTS.some((p) => path.startsWith(p)) &&
      method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    if (!isSameSiteRequest(req)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "origin check failed" }));
      return;
    }
  }

  const targetPort = isApiRoute(path) ? API_PORT : HTTP_PORT;
  const clientAddr = req.socket?.remoteAddress || "";

  const forwardHeaders = {
    ...stripHopAndSpoofableHeaders(req.headers),
    host: req.headers.host,
    "x-forwarded-proto": "https",
    "x-forwarded-for": clientAddr,
    "x-forwarded-host": req.headers.host || "",
    "x-forwarded-port": String(HTTPS_PORT),
  };

  const proxyReq = httpRequest(
    {
      hostname: "127.0.0.1",
      port: targetPort,
      path,
      method: req.method,
      headers: forwardHeaders,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    },
  );

  proxyReq.on("error", () => {
    res.writeHead(502);
    res.end("Bad Gateway");
  });

  req.pipe(proxyReq, { end: true });
});

// Handle WebSocket upgrade — route /ws/* to API, rest to Next.js
proxy.on("upgrade", (req, socket, head) => {
  const targetPort = isApiRoute(req.url) ? API_PORT : HTTP_PORT;
  const proxySocket = new Socket();
  proxySocket.connect(targetPort, "127.0.0.1", () => {
    const reqLine = `${req.method} ${req.url} HTTP/1.1\r\n`;
    const clientAddr = req.socket?.remoteAddress || "";
    const forwardHeaders = {
      ...stripHopAndSpoofableHeaders(req.headers),
      host: req.headers.host,
      "x-forwarded-proto": "https",
      "x-forwarded-for": clientAddr,
      "x-forwarded-host": req.headers.host || "",
      "x-forwarded-port": String(HTTPS_PORT),
    };
    const headers = Object.entries(forwardHeaders)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\r\n");
    proxySocket.write(reqLine + headers + "\r\n\r\n");
    if (head.length) proxySocket.write(head);
    socket.pipe(proxySocket);
    proxySocket.pipe(socket);
  });

  proxySocket.on("error", () => socket.destroy());
  socket.on("error", () => proxySocket.destroy());
});

proxy.listen(HTTPS_PORT, HOST, () => {
  console.log(
    `HTTPS proxy on https://${HOST}:${HTTPS_PORT}\n` +
    `  Next.js  -> http://127.0.0.1:${HTTP_PORT}\n` +
    `  Sygen API -> http://127.0.0.1:${API_PORT}`,
  );
});
