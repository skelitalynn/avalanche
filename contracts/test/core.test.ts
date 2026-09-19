import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  createTestClient,
  http,
  encodeFunctionData,
  type Address,
  type Hex,
  type Abi,
} from "viem";
import { hardhat } from "viem/chains";
import {
  SituationFactoryAbi as F,
  SituationAgreementAbi as A,
  TestUSDCAbi as T,
  hashDocument,
  type AgreementDocument,
  assertPublicAgreement,
} from "../../packages/shared/src/index.js";
import { createApp } from "../../apps/api/src/app.js";
const rpc = "http://127.0.0.1:18545";
const client = createPublicClient({
  chain: hardhat,
  transport: http(rpc, { retryCount: 0 }),
  pollingInterval: 20,
});
const testClient = createTestClient({
  chain: hardhat,
  mode: "hardhat",
  transport: http(rpc),
});
let child: ChildProcess;
let accounts: Address[];
let token: Address;
let factory: Address;
const wallet = (who: Address) =>
  createWalletClient({ account: who, chain: hardhat, transport: http(rpc) });
const hash = () => ("0x" + randomBytes(32).toString("hex")) as Hex;
async function send(
  address: Address,
  abi: Abi,
  name: string,
  args: readonly unknown[] = [],
  who = accounts[0],
) {
  const tx = await wallet(who).writeContract({
    address,
    abi,
    functionName: name,
    args,
  });
  const receipt = await client.waitForTransactionReceipt({ hash: tx });
  assert.equal(receipt.status, "success");
  return tx;
}
const call = (address: Address, name: string, args: readonly unknown[] = []) =>
  client.readContract({
    address,
    abi: A,
    functionName: name as any,
    args: args as any,
  }) as Promise<any>;
const snap = (address: Address) => call(address, "snapshot");
const balance = (who: Address) =>
  client.readContract({
    address: token,
    abi: T,
    functionName: "balanceOf",
    args: [who],
  });
async function deploy(name: string, args: unknown[] = []) {
  const a = JSON.parse(
    await readFile(
      `contracts/artifacts/contracts/src/${name}.sol/${name}.json`,
      "utf8",
    ),
  );
  const h = await wallet(accounts[0]).deployContract({
    abi: a.abi,
    bytecode: a.bytecode,
    args,
  });
  const r = await client.waitForTransactionReceipt({ hash: h });
  assert.equal(r.status, "success");
  return r.contractAddress!;
}
function document(): AgreementDocument {
  return {
    version: 1,
    chainId: 31337,
    factory: factory.toLowerCase() as Address,
    nonce: hash(),
    participantA: accounts[0].toLowerCase() as Address,
    participantB: accounts[1].toLowerCase() as Address,
    supervisors: accounts.slice(2, 5).map((a) => a.toLowerCase()) as [
      Address,
      Address,
      Address,
    ],
    recoveryAmount: "50000000",
    bondAmount: "20000000",
    ghostWindowSeconds: 86400,
    meetingTarget: 1,
    confirmationEveryDays: 7,
    policyVersion: "1",
    salt: hash(),
  };
}
function params(d: AgreementDocument) {
  return {
    participantB: d.participantB,
    supervisors: d.supervisors,
    recoveryAmount: BigInt(d.recoveryAmount),
    bondAmount: BigInt(d.bondAmount),
    ghostWindow: d.ghostWindowSeconds,
    agreementHash: hashDocument(d),
  };
}
async function create(d = document()) {
  const tx = await send(factory, F, "createSituation", [params(d)]);
  const address = await client.readContract({
    address: factory,
    abi: F,
    functionName: "situationOf",
    args: [accounts[0], hashDocument(d)],
  });
  return { address, d, tx };
}
async function ready(s: Address, d: AgreementDocument) {
  await send(s, A, "acceptAgreement", [hashDocument(d)], accounts[1]);
  for (const a of accounts.slice(2, 5))
    await send(s, A, "acceptSupervision", [hashDocument(d)], a);
}
async function fund(s: Address, who: Address) {
  await send(token, T, "mint", [who, 70000000n]);
  await send(token, T, "approve", [s, 70000000n], who);
  await send(s, A, "deposit", [], who);
}
async function active() {
  const c = await create();
  await ready(c.address, c.d);
  await fund(c.address, accounts[0]);
  await fund(c.address, accounts[1]);
  return c;
}
async function at(time: bigint) {
  await testClient.setNextBlockTimestamp({ timestamp: time });
}
async function mineAt(time: bigint) {
  await at(time);
  await testClient.mine({ blocks: 1 });
}
async function disputed(accused = 0) {
  const c = await active();
  await send(c.address, A, "sendCheck", [], accounts[1 - accused]);
  const check = await call(c.address, "getCheck", [1n]);
  await at(check.deadline + 1n);
  await send(c.address, A, "openDispute", [1n], accounts[1 - accused]);
  return c;
}
async function voting(accused = 0) {
  const c = await disputed(accused);
  const d = await call(c.address, "getDispute", [1n]);
  await at(d.appealDeadline + 1n);
  await send(c.address, A, "startVoting", [1n]);
  return c;
}
before(async () => {
  child = spawn(
    process.execPath,
    [
      "node_modules/hardhat/dist/src/cli.js",
      "node",
      "--network",
      "local",
      "--hostname",
      "127.0.0.1",
      "--port",
      "18545",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const deadline = Date.now() + 20000;
  for (;;) {
    try {
      await client.getChainId();
      break;
    } catch {
      if (Date.now() > deadline) throw Error("Local test EVM failed to start");
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  accounts = await createWalletClient({
    chain: hardhat,
    transport: http(rpc),
  }).getAddresses();
  token = await deploy("TestUSDC");
  factory = await deploy("SituationFactory", [token]);
});
after(() => {
  child?.kill("SIGTERM");
});
test("AC-01/13/14/17: five identities, immutable hash, duplicate factory binding", async () => {
  const d = document();
  await assert.rejects(
    send(factory, F, "createSituation", [
      { ...params(d), participantB: accounts[0] },
    ]),
  );
  await assert.rejects(
    send(factory, F, "createSituation", [
      { ...params(d), recoveryAmount: 9999n },
    ]),
  );
  await assert.rejects(
    send(factory, F, "createSituation", [{ ...params(d), ghostWindow: 60 }]),
  );
  const c = await create(d);
  await assert.rejects(send(factory, F, "createSituation", [params(d)]));
  await assert.rejects(
    send(c.address, A, "acceptAgreement", [hashDocument(d)], accounts[5]),
  );
  await assert.rejects(
    send(c.address, A, "acceptAgreement", [hash()], accounts[1]),
  );
  await send(c.address, A, "acceptAgreement", [hashDocument(d)], accounts[1]);
  assert.equal((await snap(c.address)).state, 1);
});
test("AC-02/04/09: gates, exact deposits, mutual refund and no repeated payment", async () => {
  const c = await create();
  await assert.rejects(fund(c.address, accounts[0]));
  await send(c.address, A, "acceptAgreement", [hashDocument(c.d)], accounts[1]);
  await assert.rejects(send(c.address, A, "deposit"));
  for (const a of accounts.slice(2, 5))
    await send(c.address, A, "acceptSupervision", [hashDocument(c.d)], a);
  await assert.rejects(
    send(c.address, A, "acceptSupervision", [hashDocument(c.d)], accounts[2]),
  );
  await fund(c.address, accounts[0]);
  await assert.rejects(send(c.address, A, "deposit"));
  await fund(c.address, accounts[1]);
  assert.equal((await snap(c.address)).state, 2);
  const before = [await balance(accounts[0]), await balance(accounts[1])];
  await send(c.address, A, "requestEnd");
  assert.equal((await snap(c.address)).state, 3);
  await assert.rejects(send(c.address, A, "confirmEnd", [1n]));
  await send(c.address, A, "confirmEnd", [1n], accounts[1]);
  const s = await snap(c.address);
  assert.equal(s.state, 6);
  assert.deepEqual(s.paid, [70000000n, 70000000n]);
  assert.equal(await balance(accounts[0]), before[0] + 70000000n);
  assert.equal(await balance(accounts[1]), before[1] + 70000000n);
  await assert.rejects(send(c.address, A, "confirmEnd", [1n], accounts[1]));
  await assert.rejects(send(c.address, A, "retryPayout", [accounts[0]]));
});
for (const accused of [0, 1])
  test(`AC-07/08/09: two votes punish only accused ${accused}`, async () => {
    const c = await voting(accused);
    await assert.rejects(send(c.address, A, "vote", [1n, true], accounts[5]));
    await send(c.address, A, "vote", [1n, true], accounts[2]);
    assert.equal((await snap(c.address)).state, 4);
    await assert.rejects(send(c.address, A, "vote", [1n, true], accounts[2]));
    await send(c.address, A, "vote", [1n, true], accounts[3]);
    assert.deepEqual(
      (await snap(c.address)).paid,
      accused === 0 ? [50000000n, 90000000n] : [90000000n, 50000000n],
    );
    await assert.rejects(send(c.address, A, "vote", [1n, true], accounts[4]));
  });
test("AC-15/16: deadline inclusive, partial deposit cancellation and invitation expiry", async () => {
  let c = await create();
  await at((await snap(c.address)).invitationDeadline);
  await send(c.address, A, "acceptAgreement", [hashDocument(c.d)], accounts[1]);
  assert.equal((await snap(c.address)).state, 1);
  c = await create();
  await at((await snap(c.address)).invitationDeadline + 1n);
  await assert.rejects(
    send(c.address, A, "acceptAgreement", [hashDocument(c.d)], accounts[1]),
  );
  await send(c.address, A, "expire", [], accounts[5]);
  assert.equal((await snap(c.address)).state, 7);
  c = await create();
  await ready(c.address, c.d);
  await fund(c.address, accounts[0]);
  await send(c.address, A, "cancel", [], accounts[1]);
  assert.deepEqual((await snap(c.address)).paid, [70000000n, 0n]);
  assert.equal((await snap(c.address)).state, 7);
});
test("AC-05/18/19: timely vs late reply, one in-flight check and expiry", async () => {
  const c = await active();
  await assert.rejects(send(c.address, A, "openDispute", [1n]));
  await send(c.address, A, "sendCheck");
  await assert.rejects(send(c.address, A, "sendCheck"));
  await assert.rejects(send(c.address, A, "openDispute", [1n]));
  let check = await call(c.address, "getCheck", [1n]);
  await at(check.deadline);
  await send(c.address, A, "respond", [1n], accounts[1]);
  assert.equal((await call(c.address, "getCheck", [1n])).status, 2);
  await assert.rejects(send(c.address, A, "openDispute", [1n]));
  await send(c.address, A, "sendCheck");
  await send(c.address, A, "withdrawCheck", [2n]);
  await send(c.address, A, "sendCheck");
  check = await call(c.address, "getCheck", [3n]);
  await at(check.deadline + 1n);
  await send(c.address, A, "respond", [3n], accounts[1]);
  assert.equal((await call(c.address, "getCheck", [3n])).status, 1);
  await at(check.claimDeadline + 1n);
  await send(c.address, A, "expireCheck", [3n], accounts[5]);
  await assert.rejects(send(c.address, A, "openDispute", [3n]));
  await send(c.address, A, "sendCheck");
  assert.equal((await snap(c.address)).currentCheckId, 4n);
});
test("AC-20/21: fixed windows, negative majority and timeout without escalation", async () => {
  let c = await disputed();
  const d = await call(c.address, "getDispute", [1n]);
  await assert.rejects(send(c.address, A, "startVoting", [1n]));
  await assert.rejects(send(c.address, A, "vote", [1n, true], accounts[2]));
  await assert.rejects(send(c.address, A, "finalizeTimeout", [1n]));
  await at(d.voteDeadline + 1n);
  await send(c.address, A, "finalizeTimeout", [1n], accounts[5]);
  assert.deepEqual((await snap(c.address)).paid, [70000000n, 70000000n]);
  c = await voting();
  await send(c.address, A, "vote", [1n, false], accounts[2]);
  await send(c.address, A, "vote", [1n, false], accounts[3]);
  assert.equal((await call(c.address, "getDispute", [1n])).status, 4);
  assert.deepEqual((await snap(c.address)).paid, [70000000n, 70000000n]);
});
test("AC-22/23: bilateral resolution and stale requests cannot overwrite termination", async () => {
  const c = await disputed();
  const activated = (await snap(c.address)).activatedAt;
  await send(c.address, A, "proposeResolution", [1n, 0]);
  await assert.rejects(send(c.address, A, "confirmResolution", [1n, 1n]));
  await send(c.address, A, "proposeResolution", [1n, 0]);
  await assert.rejects(
    send(c.address, A, "confirmResolution", [1n, 1n], accounts[1]),
  );
  await send(c.address, A, "confirmResolution", [1n, 2n], accounts[1]);
  assert.equal((await snap(c.address)).activatedAt, activated);
  assert.equal((await snap(c.address)).state, 2);
  await assert.rejects(send(c.address, A, "openDispute", [1n], accounts[1]));
  await send(c.address, A, "requestEnd");
  await send(c.address, A, "withdrawEnd", [1n]);
  await send(c.address, A, "requestEnd");
  await assert.rejects(send(c.address, A, "confirmEnd", [1n], accounts[1]));
  await send(c.address, A, "confirmEnd", [2n], accounts[1]);
  await assert.rejects(
    send(c.address, A, "confirmResolution", [1n, 2n], accounts[1]),
  );
});
test("AC-24/31: isolated failed payment and reentrancy cannot duplicate funds", async () => {
  const c = await active();
  await send(token, T, "setBlocked", [accounts[0], true]);
  await send(token, T, "setCallback", [
    c.address,
    encodeFunctionData({
      abi: A,
      functionName: "retryPayout",
      args: [accounts[1]],
    }),
  ]);
  await send(c.address, A, "requestEnd");
  await send(c.address, A, "confirmEnd", [1n], accounts[1]);
  let s = await snap(c.address);
  assert.equal(s.state, 5);
  assert.deepEqual(s.paid, [0n, 70000000n]);
  await assert.rejects(
    send(c.address, A, "executePayout", [accounts[0]], accounts[5]),
  );
  await send(c.address, A, "retryPayout", [accounts[0]], accounts[5]);
  assert.deepEqual((await snap(c.address)).paid, [0n, 70000000n]);
  await send(token, T, "setBlocked", [accounts[0], false]);
  await send(c.address, A, "retryPayout", [accounts[0]], accounts[5]);
  s = await snap(c.address);
  assert.equal(s.state, 6);
  assert.deepEqual(s.paid, [70000000n, 70000000n]);
  await send(token, T, "setCallback", [
    "0x0000000000000000000000000000000000000000",
    "0x",
  ]);
});
test("AC-17/26/29: fee tokens roll back deposits; case evidence hash limits and freeze", async () => {
  const c = await create();
  await ready(c.address, c.d);
  await send(token, T, "setFee", [1n]);
  await assert.rejects(fund(c.address, accounts[0]));
  assert.deepEqual((await snap(c.address)).funded, [false, false]);
  await send(token, T, "setFee", [0n]);
  const d = await disputed();
  const commitment = hash();
  await send(d.address, A, "registerEvidence", [1n, commitment]);
  await assert.rejects(
    send(d.address, A, "registerEvidence", [1n, commitment], accounts[1]),
  );
  await assert.rejects(
    send(d.address, A, "registerEvidence", [1n, hash()], accounts[2]),
  );
  for (let i = 1; i < 10; i++)
    await send(d.address, A, "registerEvidence", [1n, hash()]);
  await assert.rejects(send(d.address, A, "registerEvidence", [1n, hash()]));
  const dispute = await call(d.address, "getDispute", [1n]);
  await at(dispute.appealDeadline + 1n);
  await send(d.address, A, "startVoting", [1n]);
  await assert.rejects(
    send(d.address, A, "registerEvidence", [1n, hash()], accounts[1]),
  );
});

test("AC-01/10/25/27/28/29/30: SIWE, private agreement, records and evidence across roles", async () => {
  const dir = await mkdtemp(join(tmpdir(), "situation-api-"));
  const c = await create();
  let clock = Number((await client.getBlock()).timestamp) * 1000;
  const { app, store, cleanup } = createApp({
    origin: "http://localhost:5173",
    rpc,
    chainId: 31337,
    factory,
    token,
    database: join(dir, "test.sqlite"),
    encryptionKey: randomBytes(32).toString("hex"),
    clock: () => clock,
  });
  const origin = "http://localhost:5173";
  const cookies = new Map<Address, string>();
  async function request(
    who: Address,
    method: "GET" | "POST" | "DELETE",
    url: string,
    body?: unknown,
    key = randomUUID(),
  ) {
    return app.inject({
      method,
      url: "/api/v1" + url,
      headers: {
        origin,
        cookie: cookies.get(who) ?? "",
        "idempotency-key": key,
      },
      ...(body === undefined ? {} : { payload: body as any }),
    });
  }
  async function login(who: Address) {
    const res = await request(who, "POST", "/auth/challenge", { address: who });
    assert.equal(res.statusCode, 200);
    const cookie = res.cookies[0].name + "=" + res.cookies[0].value;
    const message = res.json().data.message;
    const signature = await wallet(who).signMessage({ message });
    const verify = () =>
      app.inject({
        method: "POST",
        url: "/api/v1/auth/verify",
        headers: { origin, cookie },
        payload: { message, signature },
      });
    const ok = await verify();
    assert.equal(ok.statusCode, 200, ok.body);
    cookies.set(
      who,
      "session=" + ok.cookies.find((c) => c.name === "session")!.value,
    );
    assert.equal((await verify()).statusCode, 401);
  }
  try {
    await app.ready();
    assert.equal(
      (await app.inject({ method: "GET", url: "/api/v1/health" })).statusCode,
      200,
    );
    assert.equal(
      (await request(accounts[0], "GET", "/situations")).statusCode,
      401,
    );
    for (const who of accounts.slice(0, 6)) await login(who);
    const key = randomUUID();
    let res = await request(
      accounts[0],
      "POST",
      "/agreements",
      { document: c.d },
      key,
    );
    assert.equal(res.statusCode, 201, res.body);
    const id = res.json().data.id;
    const again = await request(
      accounts[0],
      "POST",
      "/agreements",
      { document: c.d },
      key,
    );
    assert.equal(again.json().data.id, id);
    assert.equal(
      (
        await request(
          accounts[0],
          "POST",
          "/agreements",
          { document: { ...c.d, meetingTarget: 2 } },
          key,
        )
      ).statusCode,
      409,
    );
    assert.equal(
      (await request(accounts[1], "GET", "/agreements/" + id)).statusCode,
      404,
    );
    const unrelatedCreation = await create();
    assert.equal(
      (
        await request(accounts[0], "POST", `/agreements/${id}/link`, {
          txHash: unrelatedCreation.tx,
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await request(accounts[0], "POST", `/agreements/${id}/link`, {
          txHash: c.tx,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (await request(accounts[1], "GET", "/agreements/" + id)).statusCode,
      200,
    );
    assert.equal(
      (await request(accounts[2], "GET", "/agreements/" + id)).statusCode,
      404,
    );
    assert.equal(
      (await request(accounts[5], "GET", "/situations/" + c.address))
        .statusCode,
      404,
    );
    assert.equal(
      (
        await request(
          accounts[2],
          "GET",
          `/situations/${c.address}/supervision-invitation`,
        )
      ).statusCode,
      200,
    );
    const listed = (await request(accounts[0], "GET", "/situations")).json()
      .data.items;
    assert.equal(
      listed.find((item: any) => item.address === c.address.toLowerCase())
        .state,
      "INVITED",
    );
    const detail = (
      await request(accounts[0], "GET", `/situations/${c.address}`)
    ).json().data.chain;
    assert.equal(detail.state, "INVITED");
    assert.equal(detail.terminationReason, "NONE");
    await ready(c.address, c.d);
    await fund(c.address, accounts[0]);
    await fund(c.address, accounts[1]);
    clock = Number((await client.getBlock()).timestamp) * 1000;
    const date = new Date(clock).toISOString().slice(0, 10);
    res = await request(
      accounts[0],
      "POST",
      `/situations/${c.address}/meetings`,
      { date },
    );
    assert.equal(res.statusCode, 201, res.body);
    const meeting = res.json().data.id;
    assert.equal(
      (
        await request(
          accounts[0],
          "POST",
          `/situations/${c.address}/meetings/${meeting}/confirm`,
          {},
        )
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await request(
          accounts[1],
          "POST",
          `/situations/${c.address}/meetings/${meeting}/confirm`,
          {},
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await request(
          accounts[1],
          "POST",
          `/situations/${c.address}/meetings`,
          { date },
        )
      ).statusCode,
      409,
    );
    assert.equal(
      (await request(accounts[0], "GET", `/situations/${c.address}`)).json()
        .data.meetingCount,
      1,
    );
    assert.equal(
      (
        await request(
          accounts[2],
          "GET",
          `/situations/${c.address}/records?month=${date.slice(0, 7)}`,
        )
      ).statusCode,
      404,
    );
    const check = (
      await request(
        accounts[0],
        "POST",
        `/situations/${c.address}/relationship-checks`,
        {},
      )
    ).json().data.id;
    assert.equal(
      (
        await request(
          accounts[1],
          "POST",
          `/situations/${c.address}/relationship-checks/${check}/confirm`,
          {},
        )
      ).statusCode,
      200,
    );
    await send(c.address, A, "sendCheck", [], accounts[1]);
    const ch = await call(c.address, "getCheck", [1n]);
    await at(ch.deadline + 1n);
    await send(c.address, A, "openDispute", [1n], accounts[1]);
    clock = Number((await client.getBlock()).timestamp) * 1000;
    // Refresh after advancing days: expired SIWE sessions cannot be reused.
    assert.equal(
      (await request(accounts[0], "GET", "/situations")).statusCode,
      401,
    );
    for (const who of accounts.slice(0, 5)) await login(who);
    assert.equal(
      (await request(accounts[2], "GET", `/situations/${c.address}/disputes/1`))
        .statusCode,
      404,
    );
    const form = new FormData();
    form.set("kind", "text");
    form.set("text", "我的私人说明\r\n只交给本案");
    form.set("consentVersion", "1");
    form.set("shareWithCasePanel", "true");
    const httpReq = new Request("http://localhost", {
      method: "POST",
      body: form,
    });
    res = await app.inject({
      method: "POST",
      url: `/api/v1/situations/${c.address}/disputes/1/evidence`,
      headers: {
        origin,
        cookie: cookies.get(accounts[0])!,
        "idempotency-key": randomUUID(),
        "content-type": httpReq.headers.get("content-type")!,
      },
      payload: Buffer.from(await httpReq.arrayBuffer()),
    });
    assert.equal(res.statusCode, 201, res.body);
    const ev = res.json().data;
    const badImage = new FormData();
    badImage.set("kind", "image");
    badImage.set("consentVersion", "1");
    badImage.set("shareWithCasePanel", "true");
    badImage.set(
      "file",
      new Blob(["not a PNG"], { type: "image/png" }),
      "pretend.png",
    );
    const badRequest = new Request("http://localhost", {
      method: "POST",
      body: badImage,
    });
    const badUpload = await app.inject({
      method: "POST",
      url: `/api/v1/situations/${c.address}/disputes/1/evidence`,
      headers: {
        origin,
        cookie: cookies.get(accounts[0])!,
        "idempotency-key": randomUUID(),
        "content-type": badRequest.headers.get("content-type")!,
      },
      payload: Buffer.from(await badRequest.arrayBuffer()),
    });
    assert.equal(badUpload.statusCode, 415, badUpload.body);

    assert.equal(
      (
        await request(
          accounts[1],
          "GET",
          `/situations/${c.address}/disputes/1/evidence/${ev.id}`,
        )
      ).statusCode,
      404,
    );
    await send(c.address, A, "registerEvidence", [1n, ev.commitment]);
    assert.equal(
      (
        await request(
          accounts[1],
          "GET",
          `/situations/${c.address}/disputes/1/evidence/${ev.id}`,
        )
      ).statusCode,
      200,
    );
    const d = await call(c.address, "getDispute", [1n]);
    await at(d.appealDeadline + 1n);
    await send(c.address, A, "startVoting", [1n]);
    clock = Number((await client.getBlock()).timestamp) * 1000;
    for (const who of accounts.slice(0, 5)) await login(who);
    res = await request(
      accounts[2],
      "GET",
      `/situations/${c.address}/disputes/1/evidence/${ev.id}`,
    );
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().data.text, "我的私人说明\n只交给本案");
    const raw = store.db.prepare("SELECT body FROM evidence").get() as any;
    assert.ok(!raw.body.includes("私人"));
    await send(c.address, A, "vote", [1n, true], accounts[2]);
    await send(c.address, A, "vote", [1n, true], accounts[3]);
    clock = (Number((await snap(c.address)).terminatedAt) + 30 * 86400) * 1000;
    // Fresh signed sessions for access at retention boundary; API clock is deliberately advanced.
    for (const who of [accounts[0], accounts[2]]) await login(who);
    assert.equal(
      (
        await request(
          accounts[2],
          "GET",
          `/situations/${c.address}/disputes/1/evidence/${ev.id}`,
        )
      ).statusCode,
      410,
    );
    await cleanup();
    assert.equal(
      (store.db.prepare("SELECT COUNT(*) as n FROM evidence").get() as any).n,
      0,
    );
    assert.equal(
      (store.db.prepare("SELECT body FROM agreements").get() as any).body,
      "",
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/auth/challenge",
          headers: { origin: "https://evil.example" },
          payload: { address: accounts[0] },
        })
      ).statusCode,
      403,
    );
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("AC-13/15/16/17: invalid identities, amount endpoints, all preparation deadlines", async () => {
  for (const amount of [9999n, 1000000001n]) {
    await assert.rejects(
      send(factory, F, "createSituation", [
        { ...params(document()), recoveryAmount: amount },
      ]),
    );
    await assert.rejects(
      send(factory, F, "createSituation", [
        { ...params(document()), bondAmount: amount },
      ]),
    );
  }
  for (const amount of [10000n, 1000000000n]) {
    const d = {
      ...document(),
      recoveryAmount: String(amount),
      bondAmount: String(amount),
    };
    const c = await create(d);
    assert.equal(await call(c.address, "recoveryAmount"), amount);
  }
  const zero = "0x0000000000000000000000000000000000000000";
  for (const participantB of [zero, accounts[0], accounts[2]])
    await assert.rejects(
      send(factory, F, "createSituation", [
        { ...params(document()), participantB },
      ]),
    );
  for (const supervisors of [
    [zero, accounts[3], accounts[4]],
    [accounts[2], accounts[2], accounts[4]],
    [accounts[0], accounts[3], accounts[4]],
  ])
    await assert.rejects(
      send(factory, F, "createSituation", [
        { ...params(document()), supervisors },
      ]),
    );
  for (const phase of ["invitation", "funding"])
    for (const after of [false, true]) {
      const c = await create();
      if (phase === "funding")
        await send(
          c.address,
          A,
          "acceptAgreement",
          [hashDocument(c.d)],
          accounts[1],
        );
      const deadline = (await snap(c.address))[
        phase === "funding" ? "fundingDeadline" : "invitationDeadline"
      ];
      await mineAt(deadline + (after ? 1n : 0n));
      const accepted = () =>
        client.simulateContract({
          address: c.address,
          abi: A,
          functionName: "acceptSupervision",
          args: [hashDocument(c.d)],
          account: accounts[2],
        });
      const expired = () =>
        client.simulateContract({
          address: c.address,
          abi: A,
          functionName: "expire",
          account: accounts[5],
        });
      if (after) {
        await assert.rejects(accepted());
        await expired();
        await send(c.address, A, "expire", [], accounts[5]);
      } else {
        await accepted();
        await assert.rejects(expired());
        await send(c.address, A, "cancel");
      }
      assert.equal((await snap(c.address)).activatedAt, 0n);
      assert.deepEqual((await snap(c.address)).paid, [0n, 0n]);
      await assert.rejects(send(c.address, A, "cancel"));
    }
  for (const after of [false, true]) {
    const c = await create();
    await ready(c.address, c.d);
    await send(token, T, "mint", [accounts[0], 70000000n]);
    await send(token, T, "approve", [c.address, 70000000n]);
    await at((await snap(c.address)).fundingDeadline + (after ? 1n : 0n));
    if (after) {
      await assert.rejects(send(c.address, A, "deposit"));
      await send(c.address, A, "expire", [], accounts[5]);
    } else {
      await send(c.address, A, "deposit");
      await send(c.address, A, "expire", [], accounts[5]);
    }
    assert.deepEqual(
      (await snap(c.address)).paid,
      after ? [0n, 0n] : [70000000n, 0n],
    );
  }
});

test("AC-18/20/21/22: late reply remains claimable, fixed clocks, split and single votes refund", async () => {
  const c = await active();
  await send(c.address, A, "sendCheck");
  const check = await call(c.address, "getCheck", [1n]);
  await at(check.deadline + 1n);
  await send(c.address, A, "respond", [1n], accounts[1]);
  await send(c.address, A, "openDispute", [1n]);
  await send(c.address, A, "proposeResolution", [1n, 1]);
  assert.deepEqual((await snap(c.address)).paid, [0n, 0n]);
  await send(c.address, A, "confirmResolution", [1n, 1n], accounts[1]);
  assert.deepEqual((await snap(c.address)).paid, [70000000n, 70000000n]);
  for (const split of [false, true]) {
    const c = await voting();
    const d = await call(c.address, "getDispute", [1n]);
    assert.equal(d.appealDeadline - d.openedAt, 48n * 3600n);
    assert.equal(d.voteDeadline - d.openedAt, 120n * 3600n);
    await send(c.address, A, "vote", [1n, true], accounts[2]);
    if (split) await send(c.address, A, "vote", [1n, false], accounts[3]);
    await assert.rejects(send(c.address, A, "finalizeTimeout", [1n]));
    await at(d.voteDeadline + 1n);
    await send(c.address, A, "finalizeTimeout", [1n], accounts[5]);
    assert.deepEqual((await snap(c.address)).paid, [70000000n, 70000000n]);
    assert.equal((await snap(c.address)).state, 6);
    await assert.rejects(send(c.address, A, "vote", [1n, true], accounts[4]));
  }
});

test("AC-23/31: same-block races in both orders allocate exactly once", async () => {
  async function race(
    address: Address,
    commands: { who: Address; name: string; args: readonly unknown[] }[],
  ) {
    await testClient.setAutomine(false);
    try {
      const hashes: Hex[] = [];
      for (const command of commands)
        hashes.push(
          await wallet(command.who).writeContract({
            address,
            abi: A,
            functionName: command.name as any,
            args: command.args as any,
            gas: 3000000n,
            gasPrice: 2000000000n,
          }),
        );
      await testClient.mine({ blocks: 1 });
      const receipts = await Promise.all(
        hashes.map((hash) => client.getTransactionReceipt({ hash })),
      );
      assert.equal(receipts[0].blockHash, receipts[1].blockHash);
      assert.deepEqual(
        receipts.map((r) => r.status),
        ["success", "reverted"],
      );
    } finally {
      await testClient.setAutomine(true);
    }
  }
  for (const reverse of [false, true]) {
    const c = await active();
    await send(c.address, A, "sendCheck");
    await send(c.address, A, "requestEnd");
    await at((await call(c.address, "getCheck", [1n])).deadline + 1n);
    const commands = [
      { who: accounts[1], name: "confirmEnd", args: [1n] },
      { who: accounts[0], name: "openDispute", args: [1n] },
    ];
    await race(c.address, reverse ? commands.reverse() : commands);
    assert.deepEqual(
      (await snap(c.address)).paid,
      reverse ? [0n, 0n] : [70000000n, 70000000n],
    );
  }
  for (const reverse of [false, true]) {
    const c = await voting();
    await send(c.address, A, "vote", [1n, true], accounts[2]);
    await send(c.address, A, "proposeResolution", [1n, 1]);
    const commands = [
      { who: accounts[1], name: "confirmResolution", args: [1n, 1n] },
      { who: accounts[3], name: "vote", args: [1n, true] },
    ];
    await race(c.address, reverse ? commands.reverse() : commands);
    assert.deepEqual(
      (await snap(c.address)).paid,
      reverse ? [50000000n, 90000000n] : [70000000n, 70000000n],
    );
  }
});

test("AC-03/25/26/27/28/29/30: cross-month records, auth forgery, image consent/integrity and restart cleanup", async () => {
  const dir = await mkdtemp(join(tmpdir(), "situation-private-"));
  const c = await create();
  let clock = Number((await client.getBlock()).timestamp) * 1000;
  const options = {
    origin: "http://localhost:5173",
    rpc,
    chainId: 31337,
    factory,
    token,
    database: join(dir, "api.sqlite"),
    encryptionKey: randomBytes(32).toString("hex"),
    clock: () => clock,
  };
  let { app, store } = createApp(options);
  const cookies = new Map<Address, string>();
  const request = (
    who: Address,
    method: "GET" | "POST",
    path: string,
    payload?: any,
    headers: Record<string, string> = {},
  ) =>
    app.inject({
      method,
      url: "/api/v1" + path,
      remoteAddress: `127.0.0.${accounts.indexOf(who) + 1}`,
      headers: {
        origin: options.origin,
        cookie: cookies.get(who) ?? "",
        "idempotency-key": randomUUID(),
        ...headers,
      },
      ...(payload === undefined ? {} : { payload }),
    });
  async function challenge(who: Address) {
    const r = await request(who, "POST", "/auth/challenge", { address: who });
    assert.equal(r.statusCode, 200, r.body);
    return {
      message: r.json().data.message as string,
      cookie: r.cookies[0].name + "=" + r.cookies[0].value,
    };
  }
  async function login(who: Address) {
    const { message, cookie } = await challenge(who);
    const r = await request(
      who,
      "POST",
      "/auth/verify",
      { message, signature: await wallet(who).signMessage({ message }) },
      { cookie },
    );
    assert.equal(r.statusCode, 200, r.body);
    cookies.set(
      who,
      "session=" + r.cookies.find((c) => c.name === "session")!.value,
    );
  }
  async function upload(form: FormData) {
    const r = new Request("http://localhost", { method: "POST", body: form });
    return request(
      accounts[0],
      "POST",
      `/situations/${c.address}/disputes/1/evidence`,
      Buffer.from(await r.arrayBuffer()),
      { "content-type": r.headers.get("content-type")! },
    );
  }
  function textForm(text = "本案说明", consent = true) {
    const f = new FormData();
    f.set("kind", "text");
    f.set("text", text);
    if (consent) {
      f.set("consentVersion", "1");
      f.set("shareWithCasePanel", "true");
    }
    return f;
  }
  try {
    await app.ready();
    for (const mutate of [
      (s: string) => s.replace("localhost:5173", "evil.example"),
      (s: string) => s.replace("Chain ID: 31337", "Chain ID: 43113"),
    ]) {
      const ch = await challenge(accounts[0]);
      const message = mutate(ch.message);
      assert.notEqual(message, ch.message);
      assert.equal(
        (
          await request(
            accounts[0],
            "POST",
            "/auth/verify",
            {
              message,
              signature: await wallet(accounts[0]).signMessage({ message }),
            },
            { cookie: ch.cookie },
          )
        ).statusCode,
        401,
      );
    }
    const expired = await challenge(accounts[0]);
    clock += 601000;
    assert.equal(
      (
        await request(
          accounts[0],
          "POST",
          "/auth/verify",
          {
            message: expired.message,
            signature: await wallet(accounts[0]).signMessage({
              message: expired.message,
            }),
          },
          { cookie: expired.cookie },
        )
      ).statusCode,
      401,
    );
    for (const who of accounts.slice(0, 6)) await login(who);
    const draft = await request(accounts[0], "POST", "/agreements", {
      document: c.d,
    });
    assert.equal(draft.statusCode, 201, draft.body);
    const id = draft.json().data.id;
    assert.equal(
      (
        await request(accounts[0], "POST", `/agreements/${id}/link`, {
          txHash: c.tx,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await request(accounts[5], "GET", `/agreements/${id}`, undefined, {
          "x-wallet-address": accounts[0],
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (await request(accounts[0], "GET", `/situations/${accounts[7]}`))
        .statusCode,
      404,
    );
    const original = store.db
      .prepare("SELECT body FROM agreements WHERE id=?")
      .get(id) as any;
    store.db
      .prepare("UPDATE agreements SET body=? WHERE id=?")
      .run(store.seal({ ...c.d, meetingTarget: 2 }), id);
    assert.equal(
      (await request(accounts[1], "GET", `/agreements/${id}`)).statusCode,
      409,
    );
    store.db
      .prepare("UPDATE agreements SET body=? WHERE id=?")
      .run(original.body, id);
    await ready(c.address, c.d);
    await fund(c.address, accounts[0]);
    await fund(c.address, accounts[1]);
    const date = new Date(clock);
    const monthEnd =
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) - 60000;
    await mineAt(BigInt(Math.ceil(monthEnd / 1000)));
    clock = monthEnd;
    for (const who of accounts.slice(0, 2)) await login(who);
    const meetingDate = new Date(clock).toISOString().slice(0, 10);
    const meeting = await request(
      accounts[0],
      "POST",
      `/situations/${c.address}/meetings`,
      { date: meetingDate },
    );
    assert.equal(meeting.statusCode, 201, meeting.body);
    assert.equal(
      (await request(accounts[0], "GET", `/situations/${c.address}`)).json()
        .data.meetingCount,
      0,
    );
    clock += 120000;
    await mineAt(BigInt(clock / 1000));
    const path = `/situations/${c.address}/meetings/${meeting.json().data.id}/confirm`;
    const key = randomUUID();
    assert.equal(
      (await request(accounts[1], "POST", path, {}, { "idempotency-key": key }))
        .statusCode,
      200,
    );
    assert.equal(
      (await request(accounts[1], "POST", path, {}, { "idempotency-key": key }))
        .statusCode,
      200,
    );
    assert.equal(
      (await request(accounts[1], "POST", path, {})).statusCode,
      409,
    );
    assert.equal(
      (await request(accounts[0], "GET", `/situations/${c.address}`)).json()
        .data.meetingCount,
      0,
    );
    const records = (
      await request(
        accounts[0],
        "GET",
        `/situations/${c.address}/records?month=${meetingDate.slice(0, 7)}`,
      )
    ).json().data.meetings;
    assert.equal(records.length, 1);
    assert.ok(records[0].confirmedAt);
    const relationship = await request(
      accounts[0],
      "POST",
      `/situations/${c.address}/relationship-checks`,
      {},
    );
    const confirmed = await request(
      accounts[1],
      "POST",
      `/situations/${c.address}/relationship-checks/${relationship.json().data.id}/confirm`,
      {},
    );
    assert.equal(
      (await request(accounts[0], "GET", `/situations/${c.address}`)).json()
        .data.nextConfirmationAt,
      confirmed.json().data.confirmedAt + 7 * 86400,
    );
    await send(c.address, A, "sendCheck");
    await at((await call(c.address, "getCheck", [1n])).deadline + 1n);
    await send(c.address, A, "openDispute", [1n]);
    clock = Number((await client.getBlock()).timestamp) * 1000;
    for (const who of accounts.slice(0, 5)) await login(who);
    assert.equal((await upload(textForm("未授权", false))).statusCode, 422);
    assert.equal((await upload(textForm("字".repeat(4001)))).statusCode, 422);
    const sharp = (await import("sharp")).default;
    const jpeg = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#eeeeee" },
    })
      .withExif({ IFD0: { Copyright: "private metadata" } })
      .jpeg()
      .toBuffer();
    assert.ok((await sharp(jpeg).metadata()).exif);
    const form = new FormData();
    form.set("kind", "image");
    form.set("consentVersion", "1");
    form.set("shareWithCasePanel", "true");
    form.set(
      "file",
      new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }),
      "private.jpg",
    );
    const image = await upload(form);
    assert.equal(image.statusCode, 201, image.body);
    const ev = image.json().data;
    await send(c.address, A, "registerEvidence", [1n, ev.commitment]);
    const contentPath = `/situations/${c.address}/disputes/1/evidence/${ev.id}`;
    const content = await request(accounts[1], "GET", contentPath + "/content");
    assert.equal(content.statusCode, 200, content.body);
    const meta = await sharp(content.rawPayload).metadata();
    assert.equal(meta.format, "png");
    assert.equal(meta.exif, undefined);
    const raw = store.db
      .prepare("SELECT body FROM evidence WHERE id=?")
      .get(ev.id) as any;
    const material = store.open(raw.body);
    for (const changed of [
      { ...material, content: Buffer.from("tamper").toString("base64") },
      { ...material, salt: hash() },
    ]) {
      store.db
        .prepare("UPDATE evidence SET body=? WHERE id=?")
        .run(store.seal(changed), ev.id);
      assert.equal(
        (await request(accounts[1], "GET", contentPath)).statusCode,
        409,
      );
    }
    store.db
      .prepare("UPDATE evidence SET body=? WHERE id=?")
      .run(raw.body, ev.id);
    assert.equal(
      (
        await request(
          accounts[1],
          "GET",
          `/situations/${c.address}/disputes/2/evidence/${ev.id}`,
        )
      ).statusCode,
      404,
    );
    const oversized = new FormData();
    oversized.set("kind", "image");
    oversized.set("consentVersion", "1");
    oversized.set("shareWithCasePanel", "true");
    oversized.set(
      "file",
      new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/png" }),
      "large.png",
    );
    assert.equal((await upload(oversized)).statusCode, 413);
    // One image and nine text drafts fill the frozen ten-item limit.
    for (let i = 0; i < 9; i++)
      assert.equal((await upload(textForm(String(i)))).statusCode, 201);
    assert.equal((await upload(textForm("第十一项"))).statusCode, 409);
    const dispute = await call(c.address, "getDispute", [1n]);
    await at(dispute.appealDeadline + 1n);
    await send(c.address, A, "startVoting", [1n]);
    clock = Number((await client.getBlock()).timestamp) * 1000;
    await login(accounts[0]);
    assert.equal((await upload(textForm())).statusCode, 409);
    await send(c.address, A, "vote", [1n, false], accounts[2]);
    await send(c.address, A, "vote", [1n, false], accounts[3]);
    clock =
      (Number((await snap(c.address)).terminatedAt) + 30 * 86400 - 1) * 1000;
    await login(accounts[0]);
    assert.equal(
      (await request(accounts[0], "GET", contentPath)).statusCode,
      200,
    );
    await app.close();
    clock += 1000;
    ({ app, store } = createApp(options));
    await app.ready();
    await login(accounts[0]);
    assert.equal(
      (await request(accounts[0], "GET", contentPath)).statusCode,
      410,
    );
    assert.equal(
      (store.db.prepare("SELECT count(*) AS n FROM evidence").get() as any).n,
      0,
    );
    assert.equal(
      (
        store.db
          .prepare("SELECT body FROM agreements WHERE id=?")
          .get(id) as any
      ).body,
      "",
    );
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("AC-30/32: deployment mismatches and unavailable RPC fail closed", async () => {
  for (const patch of [
    { chainId: 43113 },
    { factory: accounts[8] },
    { token: accounts[8] },
    { rpc: "http://127.0.0.1:1" },
  ]) {
    const { app } = createApp({
      origin: "http://localhost:5173",
      rpc,
      chainId: 31337,
      factory,
      token,
      database: ":memory:",
      encryptionKey: randomBytes(32).toString("hex"),
      ...patch,
    });
    try {
      const r = await app.inject({ method: "GET", url: "/api/v1/config" });
      assert.equal(r.statusCode, 503);
      assert.equal(r.json().data, undefined);
    } finally {
      await app.close();
    }
  }
});
