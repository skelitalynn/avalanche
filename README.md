# Avalanche Demo

基于 Avalanche 生态的小型黑客松 Demo，采用轻量 Spec 驱动开发。

当前产品方向为 SituationSHIT：面向两个人的关系承诺、USDC 托管与好友争议判断产品，中文移动端优先。已整理[项目功能 Spec](spec/features/001-situationship.md)；T002 已确认业务规则并冻结状态机与接口，已提供可运行的 Mock 演示前台，后端、钱包和链上部署尚未接入。

技术方案：TypeScript + React + Vite，使用 Core Wallet、wagmi + viem 接入 Fuji C-Chain；测试采用 Vitest + Playwright。自定义合约采用 Solidity + Hardhat。后端采用 TypeScript + Fastify、SQLite 和私有附件存储；具体依赖版本在工程初始化时锁定，详见 [技术架构](spec/architecture.md)。

- [Spec 入口](spec/README.md)：项目范围与文档导航。
- [开发 Roadmap](spec/roadmap.md)：任务、依赖、测试、验收与完成证据。
- [Avalanche 开发参考](spec/ecosystem.md)：Fuji 网络参数、钱包、测试币和工具入口。
- [开发规则](AGENTS.md)：自然语言需求转 Spec、实现与验收的统一约定。
- [多人协作指南](docs/collaboration.md)：任务认领、Git 分支、提交、PR 与冲突处理。

开发顺序：明确功能 Spec → 拆分任务 → 实现 → 测试与验收 → 更新进度。

## 运行前台演示

推荐 Node 24（`.nvmrc`），最低 Node 22.12。仓库根目录执行：

```bash
npm ci
npm run dev
```

打开 <http://localhost:5173>。右下角「演示控制」可切换角色、场景、推进模拟时间；所有操作均为本机 Mock，没有真实钱包或资金转移。

做 PPT 可使用 `http://localhost:5173/?present=1#/relationship` 隐藏演示控制并保留模拟标识。七类页面、演示步骤和后端接入点见 [前台演示指南](docs/frontend-demo.md)。

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run screenshots
```

截图输出到 `artifacts/screenshots/`，覆盖桌面 1440×1000 与手机 390×844 的七个页面。浏览器测试默认使用生产预览和单 worker，便于内存较小的演示机器运行。若已有 5173 服务，会复用该服务；需要验证新代码时先构建并重新启动预览。

只演示生产版本：执行 `npm run build`，再执行 `npm run preview`，同样使用 5173 端口；不要同时启动 dev 与 preview。
