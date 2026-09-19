# 启用三系统验收

`verify.yml` 是完整可执行的 GitHub Actions 工作流模板，覆盖 Ubuntu、Windows、macOS 的干净安装、合约、API、加密数据恢复和浏览器流程。

当前 GitHub OAuth 凭据缺少 `workflow` scope，首次推送 `.github/workflows/verify.yml` 被 GitHub 拒绝。因此模板暂存于本目录，**没有在 GitHub Actions 上执行，不能据此声称三系统通过**。

由仓库操作者补齐当前身份的 `workflow` scope 后，将本文件复制到 `.github/workflows/verify.yml` 并通过任务PR提交。可由操作者在已登录 GitHub 的终端运行 `gh auth refresh -h github.com -s workflow` 完成授权；助手不会自行更改账号或远程权限。也可由有权人员在GitHub网站新增对应工作流文件。

每个平台需全部检查通过，并保留 `evidence-<os>` artifact。模板使用Node24.13.0，安装包从公共npm registry读取，不依赖腾讯云。实际运行结果应补回 [验证记录](../../spec/verification/t015-t018-local-completion.md)。
