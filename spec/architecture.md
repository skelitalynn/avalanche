# 技术架构

状态：基础技术选型已确认（2026-09-19）。SituationSHIT 产品范围已整理，业务实现边界、依赖具体版本与应用实现尚未完成。

确认来源：项目负责人在本次需求沟通中认可 TypeScript、React + Vite、Core Wallet、Fuji C-Chain、wagmi + viem、Vitest + Playwright，以及按需使用 Solidity + Hardhat 的方案。

## 技术选择

| 部分 | 已确认选择 / 实施边界 |
| --- | --- |
| 链与网络 | Avalanche C-Chain、USDC；开发验收使用 Fuji，网络参数见 [生态文档](ecosystem.md)，USDC 测试资产已核对，见同一文档 |
| 应用形式 | 中文、移动端优先 Web 单页 Demo，采用单应用结构；七类页面见 [001 Spec](features/001-situationship.md) |
| 主要语言 | TypeScript，用于前端、应用逻辑、脚本与测试 |
| 前端 | React + Vite |
| 钱包 | Core Wallet；桌面通过 Core Extension 的 EIP-6963 provider，手机通过 WalletConnect；配置与验证边界见 [生态文档](ecosystem.md) |
| 链交互 | wagmi + viem：wagmi 负责 React 中的钱包连接与链状态交互，viem 负责底层 RPC、合约调用和金额转换等 |
| 单元与集成测试 | Vitest，覆盖业务规则和可模拟的钱包/RPC 分支 |
| 页面流程测试 | Playwright，覆盖关键页面操作；真实 Core/Fuji 验收另外记录 |
| 自定义智能合约 | 需要，使用 Solidity + Hardhat 开发、测试和部署；负责协议、托管、投票和结算 |
| 后端、数据库、索引服务 | 是否需要及具体选型仍待业务确定，不作为基础工程的必需组件 |
| 开发运行时、包管理器与依赖版本 | T003 初始化时核对工具兼容要求，记录版本并提交锁文件 |

普通 C-Chain 交互统一使用 wagmi + viem；AvalancheJS 和 Avalanche Client SDK 暂不引入，需要其特有 API 时再更新本文件。Avalanche CLI、HyperSDK 和自建 L1 不在本次基础方案内。

官方入口：[Vite](https://vite.dev/guide/)、[wagmi](https://wagmi.sh/react/getting-started)、[viem](https://viem.sh/)、[Vitest](https://vitest.dev/guide/)、[Playwright](https://playwright.dev/docs/intro)、[Hardhat](https://hardhat.org/docs/getting-started)。

## 模块边界

SituationSHIT 按以下 Web + C-Chain 边界组织；基础技术已确认，链下服务与部署结构在 T002 明确。

```text
用户界面 → 业务逻辑 → 链访问模块 → Avalanche C-Chain RPC
                          ↕
                       用户钱包（签名）
```

- 用户界面：收集输入，展示状态、错误和结果。
- 业务逻辑：执行输入校验和功能规则，不散落在 UI 事件中。
- 链访问模块：集中维护网络配置、读取、交易提交及回执查询。
- 钱包连接与签名：通过 Core Wallet 完成；应用不接收用户私钥或助记词。
- 智能合约：负责协议签署校验、USDC 托管、关系和争议状态、好友投票和资金结算；接口记入 contracts.md。
- 链下数据与权限：负责邀请访问及必要的敏感证据存储、用户主动授权和争议范围内读取校验；是否采用独立后端、具体存储与认证方式待定。

## 建议合约职责

| 模块 | 边界 |
| --- | --- |
| SituationFactory | 创建 Situation |
| SituationAgreement | 参与者、共同签署的 commitment、时间规则、监督人和关系状态 |
| SituationVault | 两类 USDC 资金分别记账，存款、原持有人退款和违约保证金转移 |
| DisputeResolution | 正式确认与失联申诉的链上约束、三人投票、2 / 3 违约判定及最终结果 |

四模块是职责划分建议，尚不代表四个独立部署合约。争议裁决只授权符合协议的结算；Recovery Fund 始终返还本人。敏感证据不上链，链上哈希不能替代链下访问控制。完整状态机及合约之间的调用权限须先在 T002 对齐。

目录在 T003 初始化时确定，再记录真实路径；当前不预建空的应用模块。

## 关键交互约定

若涉及链上写入：校验输入和网络 → 请求钱包签名 → 提交交易 → 展示待确认状态 → 查询回执 → 校验业务结果。

获得交易哈希只表示已提交；成功状态需要回执成功，并满足功能 Spec 的业务断言。RPC 超时应保留已有哈希供查询，避免自动重复提交。钱包拒绝、错误网络、余额不足和合约执行失败应有可理解的反馈。

## 配置与运行

- 网络参数集中配置；使用测试网时，在签名前检查目标 Chain ID。
- 项目初始化时核对并锁定兼容的依赖组合，提供环境变量示例、锁文件和可复制的安装/启动/构建/类型检查/测试命令；相关配套依赖以实际所选版本要求为准。
- 钱包私钥与助记词不进入前端配置、仓库或验收记录。
- 如部署合约，在 contracts.md 记录网络、地址、ABI 位置及部署交易。

## 验证方式

业务规则使用 Vitest 验证，钱包和 RPC 异常分支可使用模拟测试；关键页面流程使用 Playwright。自定义合约使用 Hardhat 验证权限、状态变更和回滚条件。真实 Core/Fuji 验收记录网络、交易回执或实际读取结果，不能用模拟 Provider 的通过结果代替。具体测试场景写在功能 Spec，执行结果写在 Roadmap。

## 尚待业务明确

- 产品范围与验收基线见 [001 Spec](features/001-situationship.md)；申诉、入金、时间、身份等边界仍待明确。
- 自定义合约需求已明确；字段的链上/链下表示、完整状态机与部署结构待补齐。
- 是否需要后端、数据库或索引服务，以及相应接口与权限。

上述事项由 T002 处理。技术选型已确认不代表首个功能 Spec 已达到 READY，也不代表工程已经初始化。
