# Avalanche 开发参考

资料核对日期：2026-09-19。以下为文档与工具入口核对，不代表本项目已完成 RPC 实测、领币或链上部署。

## 开发起点

[Avalanche Builder Hub](https://build.avax.network/) 提供开发文档与开发者工具；平台区分在 C-Chain 构建应用和创建自己的 L1 两条路线。本项目已确认采用 Fuji C-Chain，使用 Core Wallet 与 wagmi + viem；业务确定后再决定是否需要自定义合约，自建 L1 不在当前范围内。完整选型见 [技术架构](architecture.md)。

## Fuji C-Chain

| 配置项 | 值 |
| --- | --- |
| 网络 | Avalanche Fuji C-Chain |
| Chain ID | `43113`（`0xa869`） |
| 原生币符号 | `AVAX`（此网络使用测试币） |
| HTTP RPC | `https://api.avax-test.network/ext/bc/C/rpc` |
| 测试网浏览器 | [Fuji Snowtrace](https://testnet.snowtrace.io/) |

依据：[官方 Fuji 网络配置](https://build.avax.network/academy/blockchain/x402-payment-infrastructure/04-x402-on-avalanche/02-network-setup)、[C-Chain API](https://docs.avax.network/docs/rpcs/c-chain/api)。此处 Chain ID 是 EVM Chain ID，网络检查应调用 `eth_chainId`。

无需钱包的只读连通性检查（需要 curl）：

```bash
curl --fail-with-body --silent --show-error --max-time 20 \
  'https://api.avax-test.network/ext/bc/C/rpc' \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
```

验收预期：响应没有 JSON-RPC `error`，`result` 为 `0xa869`。HTTP 成功本身不能证明网络配置正确；此检查也不代表钱包或业务流程已通过验收。

## 钱包与测试币

1. 从 [Core 官网](https://core.app) 获取钱包，按 [官方说明](https://support.avax.network/en/articles/6224787-how-to-connect-to-the-fuji-testnet) 开启测试网模式。
2. 使用 [Core Testnet Faucet](https://core.app/tools/testnet-faucet) 或 [Builder Hub Faucet](https://build.avax.network/console/primary-network/faucet) 申请测试 AVAX，具体条件以页面为准。
3. 在钱包或测试网浏览器确认目标地址的到账结果，再执行需要 Gas 的测试。

## 工具选择

以下保留手册中的生态工具及补充 SDK 入口；本项目基础链交互已选定 wagmi + viem，表内工具目前均不列为必装依赖。

| 工具 | 用途与当前状态 |
| --- | --- |
| [AvalancheJS](https://github.com/ava-labs/avalanchejs) | Avalanche 节点 API 的 JavaScript/TypeScript 库，包名 `@avalabs/avalanchejs`；按所需 API 选用 |
| [Avalanche Client SDK](https://build.avax.network/docs/tooling/avalanche-sdk/client/getting-started) | 基于 viem 的 TypeScript 客户端，包名 `@avalanche-sdk/client`，支持 C/P/X-Chain；不要与 AvalancheJS 混为同一个包 |
| [Avalanche CLI](https://github.com/ava-labs/avalanche-cli) | 用于开发、测试和部署 L1；官方声明自 2025-12 起进入维护模式，不再开发新功能，保留安全与关键问题修复 |
| [HyperSDK](https://github.com/ava-labs/hypersdk) | Go 自定义区块链框架；仓库显示于 2026-08-21 归档，只读，选型时需考虑该状态 |

CLI 和 HyperSDK 不列为本 Demo 的默认前置依赖。具体依赖和版本在 [技术架构](architecture.md) 中确定。
