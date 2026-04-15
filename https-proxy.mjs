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
// Next.js own API routes — must NOT be forwarded to the Sygen backend
const NEXTJS_API_PREFIXES = ["/api/auth/token-login"];

function isApiRoute(url) {
  if (NEXTJS_API_PREFIXES.some((p) => url.startsWith(p))) return false;
  return API_PREFIXES.some((p) => url.startsWith(p));
}

const proxy = createServer(options, (req, res) => {
  const targetPort = isApiRoute(req.url) ? API_PORT : HTTP_PORT;

  const proxyReq = httpRequest(
    {
      hostname: "127.0.0.1",
      port: targetPort,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: req.headers.host,
        "x-forwarded-proto": "https",
      },
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
    const headers = Object.entries(req.headers)
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
