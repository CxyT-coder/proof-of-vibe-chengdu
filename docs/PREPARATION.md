# 活动五项准备清单

按用户收到的活动通知逐项落实。本清单记录已完成的本机准备、源码上传、同事的 Cloudflare 发布和 GitHub Pages 备用发布；Phantom 签名兼容补丁已通过本地类型检查与 14 项测试，Cloudflare 更新及真实 Devnet 签到交易、活动正式提交仍需完成。

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

### 当前签名报错

用户在 Cloudflare 页面签名后遇到“钱包修改了已审核交易内容”的提示，应用在广播之前拦截，本次没有由应用发送交易。Phantom 会对符合条件的交易在签名时自动添加优先费，这可能触发当前的严格交易内容一致性检查。[Phantom 官方说明](https://docs.phantom.com/developer-powertools/solana-priority-fees)

本分支已实现模拟前显式设置计算预算和 0 优先费的兼容补丁，并保留签名后的严格内容检查；本地类型检查与 14 项测试通过。Cloudflare 管理员需同步本分支；完成后由钱包持有人重新模拟、签名，再验证 Devnet 确认和 Explorer 链接。

## 4. GitHub 与网页部署

- 源码已上传 [CxyT-coder/proof-of-vibe-chengdu](https://github.com/CxyT-coder/proof-of-vibe-chengdu)，仓库链接已填入 [提交材料](SUBMISSION.md)。
- [已发布版本 GitHub Actions 检查](https://github.com/CxyT-coder/proof-of-vibe-chengdu/actions/runs/37586403285)已成功完成依赖安装、类型检查、自动测试与生产构建；此记录早于当前 Phantom 兼容补丁。
- Vercel 的相关开发 Skill、MCP 与 CLI 已配置；官方登录页面提示无法完成登录，需要账户持有人通过 [账号恢复表单](https://vercel.com/accountrecovery)申请恢复访问。
- [GitHub Pages 部署流程](https://github.com/CxyT-coder/proof-of-vibe-chengdu/actions/runs/37586402980)已成功完成；[公开 demo（备用发布）](https://cxyt-coder.github.io/proof-of-vibe-chengdu/)已上线并通过浏览器检查。
- 同事另发布了 [Cloudflare Pages demo](https://proof-of-vibe-chengdu.pages.dev/)，公开 URL 无法确认账户拥有者。部署者需在 Cloudflare 后台查看项目所在账户与成员权限，确认负责更新网站的管理员。
- 公开页面的 Chrome 桌面与手机视口、钱包菜单和输入预览已验证，真实 Devnet RPC 返回 HTTP 200，页面与静态资源错误均为 0。真实 Phantom 授权签名及签到仍由钱包持有人完成。

[Vercel AI 开发资源](https://vercel.com/docs/agent-resources)、[Vercel Next.js 部署说明](https://vercel.com/docs/frameworks/full-stack/nextjs)。恢复 Vercel 访问后，仍可导入现有仓库，使用 Node.js 24.x 与默认 Next.js 构建设置部署。

Cloudflare 页面已通过 Chrome 桌面与手机视口、钱包菜单和输入预览检查，HTTP 200、真实 Devnet RPC HTTP 200，页面与静态资源错误均为 0。按 [官方静态 Next.js 指南](https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/)更新时，使用 `Next.js (Static HTML Export)` 预设、`npm run build` 构建命令与 `out` 输出目录。针对本项目设置构建环境变量 `STATIC_EXPORT=1`，将 `NEXT_PUBLIC_BASE_PATH` 留空；需要 AI 平台工具时参考 [官方 Agent Setup](https://developers.cloudflare.com/agent-setup/)。

源码、公开网页 URL、CI 与部署成功记录均已填入 [提交材料](SUBMISSION.md)。活动指定入口由主办方提供后，再正式提交。

### 给 Cloudflare 部署者的更新步骤

以下内容供部署者复制操作，同步 `codex/proof-of-vibe` 分支中的兼容补丁。使用 Node.js 24+，保持锁文件和现有依赖版本。

```bash
git fetch origin
git checkout codex/proof-of-vibe
git pull --ff-only origin codex/proof-of-vibe
npm ci
STATIC_EXPORT=1 NEXT_PUBLIC_BASE_PATH='' npm run build
```

Cloudflare Pages 的构建分支设置为 `codex/proof-of-vibe`，构建命令为 `npm run build`，环境变量设置为 `STATIC_EXPORT=1`，`NEXT_PUBLIC_BASE_PATH` 留空，输出目录为 `out`。直接上传静态文件时上传重新生成的 `out`。完成后检查站点所用提交，再由钱包持有人重新模拟和签名；只有 Devnet 已确认并取得 Explorer 链接后，才记录真实签到成功。

### Vercel 账号恢复说明

登录页显示“无法完成登录，请填写账户恢复表单”。账户持有人可自己打开 [Account Recovery](https://vercel.com/accountrecovery)，填写实际账户信息，并粘贴以下英文说明；这是准备好的表单草稿。

```text
I am trying to sign in to Vercel to deploy Proof of Vibe, a Next.js demo for a Solana Chengdu event. The login page says it cannot complete my login and directs me to the account recovery form.

The project uses Phantom wallet connection and Solana Devnet to record public event check-ins. Source code: https://github.com/CxyT-coder/proof-of-vibe-chengdu

Please help me restore access to my account so I can complete the deployment.
```

## 5. 跑起模板并完成一次演示

项目来自官方 Kit Next.js 模板，源提交为 `aab62d27b01d44c6d2eba3c6da6d3bf038726ecc`，沿用模板已有主要依赖版本。

本地 Ubuntu 生产页面、[GitHub Pages 备用](https://cxyt-coder.github.io/proof-of-vibe-chengdu/)和 [Cloudflare 页面](https://proof-of-vibe-chengdu.pages.dev/)均已通过浏览器检查，真实 Devnet RPC 请求返回 HTTP 200；此前构建、类型检查与自动测试结果可查看 [CI 成功记录](https://github.com/CxyT-coder/proof-of-vibe-chengdu/actions/runs/37586403285)。本次 Phantom 兼容补丁已通过本地类型检查与全部 14 项测试，Cloudflare 更新、真实签名与链上签到仍需部署者和钱包持有人复测。

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
