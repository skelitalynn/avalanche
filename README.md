# Avalanche Demo

基于 Avalanche 生态的小型黑客松 Demo，采用轻量 Spec 驱动开发。

当前已建立文档与协作框架，并确认基础技术选型；业务方向仍待确定，应用代码、启动命令和链上部署尚未提供。

技术方案：TypeScript + React + Vite，使用 Core Wallet、wagmi + viem 接入 Fuji C-Chain；测试采用 Vitest + Playwright。若业务需要自定义合约，采用 Solidity + Hardhat。后端、数据库与具体依赖版本尚未确定，详见 [技术架构](spec/architecture.md)。

- [Spec 入口](spec/README.md)：项目范围与文档导航。
- [开发 Roadmap](spec/roadmap.md)：任务、依赖、测试、验收与完成证据。
- [Avalanche 开发参考](spec/ecosystem.md)：Fuji 网络参数、钱包、测试币和工具入口。
- [开发规则](AGENTS.md)：自然语言需求转 Spec、实现与验收的统一约定。
- [多人协作指南](docs/collaboration.md)：任务认领、Git 分支、提交、PR 与冲突处理。

开发顺序：明确功能 Spec → 拆分任务 → 实现 → 测试与验收 → 更新进度。项目初始化后，在这里补齐环境要求、安装、启动、测试和构建命令。
