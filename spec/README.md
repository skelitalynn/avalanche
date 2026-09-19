# Spec 入口

## 目标与范围

构建一个可运行、可测试、可现场演示的 Avalanche 生态 Demo。优先完成一个完整的核心使用流程。

| 项目项 | 当前约定 |
| --- | --- |
| 项目规模 | 小型黑客松 Demo |
| 产品方向、目标用户 | SituationSHIT；暧昧期、dating 阶段及尚未明确关系定义的两个人 |
| 核心使用流程 | 创建并双签协议 → 各存恢复基金与保证金 → 正常结束各自退款，或正式确认、失联申诉、好友投票后结算 |
| 链与资产 | Avalanche C-Chain、USDC；开发验收使用已确认的 Fuji，官方测试 USDC 已核对；网络参数见 [生态文档](ecosystem.md) |
| 应用形式 | 中文移动端优先 Web 单页应用 |
| 基础技术栈 | 已确认 TypeScript + React + Vite；Core Wallet；wagmi + viem；Vitest + Playwright，详见 [架构](architecture.md) |
| 自定义合约 | 需要，使用 Solidity + Hardhat；Factory + 每关系一个 Agreement，Vault/Dispute 为内部模块 |
| 后端与数据库 | TypeScript + Fastify、SQLite、私有加密附件目录 |
| 当前范围 | MVP 需求文档与任务拆分，基础选型已确认；尚未初始化工程 |

暂不规划主网发布、自建 L1、多链互操作等扩展；如核心场景需要，在对应 Spec 中明确后再加入。

## 目录

```text
spec/
├── README.md             # 目标、范围、索引
├── architecture.md       # 技术栈、模块边界、关键流程
├── contracts.md          # 数据、API、智能合约交互约定
├── ecosystem.md          # Avalanche 工具、网络与操作参考
├── roadmap.md            # 开发顺序、任务、测试、验收进度
└── features/
    ├── 001-situationship.md # SituationSHIT 关系承诺 MVP
    └── _template.md      # 复制为 001-功能名称.md
```

阅读顺序：[Roadmap](roadmap.md) → [架构](architecture.md) → [接口与数据](contracts.md) → 对应功能 Spec；环境准备参考 [生态文档](ecosystem.md)。

## 功能索引

| 编号 | 功能 | Spec 状态 | 任务 |
| --- | --- | --- | --- |
| 001 | [SituationSHIT 关系承诺 MVP](features/001-situationship.md) | READY：业务规则、状态机、接口和验收基线已冻结 | T002、T005-1 至 T005-8、T006、T009 |

首版排除 AI Agent、DeFi 收益、eERC 隐私金额、线下商户消费及更多 commitment 类型。新增功能使用下一个空闲编号，复制 [模板](features/_template.md)，并在此处加入链接。

## 维护规则

1. 实现前写清功能行为、异常场景和验收标准，待定项不得默认为已确认需求。
2. 公共技术约定放在架构与接口文档，功能细节放在功能 Spec，任务进度只在 Roadmap 维护。
3. 每个任务关联 Spec 和验收项；完成时记录验证命令或人工步骤、实际结果、相关文件或 commit。
4. 测试失败或受环境阻塞时保留结果；实现完成、模拟测试通过和真实测试网验收通过分别记录。
5. 需求变更时同步更新 Spec、任务和相关测试，不单独维护重复的需求/测试/任务目录。
6. 自然语言需求由助手按 [开发规则](../AGENTS.md) 整理成可执行 Spec；任务认领、编号与 Git 操作遵循 [协作指南](../docs/collaboration.md)。
