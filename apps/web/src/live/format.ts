import { formatUnits } from "viem";
export const short = (address?: string) =>
  address ? address.slice(0, 6) + "…" + address.slice(-4) : "未连接";
export const date = (t: bigint | string | number) =>
  Number(t)
    ? new Date(Number(t) * 1000).toLocaleString("zh-CN", {
        timeZoneName: "short",
      })
    : "—";
export const cash = (value: bigint | string) => formatUnits(BigInt(value), 6);
