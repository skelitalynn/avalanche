import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  http,
  parseEventLogs,
  erc20Abi,
  type Address,
  type Hex,
} from "viem";
import {
  SituationFactoryAbi,
  SituationAgreementAbi,
  assertPublicAgreement,
  hashDocument,
  FUJI,
  type AgreementDocument,
} from "../../../packages/shared/src/index.js";
export interface ChainConfig {
  rpc: string;
  chainId: number;
  factory: Address;
  token: Address;
}
export function createChain(config: ChainConfig) {
  const client = createPublicClient({
    transport: http(config.rpc, { timeout: 8000, retryCount: 0 }),
  });
  async function validateDeployment() {
    if (
      ![31337, 43113].includes(config.chainId) ||
      (await client.getChainId()) !== config.chainId
    )
      throw Error("Wrong deployment chain");
    if (
      config.chainId === 43113 &&
      config.token.toLowerCase() !== FUJI.token.toLowerCase()
    )
      throw Error("Fuji token is not official test USDC");
    const [factoryToken, decimals] = await Promise.all([
      client.readContract({
        address: config.factory,
        abi: SituationFactoryAbi,
        functionName: "token",
      }),
      client.readContract({
        address: config.token,
        abi: erc20Abi,
        functionName: "decimals",
      }),
    ]);
    if (
      factoryToken.toLowerCase() !== config.token.toLowerCase() ||
      decimals !== 6
    )
      throw Error("Deployment asset mismatch");
  }
  async function read(address: Address) {
    const block = await client.getBlock();
    const blockNumber = block.number;
    if ((await client.getChainId()) !== config.chainId)
      throw Error("Wrong chain");
    if (
      !(await client.readContract({
        address: config.factory,
        abi: SituationFactoryAbi,
        functionName: "isSituation",
        args: [address],
        blockNumber,
      }))
    )
      throw Object.assign(Error("Unknown situation"), {
        statusCode: 404,
        code: "NOT_FOUND",
      });
    const get = <
      N extends
        | "participantA"
        | "participantB"
        | "factory"
        | "agreementHash"
        | "recoveryAmount"
        | "bondAmount"
        | "ghostWindow"
        | "token",
    >(
      functionName: N,
    ) =>
      client.readContract({
        address,
        abi: SituationAgreementAbi,
        functionName,
        blockNumber,
      });
    const [
      participantA,
      participantB,
      factory,
      agreementHash,
      recoveryAmount,
      bondAmount,
      ghostWindow,
      token,
      snapshot,
      supervisors,
    ] = await Promise.all([
      get("participantA"),
      get("participantB"),
      get("factory"),
      get("agreementHash"),
      get("recoveryAmount"),
      get("bondAmount"),
      get("ghostWindow"),
      get("token"),
      client.readContract({
        address,
        abi: SituationAgreementAbi,
        functionName: "snapshot",
        blockNumber,
      }),
      Promise.all(
        [0n, 1n, 2n].map((i) =>
          client.readContract({
            address,
            abi: SituationAgreementAbi,
            functionName: "supervisors",
            args: [i],
            blockNumber,
          }),
        ),
      ),
    ]);
    if (
      token.toLowerCase() !== config.token.toLowerCase() ||
      factory.toLowerCase() !== config.factory.toLowerCase()
    )
      throw Error("Invalid registered asset/factory");
    return {
      address,
      participantA,
      participantB,
      factory,
      agreementHash,
      recoveryAmount,
      bondAmount,
      ghostWindow,
      token,
      snapshot,
      supervisors,
      observedBlock: blockNumber,
      chainTime: block.timestamp,
    };
  }
  async function caseData(address: Address, id: bigint, blockNumber: bigint) {
    const dispute = await client
      .readContract({
        address,
        abi: SituationAgreementAbi,
        functionName: "getDispute",
        args: [id],
        blockNumber,
      })
      .catch((error: unknown) => {
        const revert =
          error instanceof BaseError
            ? error.walk(
                (cause) => cause instanceof ContractFunctionRevertedError,
              )
            : undefined;
        if (
          revert instanceof ContractFunctionRevertedError &&
          revert.data?.errorName === "NotFound"
        )
          throw Object.assign(Error("Unknown dispute"), {
            statusCode: 404,
            code: "NOT_FOUND",
          });
        throw error;
      });
    const check = await client.readContract({
      address,
      abi: SituationAgreementAbi,
      functionName: "getCheck",
      args: [dispute.checkId],
      blockNumber,
    });
    return { dispute, check };
  }
  async function linked(d: AgreementDocument, txHash: Hex) {
    const receipt = await client.getTransactionReceipt({ hash: txHash });
    if (
      receipt.status !== "success" ||
      receipt.to?.toLowerCase() !== config.factory.toLowerCase() ||
      receipt.from.toLowerCase() !== d.participantA
    )
      throw Object.assign(Error("Invalid creation receipt"), {
        statusCode: 409,
        code: "RECEIPT_MISMATCH",
      });
    const events = parseEventLogs({
      abi: SituationFactoryAbi,
      logs: receipt.logs.filter(
        (log) => log.address.toLowerCase() === config.factory.toLowerCase(),
      ),
      eventName: "SituationCreated",
    });
    const creation = events.find(
      (event) =>
        event.args.participantA.toLowerCase() === d.participantA &&
        event.args.participantB.toLowerCase() === d.participantB &&
        event.args.agreementHash === hashDocument(d),
    );
    if (!creation)
      throw Object.assign(Error("Creation event missing"), {
        statusCode: 409,
        code: "RECEIPT_MISMATCH",
      });
    const address = await client.readContract({
      address: config.factory,
      abi: SituationFactoryAbi,
      functionName: "situationOf",
      args: [d.participantA, hashDocument(d)],
    });
    if (address.toLowerCase() !== creation.args.situation.toLowerCase())
      throw Error("Creation address mismatch");
    const data = await read(address);
    assertPublicAgreement(d, data);
    return address.toLowerCase() as Address;
  }
  return { client, read, caseData, linked, validateDeployment };
}
export type Chain = ReturnType<typeof createChain>;
export type ChainSituation = Awaited<ReturnType<Chain["read"]>>;
