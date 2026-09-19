import { createServer } from "node:http";
import { createPersistentChain } from "./persistent-chain.js";
const directory = process.env.LOCAL_CHAIN_DIRECTORY;
if (!directory) throw Error("LOCAL_CHAIN_DIRECTORY is required");
const chain = await createPersistentChain(directory);
const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (
        !["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname)
      )
        throw Error();
    } catch {
      res.writeHead(403).end();
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", "content-type");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405).end();
    return;
  }
  let body = "";
  try {
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 2 * 1024 * 1024)
        throw Error("RPC body too large");
    }
    const parsed = JSON.parse(body);
    const requests = Array.isArray(parsed) ? parsed : [parsed];
    if (!requests.length || requests.length > 100)
      throw Error("Invalid RPC batch");
    const responses = [];
    for (const call of requests) {
      if (
        !call ||
        call.jsonrpc !== "2.0" ||
        typeof call.method !== "string" ||
        (call.params !== undefined && !Array.isArray(call.params))
      )
        throw Error("Invalid RPC request");
      try {
        responses.push({
          jsonrpc: "2.0",
          id: call.id ?? null,
          result: await chain.request(call),
        });
      } catch (error) {
        const e = error as any;
        responses.push({
          jsonrpc: "2.0",
          id: call.id ?? null,
          error: { code: e.code ?? -32603, message: e.message },
        });
      }
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(Array.isArray(parsed) ? responses : responses[0]));
  } catch {
    res
      .writeHead(400)
      .end(JSON.stringify({ error: "Invalid local RPC request" }));
  }
});
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(
    Number(process.env.LOCAL_CHAIN_PORT ?? 8545),
    "127.0.0.1",
    resolve,
  );
});
console.log(
  `Persistent local chain ready (${chain.sequence} recovered operations)`,
);
let closing = false;
async function stop() {
  if (closing) return;
  closing = true;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await chain.close();
  if (process.connected) process.disconnect?.();
}
process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());
process.once("message", (message) => {
  if (message === "shutdown") void stop();
});

process.once("disconnect", () => void stop());
