import type { LiveController } from "./useLiveController";
import { Wallet } from "@phosphor-icons/react";
import { api } from "./api";
import { Button } from "../ui/primitives";
import { short } from "./format";
import { Card } from "@radix-ui/themes";

export function WalletPanel({ c }: { c: LiveController }) {
  const {
    signedIn,
    isConnected,
    address,
    busy,
    connectors,
    settings,
    run,
    connectAsync,
    chainId,
    switchChainAsync,
    wallet,
    login,
    disconnect,
    setSignedIn,
  } = c;
  return (
    <Card asChild>
      <section className="content-section wallet-bar" id="wallet-login">
        <Wallet size={24} />
        <div>
          <strong>{isConnected ? short(address) : "连接你的钱包"}</strong>
          <p>{signedIn ? "已通过签名登录" : "登录签名不会授权转账"}</p>
        </div>
        <div className="button-row">
          {!isConnected ? (
            connectors
              .filter(
                (c) =>
                  !c.id.startsWith("local-dev-") || settings?.chainId === 31337,
              )
              .map((c) => (
                <Button
                  key={c.uid}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await connectAsync({ connector: c });
                    })
                  }
                >
                  {c.name}
                </Button>
              ))
          ) : (
            <>
              {settings && chainId !== settings.chainId ? (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await switchChainAsync({
                        chainId: settings.chainId as 31337 | 43113,
                      });
                    })
                  }
                >
                  切换项目网络
                </Button>
              ) : (
                !signedIn && (
                  <Button
                    disabled={busy || !wallet || !settings}
                    onClick={() => void run(login)}
                  >
                    签名登录
                  </Button>
                )
              )}
              <Button
                secondary
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api("/auth/session", undefined, "DELETE");
                    disconnect();
                    setSignedIn(false);
                  })
                }
              >
                断开连接
              </Button>
            </>
          )}
        </div>
      </section>
    </Card>
  );
}
