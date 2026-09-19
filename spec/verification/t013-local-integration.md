# T013 本地真实后台接入验证

日期：2026-09-19。工作目录 `/tmp/avalanche-local-integration`，分支 `feat/001-local-integration`，基线 `bc404a2`。执行者为本任务AI助手自检，不是独立队友评审；最终提交与合并状态以T013关联PR为准。

## 实际交付

从用户授权的本地工作区复制API、Solidity、shared及钱包实现，在独立分支整合，未修改原工作区。保留主线T012绿色Mock页面；本机完整启动默认进入真实页面，HTTP同源代理、SIWE、SQLite加密数据和Hardhat交易串联。加入显式选择的五个本地开发钱包、测试资金准备、端口冲突检查、子进程清理、每轮独立数据目录和客户端待确认交易会话隔离。没有执行云服务部署或Fuji交易。

## 验证环境和命令

Linux x64，Node24.13.0，npm，依赖以本PR的package-lock为准。所有命令在上述工作目录执行，PATH指向Node24；没有复用其他工作区的链或API。

| 检查 | 实际结果 |
| --- | --- |
| `npm ci` | 退出0，干净安装371个包；当次审计报告0漏洞（仅依赖扫描，不是合约安全审计） |
| `npm run contracts:build` | 退出0，solc0.8.30编译6份Solidity、生成共享ABI；后续运行无待编译变更 |
| `npm run typecheck` / `npm run typecheck:core` | 退出0；最终build/build:local均再次执行前台TS检查，最终core检查也退出0 |
| `npm test` | 17项通过：12项原Mock行为、2项HTTP响应/错误、2项本地钱包权限与错链、1项重启后待确认交易隔离 |
| `npm run test:core` | 11项通过；真实本地EVM、Fastify注入请求和临时SQLite，独立18545端口 |
| `npm run build` / `npm run build:local` | 均退出0；普通构建默认Mock且不开启本地钱包，本地构建默认真实服务并显式启用开发钱包 |
| `npm run test:local` | 1项多场景集成通过：三个占用端口逐一拒绝且保留原监听，两轮真实启动/退出、health/config、独立目录、退出后端口释放 |
| `npm run mvp:local` | 实際编译/构建/部署/启动成功；本机5174的health=ok、chainId31337，三个服务只监听127.0.0.1 |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5174 npm run test:e2e` | 11项通过：原Mock完整流程/双视口/截图8项，真实入口错误响应和错网络拒绝3项 |
| `npm run test:live` | 五个页面内置本地钱包完成真实SIWE签名、创建、B签署、三监督人接受、A/B授权与入金、正常70/70、A违约50/90；直接读取链上paid核对。手机390宽无溢出、无页面JS错误、运行期无外部HTTP请求 |
| `git diff --check`、Markdown本地链接/围栏 | 通过；16份Markdown、106个本地文件链接有效；不代表完整业务验收或CI |

新增AC-001-33对应本机启动与HTTP，34对应真实本地闭环，35对应HTTP/钱包单测与三项浏览器故障测试，36对应启动器集成及会话单测。最终本地闭环结果的公开摘要见 [JSON记录](t013-local-result.json)。截图与完整运行产物位于忽略的 `artifacts/live/`、`artifacts/screenshots/`；桌面失败截图和手机最终结算图已人工查看，手机资金应得/已付可读。

原001测试名称中的多个AC编号表示覆盖该AC的部分断言，不等于该AC所有边界已满足。核心测试覆盖五身份约束、双签/监督人门槛、精确入金、A/B违约分配、重复付款、部分入金取消、截止/迟到回应、在途确认、固定争议窗口、和解、隔离付款失败与重入、材料计数/冻结，以及SIWE重放、角色隐私、双确认记录、到期清理、摘要绑定和幂等性。T005-8仍为VERIFY。

## 保留的失败与修复

1. 新增换钱包清理时把可选地址设为null，首次本地构建被TypeScript拒绝。修正为undefined，后续类型检查和构建通过。
2. 首次浏览器闭环在B签署按钮处超时；失败图显示实际登录A。原因是开发Provider初始即返回账户，触发钱包库自动连接第一个身份。改为初始未授权，必须主动选角色；增加未选择时账户为空的单测与每次登录实际地址断言。没有放宽B签署权限，修复后全流程通过。
3. 整合复核发现HTTP返回了Solidity数字枚举，已改成Spec约定的大写枚举名称，并同步前台和API行为断言；ABI层仍使用Solidity原始枚举顺序。
4. 格式化首次未指定Solidity插件，工具报无法推断parser（未改Solidity）；显式使用已有prettier-plugin-solidity检查后通过。生成ABI按export-abi脚本重新生成，未手改。

## 未完成与限制

- 本轮在Linux验证；启动代码使用Node子进程、路径和文件API，文档可用于Windows PowerShell/macOS，但尚未在这两个系统实机运行。
- 每次停止再启动都会生成新本地链与数据库；旧目录保留但没有链快照恢复。适合个人电脑Demo，不是长期数据服务。
- 开发钱包由本地Hardhat托管测试账户，无扩展确认弹窗；不是Core真机或手机WalletConnect验收。普通构建默认不开启；本地构建仅在回环主机、31337和当前账户匹配时允许签名/交易。
- 未执行Fuji部署、测试网真实资金操作、云部署或远程配置修改；首次安装/编译仍需网络下载依赖和编译器。
- 原32项AC还缺逐条完整边界矩阵、全部异常交易恢复与真实设备验证；不声明生产可用或安全审计通过。图片采取SQLite加密字段存储，外部鉴权路由不变，变更已同步architecture/contracts。
