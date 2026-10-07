# Proof of Vibe · 成都链上签到

## 可复制的项目介绍

Proof of Vibe 是面向线下社区活动的 Solana Devnet 签到网页。参与者连接 Phantom、填写昵称和一句留言，先查看交易模拟与摘要，再通过钱包签名。交易确认后，网页展示可公开验证的 Explorer 链接，同一活动的留言出现在公共签到墙上。

项目希望让新手通过一次实际操作理解钱包、测试币、交易签名和链上验证。它使用现有 Memo 与 System Program 完成签到，只需测试网手续费。

## Demo 亮点

1. **真正走完链上流程**：钱包连接、余额查询、交易模拟、用户签名、网络确认、Explorer 验证。
2. **明确的签名前检查**：展示 Devnet、公开留言、0 SOL 自转和费用；用户自己确认钱包请求。
3. **所有人可看的活动墙**：通过活动 reference 查询链上数据，未连接钱包也能浏览。
4. **面向中文初学者**：中文界面、WSL 启动脚本和现场演示稿。

## 技术路线

基于 [Solana 官方 Next.js 模板](https://solana.com/developers/templates/nextjs)，保留 Next.js 16.3.4、React 19.2.3 与 Kit 7 系列依赖。前端使用 TypeScript、Tailwind CSS 4、`@solana/react` 和 Wallet Standard；链上使用 Memo 与 System Program。

每次签到包含昵称与留言的 Memo，以及附加活动 reference 的 0 SOL 自转。读端通过 `getSignaturesForAddress` 查询该 reference 的相关交易，再读取并验证签到格式，生成公开活动墙。交易达到 `confirmed` 后才显示签到成功。

当前 demo 不包含自定义 Anchor 合约。它展示的是使用现有 Solana 程序构建可运行产品的流程。

## 演示步骤

打开网页 → 浏览公开活动墙 → 连接 Phantom → 查看 Devnet 余额 → 填写昵称和留言 → 模拟并检查摘要 → 确认钱包签名 → 等待已确认 → 打开 Explorer → 查看新增签到。

完整台词见 [演示稿](DEMO_SCRIPT.md)。

## 提交链接与验证记录

源码已上传 GitHub，CI 检查已成功完成。Vercel CLI 已安装，账号登录正在处理中；公开 demo URL 待实际部署成功后填写。

| 项目                 | 真实记录                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub 仓库          | [CxyT-coder/proof-of-vibe-chengdu](https://github.com/CxyT-coder/proof-of-vibe-chengdu)                                                                             |
| CI 检查              | [GitHub Actions 成功运行](https://github.com/CxyT-coder/proof-of-vibe-chengdu/actions/runs/37584990372)：Node.js 24、依赖安装、类型检查、自动测试、生产构建全部成功 |
| 在线 Demo            | 待部署成功后填写                                                                                                                                                    |
| Devnet 签到交易      | 待参与者在 Phantom 确认签名并获得链上确认后填写                                                                                                                     |
| 演示截图或视频       | [实际页面预览](images/hero.png)；演示视频可按演示稿录制                                                                                                             |
| 构建、类型检查与测试 | 2026-10-07：生产构建、TypeScript、10/10 测试、桌面与手机浏览器检查通过；主机浏览器读取 Devnet 返回 HTTP 200                                                         |
| 活动指定提交入口     | 未提供，按主办方现场要求提交                                                                                                                                        |

## 当前边界与后续计划

公共墙查询最近 20 个相关交易候选并过滤签到，不提供完整历史或精确参与人数；公共 RPC 存在限流，Devnet 记录不承诺长期保留。昵称是用户自行填写，活动标记公开，没有真人身份验证或每人一次的链上规则，当前不能用于正式门禁或有价值奖励的发放。

后续可以增加多活动创建、活动二维码、索引分页与审核；需要更严格的规则时，再开发限制重复签到、签发参与凭证的合约。
