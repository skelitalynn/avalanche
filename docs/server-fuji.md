# 当前服务器 Fuji 演示入口（T025）

2026-09-19 按用户请求部署真实前台/API，复用 [Fuji清单](../deployments/fuji.json)。业务代码基于 main `5dea2ea` 加本PR的钱包提示/监听日志调整；没有重新部署合约、发送资金交易或改动业务规则。个人电脑启动方式继续有效。

## 使用

本次临时 HTTPS：[打开 SituationSHIT](https://respected-suppose-princess-display.trycloudflare.com)。用安装了 MetaMask 或 Core 扩展的电脑浏览器打开，连接钱包，切换 Fuji 43113，签名登录。资金流程需要测试AVAX支付gas，以及 [生态文档](../spec/ecosystem.md) 中的官方Fuji USDC。登录签名不转账。

前台默认真实模式；匿名可浏览公开页面，私有API必须通过钱包签名登录，会话一小时。当前数据库是独立的新服务器实例，不自动同步个人电脑的数据。不同参与者必须使用同一个站点入口。WalletConnect未配置projectId，手机扫码连接尚未开放；尚未用用户MetaMask完成入金至结算的真实Fuji业务验收。

## 运行布局

- `/opt/situationshit-fuji/current`：固定版本应用、依赖及已构建前台；独立 Node 24.13.0 可执行文件放在其父目录。依赖从本服务器此前已安装且匹配同一lockfile的目录复制，避免重新下载；没有运行npm CI测试。
- `/etc/situationshit-fuji/api.env`：root 0600，包含APP_ORIGIN、加密密钥、数据库/部署清单路径。没有部署钱包私钥。
- `/var/lib/situationshit-fuji`：situationshit用户0700，SQLite 0600；与本地演示数据隔离。备份时停止API，连同数据库相关文件和env一起安全备份；不要重建加密密钥配合旧数据库。
- `situationshit-fuji-api.service`：非root运行，只监听127.0.0.1:3002。
- `situationshit-fuji-web.service`：Nginx，127.0.0.1:8081提供静态前台并代理同源`/api/`。旧8080 Mock站点保留。
- `situationshit-fuji-tunnel.service`：现有cloudflared复制到专用目录，转发8081。API/静态服务已启用开机启动及失败重启；临时隧道未启用开机启动或自动重启，避免静默更换域名。

模板在 [deploy/server-fuji](../deploy/server-fuji)。新机器需先准备 Node24、Nginx、situationshit系统用户、应用发布目录和依赖；使用`VITE_DEFAULT_MODE=live VITE_LOCAL_WALLETS=false npm run build`构建。部署时将模板复制到上述配置路径，按env示例设置真实HTTPS域名、随机32字节十六进制密钥，再安装systemd单元。切勿把env示例的占位密钥直接用于运行。WalletConnect若启用，构建与API环境必须使用同一个projectId。

## 检查、重启与停止

```bash
systemctl status situationshit-fuji-api situationshit-fuji-web situationshit-fuji-tunnel
curl -fsS http://127.0.0.1:8081/api/v1/health
systemctl restart situationshit-fuji-api situationshit-fuji-web
# 停止公网入口和本次应用，保留数据以及原8080站点
systemctl stop situationshit-fuji-tunnel situationshit-fuji-web situationshit-fuji-api
```

临时URL依赖当前隧道进程，退出SSH不影响systemd服务；隧道退出或服务器重启后该URL失效。恢复时手动启动隧道，从`journalctl -u situationshit-fuji-tunnel`取得新URL，将env中的APP_ORIGIN改成新URL，再重启API并重新登录。不要尝试恢复旧随机域名。固定地址需要用户域名和相应HTTPS配置；本次未配置。

## 实际验证（2026-09-19，AC-001-45/46）

工作目录`/tmp/avalanche-server-fuji`，Node24.13.0：

- 必要生产构建`VITE_DEFAULT_MODE=live VITE_LOCAL_WALLETS=false npm run build`退出0；该构建内含TypeScript检查。
- `nginx -t -c /etc/situationshit-fuji/nginx.conf`退出0。
- 公网根页面200，health200，config200，返回43113、官方USDC、现有Factory；walletConnectConfigured=false。
- 首次刚启动时config请求502（API尚未监听）；启动就绪后重试200，未掩盖初次失败。
- 匿名私有列表401；错误Origin的challenge请求403；实际新生成临时账户签名完成SIWE登录、私有列表200；challenge和session cookie均Secure/HttpOnly，消息域名及chainId正确。账户密钥仅存在探测进程内存，无链上交易。
- 重启API和静态服务后health200，同一登录会话仍可访问私有列表200；随后注销探测会话204。持久SQLite及密钥保留。
- 公网Chromium实际打开真实Fuji页面，标题正确、无pageerror；钱包区显示扩展连接入口和手机未配置提示（该浏览器未安装真实钱包扩展）。
- 未运行CI、npm test、test:e2e或其他回归套件；真实用户MetaMask资金闭环、Core真机和WalletConnect手机仍需人工验收。

现有API将反向代理请求视作同一回环IP，90请求/分钟限流由演示用户共享；本部署用于小规模验收，未声称生产容量验证。
