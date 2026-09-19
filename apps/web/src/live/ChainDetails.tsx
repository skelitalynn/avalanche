import type { LiveController } from "./useLiveController";

export function ChainDetails({ c }: { c: LiveController }) {
  const { address, settings, selected } = c;
  return (
    <details className="chain-details">
      <summary>钱包与链上详情</summary>
      <p className="mono">
        当前钱包：{address}
        <br />
        关系合约：{selected}
        <br />
        Factory：{settings?.factoryAddress}
        <br />
        USDC：{settings?.tokenAddress}
        <br />
        Chain ID：{settings?.chainId}
      </p>
    </details>
  );
}
