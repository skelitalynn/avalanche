# 技术架构

状态：基础技术选型已确认（2026-09-19）。SituationSHIT 业务规则和实现边界已由 T002 冻结；T010 已交付独立 Mock 前台并锁定其依赖，T013 整合真实本地 API、钱包与合约；完整AC和Fuji验收仍待完成。

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
| 后端与数据 | TypeScript + Fastify，同源 HTTP API；SQLite 存结构化数据与加密附件（本地Demo的有界图片存为加密数据字段）；不引入独立索引服务 |
| 开发运行时、包管理器与依赖版本 | 工程要求 Node 24.13+（Node 24），npm workspaces 与 package-lock；API/合约由 T013 集成并由 package-lock 锁定 |

普通 C-Chain 交互统一使用 wagmi + viem；AvalancheJS 和 Avalanche Client SDK 暂不引入，需要其特有 API 时再更新本文件。Avalanche CLI、HyperSDK 和自建 L1 不在本次基础方案内。

官方入口：[Vite](https://vite.dev/guide/)、[wagmi](https://wagmi.sh/react/getting-started)、[viem](https://viem.sh/)、[Vitest](https://vitest.dev/guide/)、[Playwright](https://playwright.dev/docs/intro)、[Hardhat](https://hardhat.org/docs/getting-started)。

## 模块边界

SituationSHIT 按以下 Web + C-Chain 边界组织；链上维护资金和权威状态，链下服务维护私有协议、双边日常记录和证据。

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
- 链下数据与权限：负责邀请访问及必要的敏感证据存储、用户主动授权和争议范围内读取校验；采用同源 Fastify 服务、SQLite 与私有附件目录，身份按 SIWE 登录；精确接口见 contracts.md。

## 合约职责与部署

| 模块 | 边界 |
| --- | --- |
| SituationFactory | 创建 Situation |
| SituationAgreement | 参与者、共同签署的 commitment、时间规则、监督人和关系状态 |
| SituationVault | 两类 USDC 资金分别记账，存款、原持有人退款和违约保证金转移 |
| DisputeResolution | 正式确认与失联申诉的链上约束、三人投票、2 / 3 违约判定及最终结果 |

部署一个 SituationFactory，每个关系部署一个不可升级 SituationAgreement；SituationVault 和 DisputeResolution 为 Agreement 内部 Solidity 模块，使用同一份状态与托管余额，不独立部署。Factory 不保管关系资金。只有本关系状态机能决定分配，没有管理员裁决、升级或提款后门。裁决先锁定权益，再隔离尝试向原持有人付款；失败保留待付项，允许任意地址重试，不能改变收款人。完整权限与事件见 contracts.md。

前台已位于 `apps/web`。`src/App.tsx` 负责服务订阅和动作编排，`src/pages` 为七页视图，`src/ui` 为外壳、Radix Themes 基础组件、展示组件及演示交互；`src/styles.css` 统一米白/墨绿/青柠视觉。Mock 与真实入口共用 Radix Theme 和品牌色，真实入口按视图拆分，交易编排集中于 `live/useLiveController.tsx`，`src/data/types.ts` 是视图契约，`src/data/service.ts` 是唯一服务适配入口，`mockService.ts` 负责状态转换和本机持久化。页面通过 `SituationService` 读取状态与异步发送动作，不直接读写 localStorage。真实流程由 main.tsx 独立选择 live/LiveApp.tsx，经 live/api.ts 与 wagmi/viem 接入，不将链上状态塞进 DemoState，详见 [前台演示指南](../docs/frontend-demo.md)。

T010 的 Mock 仅用于截图与可点击演示，不能代替 SIWE、服务端权限、链上托管或真实交易验收。路由为 `#/页面名`，无需服务端路由回退。服务返回的金额为整数微 USDC；显示才转换为小数。演示身份切换与时间推进只存在于 Mock 控制面板。

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

## 链下边界与安全

- 后端：Fastify处理HTTP，Zod校验请求字段，响应通过白名单组装，钱包登录采用 SIWE；不保管用户私钥，不代签链上交易。每次私有访问按已登记 Factory、角色和本案状态重新授权，RPC 失败关闭访问。
- 数据：SQLite 事务与唯一约束保证双边确认、幂等请求和计数一致；正文和附件使用 AES-256-GCM 加密，32 字节环境密钥、每次随机 12 字节 IV 和认证标签；密钥不进数据库或仓库。后端能够解密，不声称端到端加密。
- 文件：附件在本地版本使用 SQLite 加密字段存储，数据库位于公开静态目录以外，图片重编码去 EXIF；读取经鉴权 API。禁止任意远程 URL 抓取。没有敏感内容历史备份；到期 API 立即拒读，后台清理至多 24 小时完成，启动时补清理。
- 同步：每次业务读取核对链上状态与观测区块，不用本地记录决定资金分配。链下记录可能短暂落后链状态，终止后新产生的记录在同步时标无效；链上资金仍是权威。
- 信任边界：钱包负责签名，链/RPC 提供状态，服务端负责私有内容与访问控制，监督人负责判断事实。哈希只能校验内容一致，不能证明证据真实性或保证内容可用。

技术依据：[Fastify 校验与序列化](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)、[SIWE 标准](https://eips.ethereum.org/EIPS/eip-4361)、[Node.js SQLite](https://nodejs.org/api/sqlite.html)。具体依赖由package-lock锁定，SQLite使用Node24内置node:sqlite；本地实现与实际运行证据见T013，不能据此声明已通过完整生产验收。

## 工程落点与后续前置条件

T013已整合 `apps/web`（React/Vite）、`apps/api`（Fastify）、`packages/shared`（schema/类型/枚举）和 `contracts`（Hardhat）目录；合约由根Hardhat配置管理，其他三个目录为npm工作区。实际命令见根package.json和README；Mock与真实入口的边界分别见002 Spec及001第16节。

配置示例需要包括 API/站点 origin、Fuji RPC、Factory 地址（部署后提供）、WalletConnect projectId、数据库/私有附件路径和加密密钥字段。前端只读公开配置，服务密钥不能使用 VITE_ 前缀。

T004 可实施桌面 Core 与手机 WalletConnect；缺实际 projectId 只阻塞相应真实连接验收，不改变连接方案。T006 的部署、测试资金和真实链上交易需另行授权；前台和文档不得把本地/Mock 通过写成 Fuji 通过。


## T013 个人电脑启动

`npm run mvp:local` 编译/构建后由 `scripts/local.ts` 顺序启动回环 Hardhat、部署、Fastify、Vite preview。运行时路径由当前检出目录解析，默认5174/3001/8545；没有服务器IP、SSH或Nginx依赖。Node子进程使用 `process.execPath`，不依赖bash的环境变量赋值或系统包管理器。

`build:local` 显式启用真实默认入口和本地开发钱包；普通build默认Mock。前端没有后台密钥；本地账户由Hardhat持有。API通过SIWE验证真实签名，前台从本机RPC查询回执。启动器独占端口和数据目录，默认恢复当前会话，`mvp:new` 显式新建会话；Ctrl+C或父进程中断时通过IPC清理子进程。数据库/密钥/部署清单与链操作日志位于忽略的 `.local/runs/`。具体步骤见 [本地指南](../docs/local-mvp.md)。

有界证据图片的存储从原计划的私有文件目录调整为SQLite加密字段，保持鉴权内容路由不变，减少本机安装依赖；不把数据库暴露为静态文件。T013是本地集成，原32项AC和真实Fuji的验证边界见 [验证记录](verification/t013-local-integration.md)。

## T015–T018 本地完整实现

- `live/LiveApp.tsx` 仅组织视图；真实视图使用 Radix 控件与共用主题，业务 Hook、SIWE、API 和 Mock 保持分离。换钱包后旧异步结果不得回填私有界面；证据在浏览器核对 SHA-256、案件 commitment 和已登记链上摘要后才显示。
- `scripts/persistent-chain.ts` 包装 Hardhat EDR，并串行化所有读写 RPC；每次写入先 fsync intent，执行后写入回执/区块证明，成功落盘后才响应。重启按冻结时间与依赖版本重放，逐项核对哈希；尾部未确认 intent 可重放，其余断序、损坏、版本差异一律失败关闭。签名请求不进入操作日志。
- `scripts/local.ts` 用稳定 sessionId 将数据库、加密密钥、部署清单及 genesis 绑定；恢复失败不删除或自动替换旧会话。`mvp:new` 才更换会话。当前恢复时间随操作数量线性增长，适用于本地 Demo，不是生产区块链持久存储方案。日志对意外损坏提供校验，不抵抗能同时重写整套本机数据的攻击者。
- 不改变链上状态机、金额规则或时间窗口。API补齐协议摘要、到期拒读和不存在案件的404。跨平台模板位于 `docs/ci/verify.yml`；GitHub凭据缺workflow权限，尚未启用，当前只有Linux本机实测。证据见 T015–T018 记录。

## T019 Fuji运行入口

`scripts/fuji.ts` 提供 `mvp:fuji`，读取 `.env.fuji.local`（可选）及部署清单，验证链、官方测试USDC、Factory token绑定和成功部署回执后才构建并启动本机API/前台。强制关闭开发钱包，数据与本地31337会话分离；密钥首次自动生成并以0600保存，普通重启保持，Factory/密钥不匹配时失败关闭。手机projectId不影响桌面Core连接，未自动对公网开放服务。
