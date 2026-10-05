<div align="center">

<img src="public/assets/syc-logo.svg" width="104" alt="SYC-AI">

# SYC-AI

### Claude Code 和 Codex，同一个对话。<br>一个额度用完，另一个接着干。

同一个项目文件夹，同一份记忆：用你自己的两个订阅，跑在你自己的 Android 手机或 Windows 电脑上。<br>
支持六种语言。

[![tests](https://github.com/SYCC-AI/syc-ai/actions/workflows/test.yml/badge.svg)](https://github.com/SYCC-AI/syc-ai/actions/workflows/test.yml)
[![release](https://img.shields.io/github/v/release/SYCC-AI/syc-ai?label=release&color=4f8cff)](https://github.com/SYCC-AI/syc-ai/releases/latest)
[![License: BSL 1.1](https://img.shields.io/badge/license-BSL%201.1-8b7bff.svg)](LICENSE)
[![Main is free until 31 Dec 2026](https://img.shields.io/badge/Main-free%20until%2031%20Dec%202026-34d399.svg)](#editions)
[![Free Professional: about 60 free AI models](https://img.shields.io/badge/Free%20Professional-60%20free%20AI%20models-f5c45a.svg)](https://syc-ai.com/free-professional/)

[English](README.md) · [فارسی](README.fa.md) · **中文** · [Русский](README.ru.md) · [العربية](README.ar.md) · [Español](README.es.md)

</div>

<p align="center"><img src="screenshots/demo.gif" width="860" alt="SYC-AI 导览：登录、专业账户、一个 All in One 对话（Claude 达到用量上限后由 Codex 继续同一条消息）、设置和专业会话"></p>

- **新功能：Free Professional —— 人人免费。** 无需订阅，无需 API 密钥。
  - 一个编程会话里约 60 个免费 AI 模型，每天测试并排名。从最强的开始；某个模型的免费额度用完时，下一个在同样的文件里接着做。
  - 你可以自己挑选任意模型，也可以让 Claude 或 Codex 只写计划、由免费模型完成工作，并实时显示"第 3 步 / 共 8 步"的进度。[了解原理 →](https://syc-ai.com/free-professional/)
- **一个对话，两个引擎。**
  - Claude 负责规划，Codex 负责构建，简短问题交给更轻量的模型；全部在同一个文件夹里，共用一份 `AGENTS.md`。
  - 某个订阅达到上限时，同一条消息会交给你的*另一个*引擎继续，并附上它错过内容的简短交接。
  - 绝不会切换到同一提供商的第二个账户。
- **无需手动配置。**
  - Android 应用和 Windows 应用自带 Claude Code 和 Codex。
  - 设备通过你确认的代码加入你的账户；在手机上会自动完成。
  - 登录 Claude 和 Codex 由你自己在自己的浏览器中完成。
- **看清你的用量。**
  - 每个账户的 5 小时和每周用量。
  - Token 医生。
  - 在你重新打开一个昂贵的“冷”对话之前发出提醒。
  - 全部在本地计算，不询问任何模型。

**获取：** [免费注册](https://app.syc-ai.com/login?lang=zh)（Google、GitHub 或 Gmail）→ Android：[**syc-ai.apk**](https://syc-ai.com/download/syc-ai.apk) · Windows：[**SYC-AI-Setup.exe**](https://syc-ai.com/download/SYC-AI-Setup.exe)

<sub>SYC-AI 是 SYC 的独立产品，与 Anthropic 或 OpenAI 无关联。你按各服务商的条款使用自己的账户。官方、未经修改的命令行工具运行在你的设备上。</sub>

## 功能

<p align="center"><img src="screenshots/all-in-one.png" width="860" alt="SYC-AI All in One：Claude 规划，Codex 构建，一个会话、一份记忆，侧边显示两个账户的用量"></p>

| | 功能 | 对你意味着什么 |
|---|---|---|
| ✨ | **SYC-AI — All in One** | 一个会话同时连接 Claude 和 Codex。每条消息交给最合适的引擎——规划给 Claude，构建给 Codex，简短问题给更轻量的模型——或交给你选的那个。同一个项目文件夹和一份共享记忆（`AGENTS.md`），引擎轮换时不会丢失任何东西。 |
| 🆓 | **Free Professional —— 人人免费** | 约 60 个每天测试并排名的免费 AI 模型，在你自己设备上的同一个编程会话里：最强的先上，免费额度用完就由下一个接手。可自己挑选模型，或让 Claude 或 Codex 只写计划、免费模型逐步完成。无需订阅和 API 密钥；合理使用上限为每天 800 次请求。 |
| 🔁 | **额度用完，工作不停** | 当一个订阅达到用量上限时，同一条消息会按*你的*顺序由下一个引擎继续，并附上简短的交接说明。（SYC-AI 绝不会为绕过限制而跳到同一提供商的第二个账户。） |
| 📊 | **所有用量一目了然** | 每个已连接账户的 5 小时和每周用量及重置时间——读取时不会向模型发送任何内容。 |
| 🩺 | **Token 医生与冷对话提醒** | 检查你在 Claude 和 Codex 中的对话把 token 花在哪里——缓存命中率、缓存已过期的对话、每次提问的固定部分——并给出通俗建议。当你在一小时或更久之后继续一个长对话时，SYC-AI 会提醒你：下一条消息会按全价重新读取整个对话。这些都不询问模型。 |
| 🪙 | **省 token，默认开启** | 简短准确的回答，不做无用的读取，使用注明作者的开源技能（Caveman、Superpowers）。 |
| 📱 | **内置 Claude Code 和 Codex 的 Android 应用** | 智能体直接在手机上运行。首次启动时，应用会在私有空间中安装官方、未经修改的命令行工具，并把手机连接到你的账户。可在应用内用 Google 或 GitHub 登录。 |
| 🪟 | **内置 Claude Code 和 Codex 的 Windows 应用** | 一个 Setup.exe，无需管理员权限：Node.js、SYC Node、Claude Code 和 Codex 一次下载。电脑通过你确认的代码加入账户——无需在设备上输入 SYC-AI 密码。 |
| 🔔 | **智能体需要你时提醒你** | 当智能体等待你批准或长任务完成时，手机会提醒你。由你开启；不会自动打开任何东西。 |
| 🧑‍🔧 | **专业会话** | 网站构建器、Bug 修复、代码审查、研究助手、写作与翻译、数据分析、新手教练、游戏制作——一键开始，或下载为 `AGENTS.md` 用于任何终端智能体。 |
| 👥 | **每个提供商两个账户** | 同一设备上的个人和工作 Claude 或 Codex 登录；由你选择每个引擎使用哪一个。 |
| ✅ | **由你决定智能体能做什么** | 只读、在项目中工作或完全访问——按会话设置，用通俗的话说明。 |
| 🛡️ | **开源设备代理** | [SYC Node](node-agent/) 只运行 AI 命令行工具，只访问自己的文件夹，记录每个请求，并可随时暂停。SYC-AI 在你设备上的配置文件带有签名，被改动时会被恢复。 |
| 🔏 | **签名更新，可回滚** | 面板和 SYC Node 只安装 SYC 签名的版本，检查失败时恢复上一版本。 |
| 🌍 | **六种语言** | English、中文、Español、العربية、Русский 和 فارسی——面板、应用和智能体的回答。 |

**目前的引擎：** Claude Code 和 Codex 已经过测试，可在所有会话中使用。Gemini、Cursor 和 Kimi 现在已可在你的设备上登录，它们的聊天面板即将推出。Qwen 即将推出。

## 诚实对比

| | **SYC-AI** | Anthropic Remote Control | Happy | Paseo | CloudCLI |
|---|---|---|---|---|---|
| 智能体 | Claude Code + Codex（Gemini、Cursor、Kimi：可登录，聊天即将推出） | Claude Code | Claude Code、Codex | Claude Code、Codex、Copilot、OpenCode、Pi | Claude Code、Cursor CLI、Codex |
| 两个引擎共享一个对话和同一份记忆 | **是**（All in One） | —（单一引擎） | 未宣传 | 未宣传（一个界面，各自独立的智能体） | 未宣传 |
| 订阅达到上限时换另一个引擎继续 | **是**，仅限不同提供商，绝不使用同一提供商的第二个账户 | — | 未宣传 | 未宣传 | 未宣传 |
| 替你安装智能体命令行工具 | **是**（内置于 Android 和 Windows 应用） | 需自行安装 Claude Code | 需自行安装 CLI，再 `npm i -g happy` | CLI 是前提条件 | 使用你现有的 CLI 会话 |
| 手机 | Android 应用（APK），在手机上运行 Claude Code + Codex。暂无 iOS | Claude 应用，iOS + Android | iOS、Android、网页 | iOS、Android | 浏览器 |
| 智能体需要你时提醒 | 是（需开启） | 是（推送） | 是（推送） | README 未说明 | README 未说明 |
| 对话经过哪里 | syc-ai.com（保存在会话历史中；非端到端加密） | Anthropic | 端到端加密中继 | 你的守护进程；可选 E2E 中继 | 你的机器（或其 Cloud） |
| 需要账户 | 是（Google、GitHub 或 Gmail） | Claude 订阅 | — | 不强制登录 | 否（自托管） |
| 许可 | BSL 1.1（源代码可用；仓库中有 SYC Node 源码） | 专有 | MIT | Apache-2.0 | AGPL-3.0 |
| 价格 | Main 在 2026 年 12 月 31 日前免费，之后每月 1.75 美元 | 包含在 Claude 套餐中 | 免费 | 免费 | 自托管免费；Cloud 每月 7 欧元起 |

<sub>“未宣传”指该项目的 README（2026-09-25 读取）没有提到，并不表示无法实现。欢迎在 [Issues](https://github.com/SYCC-AI/syc-ai/issues) 中指正。</sub>

## 开始使用

1. 在 **[app.syc-ai.com](https://app.syc-ai.com/login?lang=zh)** **注册**，可用 Google、GitHub，或 Gmail 地址加密码。SYC-AI 账户基于 Gmail：使用 GitHub 登录时，你的 GitHub 账户需要有已验证的 Gmail 地址。
2. **获取应用：**

   | | 平台 | 方法 |
   |---|---|---|
   | 📱 | **Android** | **[下载 syc-ai.apk](https://syc-ai.com/download/syc-ai.apk)**（尚未上架 Google Play；确认后 Android 即可安装）。打开并登录。首次启动时会在手机上安装 Claude Code 和 Codex——需要几分钟——并自动把手机连接到你的账户。 |
   | 🪟 | **Windows (x64)** | **[下载 SYC-AI-Setup.exe](https://syc-ai.com/download/SYC-AI-Setup.exe)** 并运行，无需管理员权限。它会显示一个简短代码和一个链接：在任何已登录 SYC-AI 的地方（这台电脑或手机）打开链接，并在 10 分钟内点击 **连接此设备**。 |
   | 🌐 | **网页** | 任意浏览器中的 **[app.syc-ai.com](https://app.syc-ai.com/login?lang=zh)** 显示你的个人资料、套餐和设备状态。连接 Claude 和 Codex 需要 Android 或 Windows 应用。 |

3. **登录 Claude 和 Codex。** 在 **专业账户** 中，点击每个引擎的 **登录**，在你自己的浏览器中登录一次。然后打开 **SYC-AI — All in One** 开始工作。

> Windows Setup.exe 目前还没有代码签名，Windows SmartScreen 可能会要求你确认（**更多信息 → 仍要运行**）。随时可在 **应用和功能** 中卸载。

## 工作原理

- 你的设备主动**向外**连接 syc-ai.com。设备上不开放任何端口，也不需要服务器（[阅读代理代码](node-agent/syc-node.mjs)）。
- 面板让 SYC Node 启动你设备上安装的 AI 命令行工具。该工具用你自己的账户直接与 Anthropic 或 OpenAI 通信。
- 你的消息和智能体的回复会经过面板并保存在会话历史中，方便你在其他设备上继续。它们不是端到端加密的。

## 你的数据在哪里

| 留在你的设备上 | 保存在 syc-ai.com | 由你掌控 |
|---|---|---|
| 你的 Claude 和 OpenAI 登录信息（由命令行工具保存） | 你的 SYC-AI 账户（邮箱、用户名、密码哈希） | 暂停 SYC Node——在你恢复之前，面板无法使用该设备 |
| 你的文件和项目 | 你的会话历史，方便随处继续 | 活动日志——面板对你设备发出的每个请求 |
| 智能体执行的命令 | 设备名称、提醒、工单 | 随时卸载 · 在个人资料中下载你的数据 |

完整说明：[隐私声明](https://syc-ai.com/privacy) · [条款](https://syc-ai.com/terms)。

## SYC Node——你设备上的代理

SYC Node 是一个无依赖的单文件（[`node-agent/syc-node.mjs`](node-agent/syc-node.mjs)），包含在 Android 和 Windows 应用中。它：

- **只运行** AI 命令行工具（`claude`、`codex`、`gemini`、`cursor-agent`、`kimi`、`qwen`）、把这些包用 npm 安装到 `~/.syc-node/npm`，以及官方 Cursor 安装程序；**拒绝任何其他程序**；
- **只在 `~/.syc-node` 内读写**；其外的路径一律拒绝；
- **丢弃任何**可能把命令行工具重定向到其他服务器或预加载代码的环境变量；
- **校验签名**：它写入的每个 SYC-AI 配置文件都要验签，被改动的文件会被恢复；
- **记录每个请求**到 `~/.syc-node/activity.log`；
- **只用** SYC 发布密钥签名的版本更新自己。

## 六种语言

面板、应用和智能体的回答支持 **English、中文、Español、العربية、Русский 和 فارسی**。应用跟随你手机或 Windows 的语言设置。

<a id="editions"></a>

## 版本

| 版本 | 状态 |
|---|---|
| **SYC-AI (Main)** | 现已可用——**2026 年 12 月 31 日前免费**，之后每月 1.75 美元 |
| Plus · Pro · Immortal Edition | 即将推出（每月 4、15 和 90 美元）。选择前会显示价格；付款尚未开放。 |

## 即将推出

在 SYC-AI 中与 Gemini、Cursor、Kimi 和 Qwen 聊天 · 官方登录的连接器（GitHub、Google Drive、Gmail、Notion、Telegram、Figma）· 个人图像工作室 · 短视频工作室 · 一键建站和开店 · 文档与翻译 · 学生研究台 · 游戏制作工坊 · 理财与金融智能体 · 智能 Telegram 机器人（仅限主动订阅的受众）· 团队和公司面板 · 手机上的日常助手。

## 常见问题

**免费吗？** SYC-AI (Main) 在 2026 年 12 月 31 日前免费，之后每月 1.75 美元。付费版本稍后推出，选择前会显示价格；付款尚未开放。

**需要服务器吗？** 不需要。你的 Android 手机或 Windows 电脑就够了。

**需要先安装 Claude Code 或 Codex 吗？** 不需要。两者都内置在 Android 应用和 Windows 应用中。你只需在面板中登录一次自己的 Claude 和 ChatGPT 账户。

**在浏览器里能做什么？** 网页面板显示你的个人资料、套餐与升级，以及设备状态。使用 Claude 和 Codex 需要 Android 或 Windows 应用，因为智能体运行在你的设备上。

**我的代码会发送给你们吗？** 文件留在你的设备上。对话——你的消息和可能引用部分文件的回答——会经过 syc-ai.com 并保存在会话历史中。

**SYC Node 能在我的设备上做什么？** 只能启动 AI 命令行工具、用 npm 安装这些工具，以及在 `~/.syc-node` 内读写。其他一切都会被拒绝并记录。你可以随时暂停或移除它。[阅读代码](node-agent/syc-node.mjs)。

**SYC-AI 会绕过我订阅的用量限制吗？** 不会。每个引擎都在你自己的账户和它自己的限制下运行。当一个订阅达到上限时，SYC-AI 可以用你同样付费的*另一个*引擎继续同一项工作（例如 Claude 之后用 Codex）。它绝不会在同一提供商的多个账户之间轮换来绕过限制。

**有 iPhone、Mac 或 Linux 版吗？** 没有。SYC-AI 运行在 Android 和 Windows 上。在其他设备上，网页面板可显示你的个人资料、套餐和设备。

**与 Anthropic、OpenAI 或 Google 有关联吗？** 没有。SYC-AI 是独立产品，你按各服务商的条款使用自己的账户。Claude、Codex、Gemini、Cursor、Kimi 和 Qwen 是其各自所有者的商标。

## 自行托管

希望在自己的服务器上运行整个面板的组织，可以发邮件到 syc@syc-ai.com 申请自托管版本。

## 安全

发布版本和 SYC Node 更新都使用 Ed25519 签名；面板在写入任何字节之前会校验大小和 SHA-256，以事务方式应用更新，失败时回滚。会话使用安全 Cookie 和 CSRF 防护；密码使用 scrypt 哈希；设备令牌只以哈希形式保存。私下报告漏洞：[SECURITY.md](SECURITY.md)。

## 社区

问题和想法请到 [Discussions](https://github.com/SYCC-AI/syc-ai/discussions)，错误请提交 [Issues](https://github.com/SYCC-AI/syc-ai/issues)，邮箱 syc@syc-ai.com。

如果 SYC-AI 让你的工作更轻松，点个 ⭐ 能帮助更多人发现它。

## 致谢

SYC-AI 的省 token 功能建立在开源成果之上，产品中凡用到之处都会注明：Julius Brussee 的 [Caveman](https://github.com/JuliusBrussee/caveman) 技能（仅技能部分，MIT）和 Jesse Vincent 的 [Superpowers](https://github.com/obra/superpowers) 技能（MIT）。它们的许可证随技能一起放在 [`skills/`](skills/) 中。

## 许可

源代码可用（source-available），采用 [Business Source License 1.1](LICENSE)。`SYC` 和 `SYC-AI` 是 SYC 的商标。SYC-AI 与 Anthropic、OpenAI、Google、Cursor、Moonshot AI 或阿里巴巴无关联。
