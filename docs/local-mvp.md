# 在自己的电脑运行

需要 **Node.js 24.13 或更新的 Node 24**、npm 和 Git。Windows 可在 PowerShell 执行，macOS/Linux 在终端执行。以下服务和数据全部在你自己的电脑；无需腾讯云、SSH、Nginx、域名或云端数据库。首次安装和下载 Solidity 编译器需要联网。

```bash
git clone https://github.com/skelitalynn/avalanche.git
cd avalanche
npm ci
npm run mvp:local
```

已有仓库时先在干净的 `main` 上执行 `git pull --ff-only origin main`。等待终端出现 `Local MVP ready`，打开 **http://127.0.0.1:5174/**。请用这个准确地址，避免 `localhost` 与 `127.0.0.1` 的登录 Cookie/Origin 不同。

启动器编译合约、构建前台、启动本地 Hardhat 链、部署 TestUSDC 和 Factory、给前五个开发账户各准备1000测试USDC，再启动 Fastify API 与前台。所有业务请求使用同源 `/api/v1`，钱包签名与资金操作落到本地合约，不使用 Mock 状态生成成功结果。

## 点通一次真实本地流程

不必安装扩展或导入私钥，启动器构建的页面提供五个**本地开发钱包**。这些是 Hardhat 的公开测试身份，仅用于本机测试，不要存入真实资产；按钮直接使用本地节点签名和发送交易，没有真实钱包的确认弹窗。

1. 选「本地钱包 · 参与者 A」→「签名登录」→「创建约定」。B 和三位好友的本地地址已预填，金额用50/20，保存协议并创建。
2. 「断开连接」→选择参与者 B →签名登录→从列表打开这段关系→接受并签署。
3. 依次切换 A 的好友、B 的好友、共同好友，登录并打开该关系，接受监督职责。
4. A/B 分别登录，打开关系，在「协议与入金」各执行精确授权、存入资金。第二人入金后变为进行中。
5. A 在「我的关系」提出结束；B 在「结束与结算」确认。应得和已付都为每人70 USDC。

可以多开浏览器隐私窗口，或在同一页面依次断开/连接角色。页面的「本地测试钱包地址」可查看完整地址。本地开发钱包只在显式开启的回环站点提供，并拒绝非31337网络；普通 `npm run build` 不包含启用配置。

若使用 Core 桌面钱包，添加 Chain ID `31337`、RPC `http://127.0.0.1:8545`；自己的钱包地址还需准备本地 gas 和 TestUSDC。上述内置五钱包路径已经准备好资金。手机 WalletConnect 缺项目配置时不可用，本轮不需要它。

## 模式和数据生命周期

| 入口 / 服务 | 用途 |
| --- | --- |
| http://127.0.0.1:5174/ | 默认真实 API + 本地 EVM + 本地测试钱包 |
| http://127.0.0.1:5174/?mode=mock | 独立 Mock 演示；保留绿色七页和模拟标识 |
| 127.0.0.1:3001 | 私有 API，仅回环；浏览器从前台同源代理访问 |
| 127.0.0.1:8545 | 本地 EVM RPC，仅回环，Chain ID 31337 |

保持启动终端打开。**Ctrl+C 停止这一轮的三个服务；重新启动会创建全新的本地链和数据库。** 同次运行刷新页面，业务数据仍在 API/链中；刷新后重新连接并签名登录即可。旧运行目录保留在 `.local/runs/<随机ID>/`，包括加密SQLite、密钥、公开部署信息，但不会被新链复用。旧目录不等于可恢复的链快照。`.local/current.json` 指向最近一次启动；这些文件都被 Git 忽略，不能提交或公开。

端口5174/3001/8545被占用时启动失败并保留原服务，请先关闭占用的程序再重试。本项目不会接管其他节点，也不修改本机服务配置。配置模板 `.env.example` 供单独启动 API/Fuji 的后续工作参考；`mvp:local` 自动生成本地配置，无需复制或填写密钥。Node的SQLite实验性提示不是启动失败。

## 验证命令

在仓库根目录、Node 24 下执行：

```bash
npm run contracts:build
npm run typecheck
npm run typecheck:core
npm test
npm run test:core
npm run build:local
npm run test:local
npx playwright install chromium
npm run mvp:local
```

`test:local` 会短暂占用三个服务端口，需在 `mvp:local` 未运行时执行。`test:core` 使用独立18545端口；它们会部署和操作本地测试合约。

保持 `mvp:local` 运行，在另一个终端执行：

```bash
npm run test:live
```

该测试通过页面中的五个开发钱包签名，核对链上正常70/70、A违约50/90的已付款结果，检查手机宽度，输出到 `artifacts/live/`。它会推进本地链时钟；跑完建议 Ctrl+C 后重新启动，得到干净会话。

原 Mock 回归可单独执行 `npm run test:e2e`（自动在5173构建/预览）；它会覆盖前台产物，完成后重新执行 `mvp:local` 构建真实入口。首次安装 Chromium 可能需要系统浏览器依赖，按 Playwright 的实际提示安装。

## 验收边界

这是真实本机 HTTP、加密数据库、签名认证及 EVM 合约交易；资产是 TestUSDC，钱包为受控开发身份。没有进行腾讯云部署、Fuji部署/资金交易、Core扩展或手机真机验收。原001全部32项复杂边界也没有整体验收；本次实际覆盖和已知限制见 [T013验证记录](../spec/verification/t013-local-integration.md)。
