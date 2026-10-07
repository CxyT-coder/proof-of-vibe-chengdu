# 活动五项准备清单

按用户收到的活动通知逐项落实。以下“已完成”只表示本机或项目中已实际具备对应组件，钱包操作、线上部署和提交记录仍需实际验证。

## 1. 电脑、充电器、手机与 Ubuntu

- 本机已有 WSL2，发行版名称为 `Ubuntu`，系统为 Ubuntu 26.04。
- 项目使用 Node.js 24+；Linux Node.js 24.14.1 运行时已下载到项目的 `.tools` 目录，启动脚本会优先使用它。
- Windows 浏览器运行 Phantom；Ubuntu 命令行运行项目。
- 出发前自己检查电脑、充电器、手机和网络。

在 PowerShell 检查发行版：

```powershell
wsl --list --verbose
```

本项目的 Devnet 网页 demo 使用现有链上程序，运行它不需要先安装 Rust、Anchor 或 Solana CLI。[WSL 官方命令说明](https://learn.microsoft.com/zh-cn/windows/wsl/basic-commands)

## 2. AI 工具与官方 Solana Skill

- 已安装项目内的 Solana 官方 Skill：`.agents/skills/solana-dev/SKILL.md`。
- AI 已能读取 Skill，并按钱包自己签名、默认 Devnet、先模拟的要求开发 demo。
- 已配置 Solana 开发 MCP；服务连接状态以工具实际响应为准。
- 活动前自己确认 AI 账户能继续使用、额度充足。

安装来源：[Solana 官方 Skills](https://solana.com/zh/skills)。

## 3. Phantom、Devnet 与测试币

这部分由钱包持有人自己完成，项目不会读取或保存助记词、私钥。

1. 从 [Phantom 官方下载页](https://phantom.com/download)安装电脑浏览器扩展和手机 App。
2. 创建专门练习的钱包；自己离线保管恢复信息。
3. Phantom → 设置 → 开发者设置 → 测试网模式 → Solana Devnet。
4. 复制 **公开 Solana 地址**，在 [Solana Faucet](https://faucet.solana.com/)申请 Devnet SOL。
5. 在网页连接钱包，确认地址正确、余额已经到账。

Phantom 的测试网切换步骤可见[官方说明](https://help.phantom.com/articles/5997313271699)。测试币不需要购买；领取失败可能是 Faucet 限流，按页面提示稍后重试。

昵称、留言和公开钱包地址都会进入可查询的链上记录。不要在留言中填写电话、证件号码、密码或恢复信息。

## 4. GitHub 与网页部署

- 本机 GitHub 已登录账户 `CxyT-coder`；提交成功以远端仓库实际可访问为准。
- 代码上传后的仓库 URL 填入 [提交材料](SUBMISSION.md)。
- 当前选择 Vercel 部署 Next.js；相关开发 Skill 与 MCP 已配置，Vercel OAuth 仍需要账户持有人在登录页面完成授权。
- 授权后导入仓库，选择 Node.js 24.x，完成构建并取得公开 URL。
- 用该公开 URL 再试一次读取签到墙、连接 Phantom 和查询 Devnet 余额。

[Vercel AI 开发资源](https://vercel.com/docs/agent-resources)、[Vercel Next.js 部署说明](https://vercel.com/docs/frameworks/full-stack/nextjs)。如活动要求改用 Cloudflare，再按[官方 Agent Setup](https://developers.cloudflare.com/agent-setup/)适配。

本地能打开页面、GitHub 已登录、部署工具已安装，都不能代替实际上传与发布的结果。

## 5. 跑起模板并完成一次演示

项目来自官方 Kit Next.js 模板，源提交为 `aab62d27b01d44c6d2eba3c6da6d3bf038726ecc`，沿用模板已有主要依赖版本。

在 PowerShell 启动和检查：

```powershell
.\scripts\dev-wsl.ps1
```

另开终端，在停止开发服务后检查生产构建与测试：

```powershell
.\scripts\check-wsl.ps1
```

最后亲自完成一次：连接钱包 → 查询余额 → 填写公开昵称和留言 → 模拟 → 确认 Phantom → 等待已确认 → 打开 Explorer → 刷新活动墙。把实际交易链接和截图放入提交材料，按 [演示稿](DEMO_SCRIPT.md)录制或现场讲解。

[Solana 官方开发模板](https://solana.com/developers/templates)、[中文快速入门](https://solana.com/zh/docs/intro/quick-start)。
