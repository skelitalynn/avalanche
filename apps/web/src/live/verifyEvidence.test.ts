import { describe, it, expect } from "vitest";
import { evidenceCommitment } from "../../../../packages/shared/src/index";
import { verifyEvidence } from "./verifyEvidence";
import type { Hex, Address } from "viem";
const context = {
  chainId: 31337,
  situation: `0x${"12".repeat(20)}` as Address,
  disputeId: 1n,
  owner: `0x${"34".repeat(20)}` as Address,
};
const salt = `0x${"56".repeat(32)}` as Hex;
describe("AC-001-29 verified evidence", () => {
  it("shows authenticated bytes and rejects modified text, salt and cross-case material", async () => {
    const text = "仅向本案授权\n原始说明";
    const sha = ("0x" +
      Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("")) as Hex;
    const commitment = evidenceCommitment(
      context.chainId,
      context.situation,
      context.disputeId,
      context.owner,
      sha,
      salt,
    );
    const body = {
      kind: "text" as const,
      text,
      salt,
      contentSha256: sha,
      commitment,
    };
    const bound = { ...context, commitment };
    expect((await verifyEvidence(body, bound)).text).toBe(text);
    await expect(
      verifyEvidence({ ...body, text: "已篡改" }, bound),
    ).rejects.toThrow("不一致");
    await expect(
      verifyEvidence({ ...body, salt: `0x${"99".repeat(32)}` }, bound),
    ).rejects.toThrow("不一致");
    await expect(
      verifyEvidence(body, { ...bound, disputeId: 2n }),
    ).rejects.toThrow("不一致");
  });
});
