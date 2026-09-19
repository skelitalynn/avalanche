import Fastify, { type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { randomBytes, randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import sharp from "sharp";
import canonicalize from "canonicalize";
import { createSiweMessage } from "viem/siwe";
import { type Address, type Hex } from "viem";
import {
  lifecycles,
  addressSchema,
  hashSchema,
  documentSchema,
  hashDocument,
  same,
  jsonSafe,
  evidenceCommitment,
  SituationAgreementAbi,
} from "../../../packages/shared/src/index.js";
import { Store, digest } from "./store.js";
import { createChain, type ChainConfig, type ChainSituation } from "./chain.js";
export interface ApiConfig extends ChainConfig {
  origin: string;
  database: string;
  encryptionKey: string;
  walletConnectConfigured?: boolean;
  localSessionId?: string;
  clock?: () => number;
}
type Row = Record<string, any>;
export function createApp(config: ApiConfig) {
  const app = Fastify({ logger: false, bodyLimit: 6 * 1024 * 1024 });
  const store = new Store(config.database, config.encryptionKey);
  const chain = createChain(config);
  const now = () => Math.floor((config.clock?.() ?? Date.now()) / 1000);
  const origin = new URL(config.origin);
  const secure = origin.protocol === "https:";
  if (!secure && !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))
    throw Error("Private API requires HTTPS outside localhost");
  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/api/v1",
  };
  const q = (sql: string, ...args: any[]) =>
    store.db.prepare(sql).get(...args) as Row | undefined;
  const all = (sql: string, ...args: any[]) =>
    store.db.prepare(sql).all(...args) as Row[];
  const exec = (sql: string, ...args: any[]) =>
    store.db.prepare(sql).run(...args);
  function fail(statusCode: number, code: string, message = code): never {
    throw Object.assign(Error(message), { statusCode, code });
  }
  app.register(cookie);
  app.register(rateLimit, { max: 90, timeWindow: "1 minute" });
  app.register(multipart, {
    limits: { files: 1, fileSize: 5 * 1024 * 1024, fields: 4, parts: 5 },
  });
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff");
    if (
      ["POST", "DELETE"].includes(req.method) &&
      req.headers.origin !== config.origin
    )
      fail(403, "ORIGIN_MISMATCH");
  });
  app.setErrorHandler((err, req, reply) => {
    const e = err as any;
    const status = e instanceof ZodError ? 422 : (e.statusCode ?? 503);
    reply.status(status).send({
      error: {
        code:
          e instanceof ZodError
            ? "INVALID_INPUT"
            : (e.code ?? "DEPENDENCY_UNAVAILABLE"),
        message:
          status >= 500
            ? "服务暂时不可用，请稍后重试"
            : e instanceof ZodError
              ? "请检查输入格式"
              : e.message,
        requestId: req.id,
      },
    });
  });
  function user(req: FastifyRequest): Address {
    const token = req.cookies.session;
    if (!token) fail(401, "UNAUTHENTICATED");
    const session = q(
      "SELECT * FROM sessions WHERE id=? AND expires>?",
      digest(token),
      now(),
    );
    if (!session) fail(401, "SESSION_EXPIRED");
    return session.address;
  }
  function role(s: ChainSituation, address: string) {
    return same(s.participantA, address)
      ? "A"
      : same(s.participantB, address)
        ? "B"
        : s.supervisors.some((a) => same(a, address))
          ? "SUPERVISOR"
          : null;
  }
  function retention(s: ChainSituation) {
    if (
      s.snapshot.terminatedAt > 0n &&
      BigInt(now()) >= s.snapshot.terminatedAt + 30n * 86400n
    )
      fail(410, "DATA_EXPIRED");
  }
  function participant(s: ChainSituation, address: string) {
    if (!["A", "B"].includes(role(s, address) ?? "")) fail(404, "NOT_FOUND");
    retention(s);
  }
  async function situation(req: FastifyRequest) {
    const address = addressSchema.parse((req.params as any).s);
    return chain.read(address);
  }
  function draft(id: string) {
    z.string().uuid().parse(id);
    const row = q("SELECT * FROM agreements WHERE id=?", id);
    if (!row) fail(404, "NOT_FOUND");
    return row;
  }
  function idempotent(
    req: FastifyRequest,
    address: string,
    body: unknown,
    fn: () => unknown,
    status = 201,
  ) {
    const key = z.string().uuid().parse(req.headers["idempotency-key"]);
    const id = digest(`${address}|${req.method}|${req.url}|${key}`);
    const hash = digest(canonicalize(body)!);
    return store.transaction(() => {
      const old = q(
        "SELECT * FROM idempotency WHERE id=? AND created>?",
        id,
        now() - 86400,
      );
      if (old) {
        if (old.request_hash !== hash) fail(409, "IDEMPOTENCY_CONFLICT");
        return { value: store.open(old.response), status: old.status };
      }
      const value = jsonSafe(fn());
      exec(
        "INSERT OR REPLACE INTO idempotency VALUES(?,?,?,?,?)",
        id,
        hash,
        store.seal(value),
        status,
        now(),
      );
      return { value, status };
    });
  }
  const uuidBody = z.object({}).strict();
  const post = (
    path: string,
    handler: (
      req: FastifyRequest,
    ) => Promise<{ value: unknown; status: number }>,
  ) =>
    app.post("/api/v1" + path, async (req, reply) => {
      const result = await handler(req);
      return reply.status(result.status).send({ data: result.value });
    });
  app.get("/api/v1/health", async () => {
    await chain.client.getBlockNumber();
    await chain.validateDeployment();
    return { data: { status: "ok" } };
  });
  app.get("/api/v1/config", async () => {
    await chain.validateDeployment();
    return {
      data: {
        chainId: config.chainId,
        tokenAddress: config.token,
        tokenDecimals: 6,
        factoryAddress: config.factory,
        walletConnectConfigured: !!config.walletConnectConfigured,
        ...(config.chainId === 31337 && config.localSessionId
          ? { localSessionId: config.localSessionId }
          : {}),
      },
    };
  });
  app.post("/api/v1/auth/challenge", async (req, reply) => {
    const { address } = z
      .object({ address: addressSchema })
      .strict()
      .parse(req.body);
    const nonce = randomBytes(16).toString("hex");
    const token = randomBytes(32).toString("hex");
    const expires = now() + 600;
    const message = createSiweMessage({
      address,
      chainId: config.chainId,
      domain: origin.host,
      nonce,
      uri: config.origin,
      version: "1",
      issuedAt: new Date(now() * 1000),
      expirationTime: new Date(expires * 1000),
      statement: "登录 SituationSHIT。此签名不创建关系，也不授权代币转账。",
    });
    exec(
      "INSERT INTO challenges(id,address,message,expires) VALUES(?,?,?,?)",
      digest(token),
      address,
      message,
      expires,
    );
    reply.setCookie("challenge", token, { ...cookieOptions, maxAge: 600 });
    return { data: { message, expiresAt: String(expires) } };
  });
  app.post("/api/v1/auth/verify", async (req, reply) => {
    const { message, signature } = z
      .object({
        message: z.string().max(4096),
        signature: z
          .string()
          .regex(/^0x[0-9a-fA-F]+$/)
          .max(20000),
      })
      .strict()
      .parse(req.body);
    const token = req.cookies.challenge ?? "";
    const row = q("SELECT * FROM challenges WHERE id=?", digest(token));
    if (!row || row.consumed || row.expires < now() || row.message !== message)
      fail(401, "INVALID_CHALLENGE");
    const code = await chain.client.getCode({ address: row.address });
    if (!code && signature.length !== 132) fail(401, "UNSUPPORTED_WALLET");
    if (
      !(await chain.client.verifyMessage({
        address: row.address,
        message,
        signature: signature as Hex,
      }))
    )
      fail(401, "INVALID_SIGNATURE");
    const session = randomBytes(32).toString("hex");
    const expires = now() + 3600;
    store.transaction(() => {
      const result = exec(
        "UPDATE challenges SET consumed=1 WHERE id=? AND consumed=0 AND expires>=?",
        digest(token),
        now(),
      );
      if (result.changes !== 1) fail(401, "NONCE_REPLAY");
      exec(
        "INSERT INTO sessions VALUES(?,?,?)",
        digest(session),
        row.address,
        expires,
      );
    });
    reply
      .clearCookie("challenge", cookieOptions)
      .setCookie("session", session, { ...cookieOptions, maxAge: 3600 });
    return { data: { address: row.address, expiresAt: String(expires) } };
  });
  app.delete("/api/v1/auth/session", async (req, reply) => {
    if (req.cookies.session)
      exec("DELETE FROM sessions WHERE id=?", digest(req.cookies.session));
    reply
      .clearCookie("session", cookieOptions)
      .clearCookie("challenge", cookieOptions);
    return reply.status(204).send();
  });
  post("/agreements", async (req) => {
    const address = user(req);
    const { document } = z
      .object({ document: documentSchema })
      .strict()
      .parse(req.body);
    if (
      document.participantA !== address ||
      document.chainId !== config.chainId ||
      !same(document.factory, config.factory)
    )
      fail(403, "AGREEMENT_CONTEXT");
    return idempotent(req, address, document, () => {
      const hash = hashDocument(document);
      const existing = q(
        "SELECT * FROM agreements WHERE a=? AND hash=?",
        address,
        hash,
      );
      if (existing) {
        if (existing.deleted) fail(410, "DATA_EXPIRED");
        return { id: existing.id, agreementHash: hash };
      }
      const id = randomUUID();
      exec(
        "INSERT INTO agreements(id,a,b,panel,hash,body,created) VALUES(?,?,?,?,?,?,?)",
        id,
        address,
        document.participantB,
        JSON.stringify(document.supervisors),
        hash,
        store.seal(document),
        now(),
      );
      return { id, agreementHash: hash };
    });
  });
  post("/agreements/:id/link", async (req) => {
    const address = user(req);
    const row = draft((req.params as any).id);
    if (row.a !== address) fail(404, "NOT_FOUND");
    if (row.deleted || (row.created + 7 * 86400 < now() && !row.situation))
      fail(410, "DATA_EXPIRED");
    const { txHash } = z
      .object({ txHash: hashSchema })
      .strict()
      .parse(req.body);
    const linked = await chain.linked(store.open(row.body), txHash);
    return idempotent(
      req,
      address,
      { txHash },
      () => {
        if (row.situation && !same(row.situation, linked))
          fail(409, "ALREADY_LINKED");
        exec("UPDATE agreements SET situation=? WHERE id=?", linked, row.id);
        return {
          situationAddress: linked,
          invitationPath: `/?mode=live&agreement=${row.id}#/invite`,
        };
      },
      200,
    );
  });
  app.get("/api/v1/agreements/:id", async (req) => {
    const address = user(req);
    const row = draft((req.params as any).id);
    if (row.a !== address && !(row.situation && row.b === address))
      fail(404, "NOT_FOUND");
    if (row.deleted || (!row.situation && row.created + 7 * 86400 < now()))
      fail(410, "DATA_EXPIRED");
    if (row.situation) participant(await chain.read(row.situation), address);
    return {
      data: {
        document: store.open(row.body),
        agreementHash: row.hash,
        situationAddress: row.situation,
      },
    };
  });
  app.get("/api/v1/situations", async (req) => {
    const address = user(req);
    const query = z
      .object({ cursor: z.string().uuid().optional() })
      .strict()
      .parse(req.query);
    const rows = all(
      "SELECT * FROM agreements WHERE situation IS NOT NULL AND (a=? OR b=? OR EXISTS(SELECT 1 FROM json_each(panel) WHERE value=?)) AND id>? ORDER BY id LIMIT 51",
      address,
      address,
      address,
      query.cursor ?? "",
    );
    const items = [];
    for (const row of rows.slice(0, 50)) {
      const s = await chain.read(row.situation);
      items.push({
        address: row.situation,
        role: role(s, address),
        state: lifecycles[s.snapshot.state],
        agreementId: role(s, address) === "SUPERVISOR" ? null : row.id,
      });
    }
    return {
      data: { items, nextCursor: rows.length > 50 ? rows[49].id : null },
    };
  });
  app.get("/api/v1/situations/:s", async (req) => {
    const address = user(req);
    const s = await situation(req);
    participant(s, address);
    const row = q(
      "SELECT * FROM agreements WHERE situation=?",
      s.address.toLowerCase(),
    );
    if (!row) fail(404, "NOT_FOUND");
    if (row.deleted) fail(410, "DATA_EXPIRED");
    const document = store.open(row.body);
    const records = all(
      "SELECT * FROM records WHERE situation=?",
      s.address.toLowerCase(),
    )
      .map((r) => store.open(r.body))
      .filter(
        (r) =>
          !s.snapshot.terminatedAt ||
          r.createdAt <= Number(s.snapshot.terminatedAt),
      );
    const month = new Date(now() * 1000).toISOString().slice(0, 7);
    const confirmed = records
      .filter(
        (r) =>
          r.kind === "relationship-check" &&
          r.confirmedAt &&
          (!s.snapshot.terminatedAt ||
            r.confirmedAt <= Number(s.snapshot.terminatedAt)),
      )
      .reduce(
        (max, r) => Math.max(max, r.confirmedAt),
        Number(s.snapshot.activatedAt),
      );
    return {
      data: jsonSafe({
        chain: {
          ...s.snapshot,
          state: lifecycles[s.snapshot.state],
          terminationReason: [
            "NONE",
            "CANCELLED_BY_PARTICIPANT",
            "INVITE_EXPIRED",
            "FUNDING_EXPIRED",
            "MUTUAL_END",
            "BREACH_A",
            "BREACH_B",
            "REJECTED",
            "TIMED_OUT",
          ][s.snapshot.terminationReason],
        },
        commitment: {
          meetingTarget: document.meetingTarget,
          confirmationEveryDays: document.confirmationEveryDays,
        },
        meetingCount: records.filter(
          (r) =>
            r.kind === "meeting" &&
            r.confirmedAt &&
            r.date.startsWith(month) &&
            (!s.snapshot.terminatedAt ||
              r.confirmedAt <= Number(s.snapshot.terminatedAt)),
        ).length,
        relationshipConfirmedAt: confirmed,
        nextConfirmationAt: confirmed + document.confirmationEveryDays * 86400,
        observedBlock: s.observedBlock,
      }),
    };
  });
  app.get("/api/v1/situations/:s/supervision-invitation", async (req) => {
    const address = user(req);
    const s = await situation(req);
    if (role(s, address) !== "SUPERVISOR") fail(404, "NOT_FOUND");
    return {
      data: jsonSafe({
        participantA: s.participantA,
        participantB: s.participantB,
        supervisors: s.supervisors,
        ghostWindow: s.ghostWindow,
        recoveryAmount: s.recoveryAmount,
        bondAmount: s.bondAmount,
        agreementHash: s.agreementHash,
        rolePolicyVersion: 1,
        acceptanceState: s.snapshot.supervisorsAccepted,
      }),
    };
  });
  for (const [plural, kind] of [
    ["meetings", "meeting"],
    ["relationship-checks", "relationship-check"],
  ] as const) {
    post(`/situations/:s/${plural}`, async (req) => {
      const address = user(req);
      const s = await situation(req);
      participant(s, address);
      if (s.snapshot.state !== 2) fail(409, "RELATIONSHIP_NOT_ACTIVE");
      const body =
        kind === "meeting"
          ? z.object({ date: z.string().date() }).strict().parse(req.body)
          : uuidBody.parse(req.body);
      if ("date" in body) {
        const date = body.date as string;
        if (
          date <
            new Date(Number(s.snapshot.activatedAt) * 1000)
              .toISOString()
              .slice(0, 10) ||
          date > new Date(now() * 1000).toISOString().slice(0, 10)
        )
          fail(422, "INVALID_MEETING_DATE");
      }
      return idempotent(req, address, body, () => {
        if (
          kind === "relationship-check" &&
          q(
            "SELECT id FROM records WHERE situation=? AND kind=? AND confirmed=0",
            s.address.toLowerCase(),
            kind,
          )
        )
          fail(409, "IN_FLIGHT");
        const id = randomUUID();
        const unique =
          kind === "meeting" ? store.unique(String((body as any).date)) : id;
        if (
          q(
            "SELECT id FROM records WHERE situation=? AND kind=? AND unique_key=?",
            s.address.toLowerCase(),
            kind,
            unique,
          )
        )
          fail(409, "DUPLICATE_RECORD");
        const record = {
          id,
          kind,
          ...body,
          proposer: address,
          createdAt: now(),
          observedBlock: s.observedBlock.toString(),
          confirmedAt: null,
        };
        exec(
          "INSERT INTO records(id,situation,kind,owner,unique_key,body,created) VALUES(?,?,?,?,?,?,?)",
          id,
          s.address.toLowerCase(),
          kind,
          address,
          unique,
          store.seal(record),
          now(),
        );
        return record;
      });
    });
    post(`/situations/:s/${plural}/:id/confirm`, async (req) => {
      const address = user(req);
      const s = await situation(req);
      participant(s, address);
      if (s.snapshot.state !== 2) fail(409, "RELATIONSHIP_NOT_ACTIVE");
      uuidBody.parse(req.body);
      const id = z
        .string()
        .uuid()
        .parse((req.params as any).id);
      return idempotent(
        req,
        address,
        {},
        () => {
          const row = q(
            "SELECT * FROM records WHERE id=? AND situation=? AND kind=?",
            id,
            s.address.toLowerCase(),
            kind,
          );
          if (!row) fail(404, "NOT_FOUND");
          if (row.owner === address) fail(403, "COUNTERPARTY_REQUIRED");
          if (row.confirmed) fail(409, "ALREADY_CONFIRMED");
          const record = {
            ...store.open(row.body),
            confirmedBy: address,
            confirmedAt: now(),
            observedBlock: s.observedBlock.toString(),
          };
          exec(
            "UPDATE records SET body=?,confirmed=1 WHERE id=?",
            store.seal(record),
            id,
          );
          return record;
        },
        200,
      );
    });
  }
  app.get("/api/v1/situations/:s/records", async (req) => {
    const address = user(req);
    const s = await situation(req);
    participant(s, address);
    const query = z
      .object({
        month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        cursor: z.string().uuid().optional(),
      })
      .strict()
      .parse(req.query);
    const records = all(
      "SELECT * FROM records WHERE situation=? AND id>? ORDER BY id",
      s.address.toLowerCase(),
      query.cursor ?? "",
    )
      .map((row) => store.open(row.body))
      .filter((r) =>
        (r.date ?? new Date(r.createdAt * 1000).toISOString()).startsWith(
          query.month,
        ),
      )
      .map((r) => ({
        ...r,
        invalidated:
          !!s.snapshot.terminatedAt &&
          (r.createdAt > Number(s.snapshot.terminatedAt) ||
            r.confirmedAt > Number(s.snapshot.terminatedAt)),
      }));
    return {
      data: {
        meetings: records.slice(0, 100).filter((r) => r.kind === "meeting"),
        relationshipChecks: records
          .slice(0, 100)
          .filter((r) => r.kind === "relationship-check"),
        nextCursor: records.length > 100 ? records[99].id : null,
      },
    };
  });
  async function caseAccess(req: FastifyRequest, allowOwner = false) {
    const address = user(req);
    const s = await situation(req);
    const id = z
      .string()
      .regex(/^[1-9][0-9]*$/)
      .refine((s) => BigInt(s) < 2n ** 64n)
      .parse((req.params as any).d);
    const who = role(s, address);
    if (!who) fail(404, "NOT_FOUND");
    retention(s);
    const data = await chain.caseData(s.address, BigInt(id), s.observedBlock);
    if (who === "SUPERVISOR" && !data.dispute.wasEscalated && !allowOwner)
      fail(404, "NOT_FOUND");
    return { address, s, id, who, ...data };
  }
  async function registered(
    s: ChainSituation,
    id: string,
    owner: Address,
    commitment: Hex,
  ) {
    const d = await chain.caseData(s.address, BigInt(id), s.observedBlock);
    const i = same(owner, s.participantA) ? 0 : 1;
    for (let index = 0; index < d.dispute.evidenceCounts[i]; index++) {
      const h = await chain.client.readContract({
        address: s.address,
        abi: SituationAgreementAbi,
        functionName: "getEvidence",
        args: [BigInt(id), owner, index],
        blockNumber: s.observedBlock,
      });
      if (same(h, commitment)) return true;
    }
    return false;
  }
  app.get("/api/v1/situations/:s/disputes/:d", async (req) => {
    const c = await caseAccess(req);
    const rows = all(
      "SELECT * FROM evidence WHERE situation=? AND dispute=?",
      c.s.address.toLowerCase(),
      c.id,
    );
    const visible = [];
    for (const row of rows) {
      const isRegistered = await registered(
        c.s,
        c.id,
        row.owner,
        row.commitment,
      );
      if (
        isRegistered ||
        (row.owner === c.address && now() <= Number(c.dispute.appealDeadline))
      )
        visible.push({
          id: row.id,
          owner: row.owner,
          commitment: row.commitment,
          registered: isRegistered,
        });
    }
    return {
      data: jsonSafe({
        dispute: {
          ...c.dispute,
          status: [
            "NONE",
            "APPEAL",
            "VOTING",
            "UPHELD",
            "REJECTED",
            "TIMED_OUT",
            "RESUMED",
            "MUTUAL_END",
          ][c.dispute.status],
          resolutionMode: ["RESUME", "END_REFUND"][c.dispute.resolutionMode],
        },
        check: {
          ...c.check,
          status: [
            "NONE",
            "WAITING",
            "RESPONDED",
            "WITHDRAWN",
            "EXPIRED",
            "CLAIMED",
          ][c.check.status],
        },
        evidence: visible,
        observedBlock: c.s.observedBlock,
      }),
    };
  });
  post("/situations/:s/disputes/:d/evidence", async (req) => {
    const c = await caseAccess(req, true);
    participant(c.s, c.address);
    if (
      c.s.snapshot.state !== 4 ||
      c.s.snapshot.currentDisputeId !== BigInt(c.id) ||
      c.dispute.status !== 1 ||
      now() > Number(c.dispute.appealDeadline) ||
      c.s.chainTime > c.dispute.appealDeadline
    )
      fail(409, "EVIDENCE_WINDOW_CLOSED");
    const fields: Record<string, string> = {};
    let file: Buffer | undefined;
    let mimetype = "";
    for await (const part of req.parts()) {
      if (part.type === "file") {
        if (part.fieldname !== "file") fail(422, "INVALID_FIELD");
        file = await part.toBuffer();
        mimetype = part.mimetype;
        if (part.file.truncated) fail(413, "FILE_TOO_LARGE");
      } else {
        if (fields[part.fieldname] !== undefined) fail(422, "DUPLICATE_FIELD");
        fields[part.fieldname] = String(part.value);
      }
    }
    const input = z
      .object({
        kind: z.enum(["text", "image"]),
        text: z.string().max(8000).optional(),
        consentVersion: z.literal("1"),
        shareWithCasePanel: z.literal("true"),
      })
      .strict()
      .parse(fields);
    let bytes: Buffer;
    let kind = input.kind;
    if (kind === "text") {
      if (file || input.text === undefined) fail(422, "TEXT_REQUIRED");
      const normalized = input.text.replace(/\r\n?/g, "\n");
      if (!normalized.length || Array.from(normalized).length > 4000)
        fail(422, "TEXT_LIMIT");
      bytes = Buffer.from(normalized);
    } else {
      if (
        input.text !== undefined ||
        !file ||
        !["image/jpeg", "image/png", "image/webp"].includes(mimetype)
      )
        fail(415, "UNSUPPORTED_IMAGE");
      try {
        const image = sharp(file, { limitInputPixels: 20000000 });
        const metadata = await image.metadata();
        if (!["jpeg", "png", "webp"].includes(metadata.format ?? ""))
          fail(415, "UNSUPPORTED_IMAGE");
        bytes = await image.rotate().png().toBuffer();
      } catch {
        fail(415, "UNSUPPORTED_IMAGE");
      }
      if (bytes.length > 5 * 1024 * 1024)
        fail(413, "NORMALIZED_IMAGE_TOO_LARGE");
    }
    const sha = ("0x" + digest(bytes)) as Hex;
    const salt = ("0x" + randomBytes(32).toString("hex")) as Hex;
    const commitment = evidenceCommitment(
      config.chainId,
      c.s.address,
      BigInt(c.id),
      c.address,
      sha,
      salt,
    );
    return idempotent(req, c.address, { fields, fileHash: sha }, () => {
      if (
        Number(
          q(
            "SELECT COUNT(*) AS n FROM evidence WHERE situation=? AND dispute=? AND owner=?",
            c.s.address.toLowerCase(),
            c.id,
            c.address,
          )?.n,
        ) >= 10
      )
        fail(409, "EVIDENCE_LIMIT");
      const id = randomUUID();
      const body = {
        kind,
        content: bytes.toString("base64"),
        contentSha256: sha,
        salt,
        commitment,
      };
      exec(
        "INSERT INTO evidence VALUES(?,?,?,?,?,?,?)",
        id,
        c.s.address.toLowerCase(),
        c.id,
        c.address,
        commitment,
        store.seal(body),
        now(),
      );
      return {
        id,
        commitment,
        owner: c.address,
        disputeId: c.id,
        normalizedPreview:
          kind === "text"
            ? bytes.toString()
            : "data:image/png;base64," + bytes.toString("base64"),
      };
    });
  });
  async function evidenceAccess(req: FastifyRequest) {
    const c = await caseAccess(req);
    const id = z
      .string()
      .uuid()
      .parse((req.params as any).id);
    const row = q(
      "SELECT * FROM evidence WHERE id=? AND situation=? AND dispute=?",
      id,
      c.s.address.toLowerCase(),
      c.id,
    );
    if (!row) fail(404, "NOT_FOUND");
    const isRegistered = await registered(c.s, c.id, row.owner, row.commitment);
    if (!isRegistered) {
      if (row.owner !== c.address) fail(404, "NOT_FOUND");
      if (now() > Number(c.dispute.appealDeadline))
        fail(410, "UNREGISTERED_EXPIRED");
    }
    const body = store.open(row.body);
    const bytes = Buffer.from(body.content, "base64");
    if (
      body.contentSha256 !== "0x" + digest(bytes) ||
      !same(
        evidenceCommitment(
          config.chainId,
          c.s.address,
          BigInt(c.id),
          row.owner,
          body.contentSha256,
          body.salt,
        ),
        row.commitment,
      )
    )
      fail(409, "EVIDENCE_MISMATCH");
    return { body, bytes };
  }
  app.get("/api/v1/situations/:s/disputes/:d/evidence/:id", async (req) => {
    const { body, bytes } = await evidenceAccess(req);
    return {
      data: {
        kind: body.kind,
        contentSha256: body.contentSha256,
        salt: body.salt,
        commitment: body.commitment,
        ...(body.kind === "text"
          ? { text: bytes.toString() }
          : { contentPath: req.url + "/content" }),
      },
    };
  });
  app.get(
    "/api/v1/situations/:s/disputes/:d/evidence/:id/content",
    async (req, reply) => {
      const { body, bytes } = await evidenceAccess(req);
      if (body.kind !== "image") fail(404, "NOT_FOUND");
      return reply.type("image/png").send(bytes);
    },
  );
  async function cleanup() {
    exec("DELETE FROM challenges WHERE expires<?", now());
    exec("DELETE FROM sessions WHERE expires<?", now());
    exec("DELETE FROM idempotency WHERE created<?", now() - 86400);
    for (const row of all("SELECT * FROM agreements WHERE deleted=0")) {
      let expired = !row.situation && row.created + 7 * 86400 < now();
      if (row.situation) {
        try {
          const s = await chain.read(row.situation);
          expired =
            !!s.snapshot.terminatedAt &&
            BigInt(now()) >= s.snapshot.terminatedAt + 30n * 86400n;
          for (const item of all(
            "SELECT * FROM evidence WHERE situation=?",
            row.situation,
          )) {
            const data = await chain.caseData(
              row.situation,
              BigInt(item.dispute),
              s.observedBlock,
            );
            if (
              BigInt(now()) > data.dispute.appealDeadline + 86400n &&
              !(await registered(s, item.dispute, item.owner, item.commitment))
            )
              exec("DELETE FROM evidence WHERE id=?", item.id);
          }
        } catch {
          continue;
        }
      }
      if (expired)
        store.transaction(() => {
          exec("UPDATE agreements SET body='',deleted=1 WHERE id=?", row.id);
          exec("DELETE FROM records WHERE situation=?", row.situation ?? "");
          exec("DELETE FROM evidence WHERE situation=?", row.situation ?? "");
        });
    }
    store.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  }
  let cleaning = false;
  const safeCleanup = async () => {
    if (cleaning) return;
    cleaning = true;
    try {
      await cleanup();
    } finally {
      cleaning = false;
    }
  };
  app.addHook("onReady", safeCleanup);
  const timer = setInterval(() => {
    void safeCleanup().catch(() => {});
  }, 3600000);
  timer.unref();
  app.addHook("onClose", async () => {
    clearInterval(timer);
    store.close();
  });
  return { app, store, chain, cleanup: safeCleanup };
}
