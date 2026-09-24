# 个人主页（Personal Site）

一个用于展示个人品牌、作品、经历与联系方式的个人主页项目。

> **在线地址：https://chencu-vinegar.github.io/** （GitHub Pages 静态托管，推送即自动发布）
>
> 当前已进入**迭代完善阶段**：单页主页、数字分身（DeepSeek）、意见反馈（Supabase）均已落地，版式为高对比色块风格。本仓库内的 `docs/` 目录是「单一事实来源（Single Source of Truth）」，记录需求、设计规范与进度。
> **新对话框/新会话请先阅读 [`docs/00-项目交接与进度.md`](docs/00-项目交接与进度.md)** —— 它记录了当前决策、进度与下一步，便于无缝接管。

## 项目定位

- 一句话描述：**让访客在 30 秒内了解「我是谁、我做过什么、怎么联系我」的线上门面。**
- 核心用途：个人品牌展示 / 求职与作品集 / 社交名片 / 项目经历沉淀。

## 文档索引

| 文档 | 内容 | 阶段 |
| --- | --- | --- |
| [docs/00-项目交接与进度.md](docs/00-项目交接与进度.md) | 当前决策、进度状态、文件结构、下一步（**新对话首读**） | 交接 |
| [docs/01-需求说明.md](docs/01-需求说明.md) | 项目目标、目标受众、核心功能、非功能需求、范围界定 | 需求 |
| [docs/02-页面结构与信息架构.md](docs/02-页面结构与信息架构.md) | 页面清单、导航结构、各模块线框描述、交互说明 | 结构 |
| [docs/03-设计规范.md](docs/03-设计规范.md) | 设计风格、色彩、字体、布局、间距、图标、动效、响应式原则 | 设计 |
| [docs/04-内容清单.md](docs/04-内容清单.md) | 需要你准备的个人素材清单（文本、图片、链接、联系方式） | 内容 |
| [docs/05-技术方案.md](docs/05-技术方案.md) | 技术选型、目录结构、构建与部署、性能与 SEO | 技术 |
| [docs/06-开发计划与验收标准.md](docs/06-开发计划与验收标准.md) | 里程碑、任务分解、每个阶段的验收标准 | 执行 |
| [docs/07-新会话启动提示词.md](docs/07-新会话启动提示词.md) | **换新对话时可直接复制粘贴的提示词**（接手 / 补内容 / 改版式 / 反馈通知 / 线上分身 / 故障排查） | 交接 |

## 目录结构（当前）

```text
个人主页/
├── README.md                     # 本文件：项目总览 + 文档索引
├── server.py                     # 零依赖本地服务：静态托管 + /api/chat（DeepSeek）+ /api/feedback（Supabase）
├── .env.example                  # 环境变量示例（复制为 .env 并填密钥）
├── sql/
│   └── feedback.sql              # 意见反馈建表 SQL（在 Supabase SQL Editor 执行一次）
├── supabase/                     # 线上后端（Edge Functions，随仓库发布；不含密钥）
│   ├── config.toml               # CLI 配置：project_id + 关闭 JWT 强校验
│   └── functions/chat/index.ts   # 数字分身函数：Supabase Secrets → DeepSeek → {reply}
├── tools/
│   ├── deploy-chat-function.ps1  # 一键发布分身函数（自动下载 CLI + 写 Secrets + deploy）
│   └── bin/                      # CLI 二进制（已忽略，不入库）
├── docs/                         # 项目文档（需求 / 结构 / 设计 / 内容 / 技术 / 计划）
│   ├── 00-项目交接与进度.md
│   ├── 01-需求说明.md
│   ├── 02-页面结构与信息架构.md
│   ├── 03-设计规范.md
│   ├── 04-内容清单.md
│   ├── 05-技术方案.md
│   ├── 06-开发计划与验收标准.md
│   └── 07-新会话启动提示词.md     # 换新对话时可直接复制的提示词
├── index.html                    # 单页主页（已录入真实信息，含数字分身）
├── styles/
│   └── main.css                  # 全局样式（高对比色块版式 + CSS 变量主题 + 数字分身 UI）
├── scripts/
│   ├── config.js                 # 公开运行配置（Supabase 地址 + publishable 公钥），须先于 main.js 加载
│   └── main.js                   # 交互脚本（主题切换/菜单/平滑滚动/意见反馈提交/分身 AI 调用与回退）
└── assets/images/                # 图片素材（avatar.jpg 已接入）
```

> **不纳入仓库**（已在 `.gitignore`）：`.env`（密钥）、`.opencode/` 与 `opencode.jsonc`（AI 开发工具自身配置，与主页无关）、`.deepworks/`（会话临时文件）、`uploads/`（临时素材）、`supabase/.temp/` 与 `tools/bin/`（CLI 缓存与二进制）。
>
> `supabase/` 与 `tools/` 里的源码**要入库**（线上后端源码），密钥不在其中 —— 它们只存在于 Supabase Secrets。

## 部署（GitHub Pages）

本站以 **GitHub 用户名站点**方式发布：仓库名 = `<用户名>.github.io`，站点即根路径。

| 项 | 值 |
| --- | --- |
| 仓库 | `Chencu-vinegar.github.io`（Public） |
| 发布源 | `master` 分支 `/ (root)` |
| 在线地址 | https://chencu-vinegar.github.io/ |
| 更新方式 | `git push` 后自动重新发布（约 1–2 分钟） |

静态托管下的功能差异：**意见反馈照常可用**（浏览器直连 Supabase）；**数字分身靠 Supabase Edge Function 承载密钥**（部署一次即可，见下方「数字分身」与 `docs/05-技术方案.md` §4.2）。**函数未部署时不会报错**，会自动回退演示回复。详见 `docs/05-技术方案.md` §4.1。

## 使用方式

1. **本地看效果**：直接用浏览器打开 `index.html`，或按下方说明启动本地服务。
2. **改内容**：编辑 `index.html`（文案与结构都在这一处）；改配色/字号则改 `styles/main.css` 顶部的设计 Token。
3. **补充素材**：按 `docs/04-内容清单.md` 提供更多经历与作品，再扩展对应区块。
4. **发布更新**：`git push` 即可，GitHub Pages 会自动重新发布。

## 本地预览

```powershell
# 方式一：直接用浏览器打开 index.html（反馈直连 Supabase；分身无本地后端时会自动试线上函数）
start index.html

# 方式二（推荐）：启动带数字分身后端的本地服务
py server.py
# 然后浏览器访问 http://localhost:8000
```

## 数字分身（AI 接入）

页面中的「我的数字分身」支持接入 **DeepSeek** 大模型。**密钥永远只在服务端**，前端 `scripts/config.js` 里只有接口地址：

| 运行环境 | 分身走哪条路 | 密钥存放位置 |
| --- | --- | --- |
| 本地 `http://localhost:8000` | 同源 `POST /api/chat`（`server.py`） | 本机 `.env`（已忽略，不入库） |
| 线上 GitHub Pages | `POST <chatUrl>`（**Supabase Edge Function**） | **Supabase Secrets** |

任何一条路失败都会自动再试另一条，全部失败才回退**本地关键词演示回复**（页面绝不报错，状态显示「● 演示模式」）。

**本地启用真实 AI**：

1. 复制 `.env.example` 为 `.env`
2. 填入 `DEEPSEEK_API_KEY`（在 https://platform.deepseek.com/ 获取）
3. 运行 `py server.py`，访问 `http://localhost:8000` → 状态应显示「● AI 在线」，随便问一句应得到真实回答

> ⚠️ **密钥要确认有效**：若状态是「● 演示模式」或回答永远是固定的演示文案，多半是密钥无效/已撤销。
> 项目里 2026-09-24 时用的那把密钥就是失效状态（DeepSeek 返回 `401 Authentication Fails`），
> 请到 https://platform.deepseek.com/ 重新生成一把，本地 `.env` 与 Supabase Secrets 用同一把即可。

**线上启用真实 AI（一次性部署，约 2 分钟）**：

```powershell
# 生成访问令牌：https://supabase.com/dashboard/account/tokens
$env:SUPABASE_ACCESS_TOKEN = "sbp_xxxxxxxx"
powershell -ExecutionPolicy Bypass -File tools\deploy-chat-function.ps1
```

- 也可以完全在网页上做：Supabase 控制台 → Edge Functions → 新建名为 `chat` 的函数 → 粘贴 `supabase/functions/chat/index.ts` → 关闭 JWT 强校验 → 在 Secrets 里加 `DEEPSEEK_API_KEY`。完整步骤见 `docs/05-技术方案.md` §4.2。
- 想退回演示模式：把 `scripts/config.js` 的 `chatUrl` 置为空字符串并 push。

> 分身的人格与知识来源定义在 `server.py` 与 `supabase/functions/chat/index.ts` 顶部的 `SYSTEM_PROMPT`，**改一处要同步另一处**（校验：`py .deepworks/tmp/compare_prompts.py`）。
> 人格为「陪聊 + 介绍」双模式：可以闲聊、讲笑话，但介绍本人时只依据公开信息、绝不编造。

## 意见反馈（Supabase）

页面底部「意见反馈」区块用于收集访客建议，数据写入 **Supabase**（PostgreSQL）的 `feedback` 表：

- **流程（双路径，自动选择）**：
  - **线上 / 静态托管**：浏览器 → `POST /rest/v1/feedback`（Supabase REST，配置在 `scripts/config.js`）
  - **本地**：浏览器 → `POST /api/feedback` → Supabase（`server.py` 代理）
- **安全**：数据库开启 RLS，仅放行匿名**插入**，读不到反馈内容。前端用的是 Supabase **publishable / anon 公钥**（该产品本就设计为可公开用于浏览器端）；`service_role` 密钥从未使用。
- **防刷**：隐藏蜜罐字段 + 前后端长度校验（内容 ≤ 2000 字）。
- **查看反馈**：登录 Supabase 控制台 → Table Editor → `feedback` 表（或写 SQL 查询）。

**启用 / 更换 Supabase 项目**：

1. 在 Supabase 控制台新建项目（Region 建议 Singapore / Tokyo，国内访问更快）
2. 打开 SQL Editor，粘贴执行 `sql/feedback.sql`
3. 到 Project Settings → API Keys 复制 **Project URL** 和 **anon / publishable key**
4. 前端配置写入 `scripts/config.js`（线上与本地直连模式都读它）：

```js
window.SITE_CONFIG = {
  supabaseUrl: "https://xxxxxxxx.supabase.co",
  supabaseKey: "sb_publishable_...",
  supabaseTable: "feedback"
};
```

5. 本地后端模式另需写入 `.env`（`SUPABASE_URL` / `SUPABASE_KEY`），重启 `py server.py` 后 `/api/health` 的 `feedbackEnabled` 变为 `true`
6. `git push` 后线上即时生效

> `scripts/config.js` 留空 `supabaseUrl` / `supabaseKey` 时，前端自动回退为调用同源后端。

## 状态

- [x] 需求方向确认（单页滑动 / 极简专业 / 中文 / 纯静态）
- [x] 占位 Demo 页面
- [x] 录入真实个人信息（并保存为 Git 标签 `V1`）
- [x] 数字分身接入框架（DeepSeek 代理 + 前端调用 + 无密钥回退）
- [x] 头像接入（`assets/images/avatar.jpg`，替换该文件即可更换）
- [x] 数字分身配置真实 API Key（DeepSeek，已实测连通）
- [x] 意见反馈接入 Supabase（已实测：提交入库 / 空值与超长拦截 / 蜜罐静默丢弃）
- [x] 版式改版：整页重排为高对比色块版式（保留蓝青主色，素材与文案全部自制）
- [x] 隐私调整：微信卡片标注「非本人手机号」，手机号卡片改为「详谈时提供」
- [x] 反馈表单改造：静态托管下浏览器直连 Supabase（线上可正常收集）
- [x] 部署上线 GitHub Pages → https://chencu-vinegar.github.io/
- [x] 数字分身支持线上真实 AI：改用 Supabase Edge Function 承载密钥（前端三层降级 + 一键发布脚本，本地链路已实测）
- [ ] 在 Supabase 部署 `chat` 函数并配置 `DEEPSEEK_API_KEY` Secret（见 `docs/05-技术方案.md` §4.2）
- [ ] 其余素材补齐（更多经历 / 作品）
