import type { ReactNode } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { hardhat, avalancheFuji } from "viem/chains";
import { FUJI } from "../../../../packages/shared/src/index";
import { localConnectors } from "./localWallet";
export const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as
  string | undefined;
export const localRpc =
  import.meta.env.VITE_LOCAL_RPC_URL || "http://127.0.0.1:8545";
const config = createConfig({
  chains: [avalancheFuji, hardhat],
  connectors: [
    injected(),
    ...localConnectors,
    ...(projectId
      ? [
          walletConnect({
            projectId,
            showQrModal: true,
            metadata: {
              name: "SituationSHIT",
              description: "两个人共同确认的关系约定",
              url: location.origin,
              icons: [location.origin + "/assets/together.jpg"],
            },
          }),
        ]
      : []),
  ],
  transports: {
    [avalancheFuji.id]: http(FUJI.rpc),
    [hardhat.id]: http(localRpc),
  },
  multiInjectedProviderDiscovery: true,
});
const queryClient = new QueryClient();

export function WalletProviders({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
