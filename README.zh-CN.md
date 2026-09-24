<div align="center">

<img src="public/assets/syc-logo.svg" width="104" alt="SYC-AI">

# SYC-AI

### All You Need With AI — In One.

**关于 AI 的一切，尽在一处。Claude Code 和 Codex 运行在你自己的电脑上——在网页、手机或桌面上启动、查看并批准它们的工作。**

[English](README.md) · [فارسی](README.fa.md) · **中文** · [Русский](README.ru.md) · [العربية](README.ar.md) · [Español](README.es.md)

[![tests](https://github.com/SYCC-AI/syc-ai/actions/workflows/test.yml/badge.svg)](https://github.com/SYCC-AI/syc-ai/actions/workflows/test.yml)
[![release](https://img.shields.io/github/v/release/SYCC-AI/syc-ai?label=release&color=4f8cff)](https://github.com/SYCC-AI/syc-ai/releases/latest)
[![License: BSL 1.1](https://img.shields.io/badge/license-BSL%201.1-8b7bff.svg)](LICENSE)

[**免费开始 →**](https://app.syc-ai.com/login?lang=zh)

</div>

<p align="center"><img src="screenshots/demo.gif" width="860" alt="SYC-AI"></p>

## 为什么选择 SYC-AI

AI 编程智能体很强大，但它们只存在于某台电脑的终端里：你无法用手机开启新会话，不知道它什么时候在等你批准，而且每个工具都有自己的登录和界面。

**SYC-AI 把这一切集中到一处。** 只需连接一次你的电脑，之后就能在任何浏览器、Android 应用或桌面上启动和指挥 Claude Code 与 Codex。智能体需要你批准时，手机会提醒你。你的服务商登录信息和文件都留在你自己的电脑上。

## 功能

按照 AI 编程智能体用户最常提出的需求排序。

| | 功能 | 对你意味着什么 |
|---|---|---|
| 📱 | **在手机上启动和指挥** | 在网页、Android 应用或桌面上开启新的 Claude Code 或 Codex 会话——不只是旁观。 |
| 🔔 | **智能体需要你时手机提醒** | 智能体等待你批准，或长任务完成时，手机会告诉你。由你开启，任何内容都不会自动打开。 |
| 🧩 | **所有 AI 账户集中一处** | Claude 和 Codex 现已完整可用。Gemini、Cursor 和 Kimi 现在可安装到你的设备上，登录功能即将推出。 |
| 💻 | **运行在你自己的电脑上** | AI 命令行工具以你自己的账户安装并登录在你的设备上。登录信息和文件都留在那里。 |
| ✅ | **由你来批准** | 命令和文件更改会等待你的批准。你决定智能体可以独立做多少事。 |
| ⚡ | **无需终端** | 一条命令即可连接电脑，并在缺少时为你安装 Node.js。之后一切都是按钮。 |
| 🔀 | **选择在哪里运行** | 每个会话都在你选择的设备上运行——笔记本、服务器或 Windows 电脑。 |
| 📊 | **每轮用量一目了然** | 查看每个回答的用量，配额不再有意外。 |
| 🛡️ | **开源设备代理** | [SYC Node](node-agent/) 只运行 AI 命令行工具，只访问它自己的文件夹，记录每个请求，并可随时暂停。 |
| 🔏 | **带回滚的签名更新** | 面板和 SYC Node 只安装由 SYC 签名的版本，检查失败时自动恢复到上一版本。 |
| 🌍 | **六种语言** | English、中文、Español、العربية、Русский 和 فارسی——面板、安装程序和智能体的回答。 |
| 💬 | **就在工作处获得帮助** | 工单和公告都在面板内，并与你的账户关联。 |

**即将推出：** Gemini、Cursor 和 Kimi 的登录 · 与智能体连接的通讯渠道（Telegram、WhatsApp、Instagram）· 团队工作区 · 专业版本。

## 开始使用

一个账户，四种方式。在 **[app.syc-ai.com](https://app.syc-ai.com/login?lang=zh)** 使用 Gmail 地址、用户名和密码注册。

| | 平台 | 方法 |
|---|---|---|
| 🌐 | **网页** | 在任意浏览器中打开 **[app.syc-ai.com](https://app.syc-ai.com/login?lang=zh)**。 |
| 📱 | **Android** | **[下载 SYC-AI 应用](https://syc-ai.com/download/syc-ai.apk)**（APK）——手机上的面板，也用于接收手机提醒。 |
| 🐧 | **Linux / macOS** | `curl -fsSL https://syc-ai.com/node/zh/install.sh \| bash` |
| 🪟 | **Windows** | `irm https://syc-ai.com/node/zh/install.ps1 \| iex`——在 Chrome 或 Edge 中选择“安装 SYC-AI”即可把面板作为桌面应用。 |

然后打开 **专业账户**，在 Claude 或 Codex 上点击 **安装**，并在你自己的浏览器中 **登录** 一次即可。

> 这些是中文安装链接：安装程序启动时会询问“English 还是中文？”。缺少 Node.js 时会自动安装；在 Linux 上以 root 运行时会创建独立的 `syc-node` 用户。随时可以用 `syc-node uninstall` 全部移除。

## 工作原理

- 你的电脑主动**向外**连接 syc-ai.com，不在你的机器上开放任何端口，也不需要服务器。
- 面板让 SYC Node 启动你已安装的 AI 命令行工具。该工具用你自己的账户直接与 Anthropic 或 OpenAI 通信。
- 你的消息和智能体的回答会经过面板，并保存在你的会话历史中，以便在其他设备上继续。

## 你的数据在哪里

| 留在你的电脑上 | 保存在 syc-ai.com | 由你掌控 |
|---|---|---|
| 你的 Claude 和 OpenAI 登录（由命令行工具保存） | 你的 SYC-AI 账户（邮箱、用户名、密码哈希） | `syc-node pause`——恢复前面板无法使用该设备 |
| 你的文件和项目 | 会话历史，方便随处继续 | `syc-node log`——面板向设备发出的每个请求 |
| 智能体执行的命令 | 设备名称、提醒、工单 | `syc-node uninstall` · 在个人资料中下载你的数据 |

详情：[隐私声明](https://syc-ai.com/privacy) · [使用条款](https://syc-ai.com/terms)。

## SYC Node——你设备上的代理

SYC Node 是一个无依赖的单文件（[`node-agent/syc-node.mjs`](node-agent/syc-node.mjs)）：**只**运行 AI 命令行工具（`claude`、`codex`、`gemini`、`cursor-agent`、`kimi`、`qwen`）、用 npm 安装这些工具以及官方 Cursor 安装程序，**拒绝任何其他程序**；**只**在 `~/.syc-node` 内读写；移除任何可能把工具重定向到其他服务器或预加载代码的环境变量；在 `~/.syc-node/activity.log` 中**记录每个请求**；并且**只**用 SYC 发布密钥签名的版本更新自己。

## 版本

| 版本 | 状态 |
|---|---|
| **SYC-AI (Main)** | 现已可用——**发布期间免费** |
| Plus · Pro · Immortal Edition | 即将推出。选择前会显示价格；付款尚未开放。 |

## 常见问题

**免费吗？** SYC-AI (Main) 在发布期间免费。付费版本稍后推出，选择前会显示价格。

**需要服务器吗？** 不需要。你自己的笔记本或电脑就够了，服务器也可以。

**我的代码会发送给你们吗？** 文件留在你的电脑上。对话——你的消息和可能引用部分文件的回答——会经过 syc-ai.com 并保存在会话历史中。

**与 Anthropic、OpenAI 或 Google 有关联吗？** 没有。SYC-AI 是独立产品，你按各服务商的条款使用自己的账户。

## 自行托管

自托管版本会把整个面板安装到你自己的 Linux 服务器上——命令和要求见[英文 README](README.md#self-host)。

## 社区

问题和想法请到 [Discussions](https://github.com/SYCC-AI/syc-ai/discussions)，错误请提交 [Issues](https://github.com/SYCC-AI/syc-ai/issues)，邮箱 syc@syc-ai.com。

如果 SYC-AI 让你的工作更轻松，点个 ⭐ 能帮助更多人发现它。

## 许可

源代码可用（source-available），采用 [Business Source License 1.1](LICENSE)。`SYC` 和 `SYC-AI` 是 SYC 的商标。
