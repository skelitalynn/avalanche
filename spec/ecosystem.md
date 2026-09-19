# Avalanche 开发参考

资料核对日期：2026-09-19。T002 已完成下述 Fuji 网络与 USDC 元数据的只读 RPC 核对；尚未领币、部署或执行链上写入，不代表钱包或产品流程验收通过。

## 开发起点

[Avalanche Builder Hub](https://build.avax.network/) 提供开发文档与开发者工具；平台区分在 C-Chain 构建应用和创建自己的 L1 两条路线。本项目已确认采用 Fuji C-Chain，使用 Core Wallet 与 wagmi + viem，并需要自定义 Solidity 合约；自建 L1 不在当前范围内。项目负责人已确认黑客松手册为开发参考，没有必须使用全部工具的要求。完整选型见 [技术架构](architecture.md)。

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

## SituationSHIT 测试资产与钱包连接

### Fuji USDC

- 资产：Circle 官方 Fuji 测试 USDC，合约 `0x5425890298aed601595a70AB815c96711a31Bc65`；来源为 [Circle USDC 地址表](https://developers.circle.com/stablecoins/usdc-contract-addresses) 的 Avalanche Fuji 项，不采用主网地址或 USDC.e。
- 精度：6，内部金额使用最小单位整数，1 USDC = 1,000,000 单位；JSON 金额传十进制字符串。
- 来源：[Circle Faucet](https://faucet.circle.com/)，选择 USDC + Avalanche Fuji。页面当前说明每个地址/网络每 2 小时可申请 20 USDC，实际限额和人工验证以页面为准。它与用于 Gas 的测试 AVAX 是两种资产。
- 本地合约测试可使用 6 位精度的 ERC-20 测试替身；真实 Fuji 验收必须使用上述官方测试资产，不以自部署 MockUSDC 替代。
- 启动与部署前复核 Chain ID、代币地址、代码非空及 `decimals()`；不匹配则阻止相应链写入。合约地址集中由本节定义，其他 Spec 引用本节。

2026-09-19 只读核对：向本节 Fuji RPC 调用 `eth_chainId` 得 `0xa869`；对上述 USDC 调用 `eth_getCode` 得非空代码（1852 bytes）；`eth_call` 调用 `decimals()`（data 为 `0x313ce567`）得 6。三项请求均成功；没有提交交易、申请测试币或读取用户私钥。

### Core 桌面与手机连接

- 桌面：Core Extension，通过 EIP-6963 发现的 EIP-1193 provider 接入 wagmi。
- 手机：Core Mobile 使用 WalletConnect；不假设手机存在扩展注入的 `window.avalanche`。依据 [Core 官方说明](https://docs.core.app/docs/intro/)。
- wagmi 使用 `walletConnect` connector，配置项目自己的 `projectId` 和站点 metadata，参考 [wagmi 官方接口](https://wagmi.sh/react/api/connectors/walletConnect)。不得复制文档里的示例 projectId 作为项目配置。
- T003 提供 `VITE_WALLETCONNECT_PROJECT_ID` 示例字段；实际 ID 和允许来源由项目环境提供。缺失时显示“手机钱包连接尚未配置”，不能伪装成已连接；不影响无需钱包的页面及本地模拟测试。
- T004 验证桌面 Core 扩展、手机浏览器与 Core App 的连接/返回、切网、账号变更和拒签；模拟通过不代表真机通过。此项只冻结接入方案，尚未执行真机测试。

## 工具选择

以下保留手册中的生态工具及补充 SDK 入口；本项目基础链交互已选定 wagmi + viem，表内工具目前均不列为必装依赖。

| 工具 | 用途与当前状态 |
| --- | --- |
| [AvalancheJS](https://github.com/ava-labs/avalanchejs) | Avalanche 节点 API 的 JavaScript/TypeScript 库，包名 `@avalabs/avalanchejs`；按所需 API 选用 |
| [Avalanche Client SDK](https://build.avax.network/docs/tooling/avalanche-sdk/client/getting-started) | 基于 viem 的 TypeScript 客户端，包名 `@avalanche-sdk/client`，支持 C/P/X-Chain；不要与 AvalancheJS 混为同一个包 |
| [Avalanche CLI](https://github.com/ava-labs/avalanche-cli) | 用于开发、测试和部署 L1；官方声明自 2025-12 起进入维护模式，不再开发新功能，保留安全与关键问题修复 |
| [HyperSDK](https://github.com/ava-labs/hypersdk) | Go 自定义区块链框架；仓库显示于 2026-08-21 归档，只读，选型时需考虑该状态 |

CLI 和 HyperSDK 不列为本 Demo 的默认前置依赖。具体依赖和版本在 [技术架构](architecture.md) 中确定。
