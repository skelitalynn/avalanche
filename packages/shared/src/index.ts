import canonicalize from "canonicalize";
import { z } from "zod";
import {
  encodeAbiParameters,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
export * from "./abi.js";
export const FUJI = {
  chainId: 43113,
  rpc: "https://api.avax-test.network/ext/bc/C/rpc",
  token: "0x5425890298aed601595a70AB815c96711a31Bc65" as Address,
  decimals: 6,
} as const;
export const lifecycles = [
  "INVITED",
  "FUNDING",
  "ACTIVE",
  "ENDING",
  "DISPUTED",
  "SETTLING",
  "ENDED",
  "CANCELLED",
] as const;
export const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((s) => s.toLowerCase() as Address)
  .refine((s) => !/^0x0{40}$/.test(s));
export const hashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((s) => s.toLowerCase() as Hex)
  .refine((s) => !/^0x0{64}$/.test(s));
export const amountSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/)
  .refine((s) => BigInt(s) >= 10000n && BigInt(s) <= 1000000000n);
export const documentSchema = z
  .object({
    version: z.literal(1),
    chainId: z.number().int().positive(),
    factory: addressSchema,
    nonce: hashSchema,
    participantA: addressSchema,
    participantB: addressSchema,
    supervisors: z.tuple([addressSchema, addressSchema, addressSchema]),
    recoveryAmount: amountSchema,
    bondAmount: amountSchema,
    ghostWindowSeconds: z
      .number()
      .int()
      .min(86400)
      .max(2592000)
      .multipleOf(86400),
    meetingTarget: z.number().int().min(0).max(31),
    confirmationEveryDays: z.number().int().min(1).max(90),
    policyVersion: z.literal("1"),
    salt: hashSchema,
  })
  .strict()
  .refine(
    (d) =>
      new Set([d.participantA, d.participantB, ...d.supervisors]).size === 5,
    "Five distinct wallets required",
  );
export type AgreementDocument = z.infer<typeof documentSchema>;
export function hashDocument(document: AgreementDocument): Hex {
  return keccak256(stringToHex(canonicalize(documentSchema.parse(document))!));
}
export function evidenceCommitment(
  chainId: number,
  situation: Address,
  disputeId: bigint,
  owner: Address,
  sha: Hex,
  salt: Hex,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "address" },
        { type: "uint64" },
        { type: "address" },
        { type: "bytes32" },
        { type: "bytes32" },
      ],
      [BigInt(chainId), situation, disputeId, owner, sha, salt],
    ),
  );
}
export const jsonSafe = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
export const same = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase();
export function assertPublicAgreement(
  d: AgreementDocument,
  publicValues: {
    participantA: string;
    participantB: string;
    supervisors: readonly string[];
    recoveryAmount: bigint;
    bondAmount: bigint;
    ghostWindow: number;
    agreementHash: string;
    factory: string;
  },
) {
  const p = publicValues;
  if (
    !same(d.factory, p.factory) ||
    !same(d.participantA, p.participantA) ||
    !same(d.participantB, p.participantB) ||
    d.supervisors.some((a, i) => !same(a, p.supervisors[i])) ||
    BigInt(d.recoveryAmount) !== p.recoveryAmount ||
    BigInt(d.bondAmount) !== p.bondAmount ||
    d.ghostWindowSeconds !== p.ghostWindow ||
    !same(hashDocument(d), p.agreementHash)
  )
    throw Error("AGREEMENT_MISMATCH");
}
