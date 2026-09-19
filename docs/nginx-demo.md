# 云服务器上的 Nginx 演示入口

用户在 2026-09-19 明确要求通过 Nginx 从本地电脑访问云服务器前台。本次为 [002 Spec](../spec/features/002-demo-frontend.md) 的部署扩展 / T011，不含真实后端或链上部署。

## 当前入口与状态

- 页面：`http://43.156.129.189:8080/`
- 截图包：`http://43.156.129.189:8080/situationshit-screenshots.zip`
- 网页版本：main `7c288c4`，Mock 前台。
- Nginx 直接提供构建产物，不依赖 Vite 5173 进程。
- 主机监听、本地资源检查已通过，服务为 `active` / `enabled`。
- 公网 8080 探测暂时超时，已请服务器负责人在腾讯云安全组放行入站 TCP 8080；公网可用性尚未验收。

服务器 80 端口已有其他项目，占用进程未更改。系统默认 `nginx.service` 不启用，使用独立 `situationshit-nginx.service` 和独立配置，避免默认配置抢占 80。

## 配置与运行

仓库模板：[Nginx 配置](../deploy/nginx/nginx.conf)、[systemd 服务](../deploy/nginx/situationshit-nginx.service)。

| 项目 | 云服务器实际路径 |
| --- | --- |
| 配置 | `/etc/nginx/situationshit/nginx.conf` |
| 服务 | `/etc/systemd/system/situationshit-nginx.service` |
| 已部署静态产物 | `/var/www/situationshit/releases/7c288c4/` |
| 当前版本链接 | `/var/www/situationshit/current` |
| 访问 / 错误日志 | `/var/log/nginx/situationshit.access.log` / `situationshit.error.log` |

```bash
nginx -t -c /etc/nginx/situationshit/nginx.conf
systemctl status situationshit-nginx
systemctl reload situationshit-nginx
curl -I http://127.0.0.1:8080/
```

首次安装使用 `dnf install -y nginx`；安装仓库模板到上述路径后执行 `systemctl daemon-reload`、`systemctl enable --now situationshit-nginx`。独立配置不包含系统默认站点，也不代理仓库文件、源代码或 API。

更新网页时，在项目中 `npm ci`、`npm run build`，将 `apps/web/dist/` 内容复制到新的版本目录，再原子切换 `current` 软链接；保留旧版本目录以便回退。截图 ZIP 是独立导出的静态附件，重新构建后需按需重新复制。网页路由使用 `#/…`，缺失资源返回 404，隐藏文件返回 403。

停止本项目演示可执行 `systemctl disable --now situationshit-nginx`；不需要停止占用 80 的另一个服务。

## 公网访问检查

腾讯云控制台 → 当前实例 → 安全组 → 入站规则，允许 TCP 8080。来源可设为演示者公网 IP；需要公开展示时设为 `0.0.0.0/0`。若是轻量服务器，则在实例防火墙中增加对应端口规则。该配置位于云平台，主机监听成功不等于云平台已允许访问。

开放后，在自己的电脑打开上述 HTTP 地址，无需 SSH 端口转发。页面保留模拟标识；当前没有真实钱包、账户登录或私密后端数据。

## 实际验证

2026-09-19：Nginx 1.29.8（OpenCloudOS 软件源）；配置语法通过，独立 systemd 服务 active/enabled，监听 `0.0.0.0:8080`。首页、JS、CSS、图片与截图包本机 HTTP 200，返回内容 SHA-256 与发布目录完全一致；`.git/config`、`.env` 返回 403，不存在的 JS 返回 404。原 80 端口检查仍返回原有 401。`systemd-analyze verify` 退出 0，仅提示机器现有 `tat_agent.service` 使用旧 PID 路径，未改动该服务。

云服务器自身访问公网 IP 的 80 端口返回 401，8080 / 5173 超时。结合本机监听与主机防火墙检查，云平台端口规则是待排查项；没有声明外部电脑已访问成功，也没有自行修改云账号权限或其他站点。
