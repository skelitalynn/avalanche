# Core / Fuji 真实验收

本地五钱包、手机尺寸截图及加速时间测试已经有独立命令；它们不能替代真实钱包与 Fuji 交易。当前没有 Fuji 部署清单、项目 WalletConnect projectId、测试账户余额或真机记录。

## 先检查配置

```bash
npm run preflight:fuji
```

该命令只读官方 RPC：核对43113、项目固定测试USDC代码及6位精度，输出 `artifacts/fuji/preflight.json`，不签名、不部署、不发送交易。RPC预检通过只说明网络与代币可读。

准备 Core 桌面扩展、Core Mobile、五个独立测试钱包，以及对应测试 AVAX 和测试 USDC；网络与水龙头入口见 [生态文档](../spec/ecosystem.md)。私钥/助记词只保留在本人设备，不通过聊天或仓库交接。WalletConnect 使用项目自己的公开 projectId。

## 部署与验收交接

用户已于2026-09-19明确授权Fuji部署。在操作者本机安全配置部署环境，使用现有 `deploy:fuji`；该脚本还要求 `CONFIRM_FUJI_DEPLOY=yes`。核对部署回执成功、Factory字节码、固定代币，再保存生成的 `.local/deployment-43113.json`。不得把本地TestUSDC地址替换到Fuji。

单独配置 API 的 origin、数据库和加密密钥；前台设置 `VITE_DEFAULT_MODE=live`、`VITE_LOCAL_WALLETS=false`、`VITE_WALLETCONNECT_PROJECT_ID`，按 `.env.example` 对齐部署清单。手机使用可访问的 HTTPS 站点与同源 API；手机的 `127.0.0.1` 指向手机本身，不能直接访问电脑回环服务。站点部署和对外暴露需明确授权，本地启动器不会自动开放。

执行并记录：

1. Core 桌面和手机分别连接、拒签、切错链并恢复；核对地址、43113、返回页面和会话切换。
2. 五钱包完成共同签署、监督接受、双方50+20入金。每笔记录哈希、成功回执和业务状态；授权不算入金。
3. 完成双方正常结束，核对真实测试代币70/70；完成两种被申诉方的违约流程，核对50/90及90/50。
4. 真实等待48小时说明窗口及72小时监督窗口，另走否决、超时、和解和待付款重试；不能使用本地时间推进 RPC 冒充真实等待。
5. 对照 [32项矩阵](../spec/verification/t015-t018-local-completion.md) 补齐 F 列；记录设备/系统、钱包版本、网络、交易与回执、业务前后状态。敏感内容和签名不要写入公开证据。

未具备这些条件时，真实验收保持未完成；本地产品仍可独立运行。

## 用自己的Core钱包和测试币启动

取得已经验证的 `.local/deployment-43113.json` 后，在自己的电脑执行：

```bash
npm ci
npm run mvp:fuji
```

打开 http://127.0.0.1:5174/，连接Core扩展并切到Fuji（43113）后签名登录。界面必须显示“Fuji · 测试网”，不会出现本地五钱包按钮。API及加密数据仍在自己电脑，链和测试币位于Fuji。不要使用 `mvp:local` 操作Fuji资金。

部署gas和每次链上操作使用测试AVAX；入金使用Circle官方Fuji USDC。五个角色需不同地址，各参与者准备自己约定的R+B测试USDC，三位好友准备投票gas；钱包保管私钥。

手机连接时将 `.env.fuji.example` 复制为 `.env.fuji.local`，填写自己的WalletConnect projectId；手机访问需要可达站点，HTTPS反向代理的origin也需在文件中对应配置。启动器仅监听电脑回环地址，不会自行公开端口。

按用户要求，T019不执行CI或回归套件；只构建启动所需产物、核对真实部署回执与健康接口。
