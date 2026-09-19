import {
  evidenceCommitment,
  same,
} from "../../../../packages/shared/src/index";
import type { Address, Hex } from "viem";
interface Evidence {
  kind: "text" | "image";
  text?: string;
  contentPath?: string;
  contentSha256: Hex;
  salt: Hex;
  commitment: Hex;
}
export async function verifyEvidence(
  body: Evidence,
  context: {
    chainId: number;
    situation: Address;
    disputeId: bigint;
    owner: Address;
    commitment: Hex;
  },
) {
  let bytes: Uint8Array<ArrayBuffer>;
  if (body.kind === "text" && typeof body.text === "string")
    bytes = new TextEncoder().encode(body.text);
  else if (body.kind === "image" && body.contentPath) {
    const url = new URL(body.contentPath, location.origin);
    if (
      url.origin !== location.origin ||
      !url.pathname.startsWith("/api/v1/situations/")
    )
      throw Error("证据地址无效");
    const response = await fetch(url, { credentials: "same-origin" });
    if (
      !response.ok ||
      !response.headers.get("content-type")?.startsWith("image/png")
    )
      throw Error("授权图片读取失败");
    bytes = new Uint8Array(await response.arrayBuffer());
  } else throw Error("证据格式无效");
  const sha = ("0x" +
    Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("")) as Hex;
  const commitment = evidenceCommitment(
    context.chainId,
    context.situation,
    context.disputeId,
    context.owner,
    sha,
    body.salt,
  );
  if (
    !same(sha, body.contentSha256) ||
    !same(commitment, body.commitment) ||
    !same(commitment, context.commitment)
  )
    throw Error("证据内容或案件摘要不一致，已停止展示");
  // Render the verified bytes, never a second unverified download.
  return {
    ...body,
    contentPath: undefined,
    text:
      body.kind === "text"
        ? body.text
        : "data:image/png;base64," +
          btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join("")),
  };
}
