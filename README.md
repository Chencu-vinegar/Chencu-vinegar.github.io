# 个人主页（Personal Site）

一个用于展示个人品牌、作品、经历与联系方式的个人主页项目。

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

## 目录结构（当前）

```text
个人主页/
├── README.md                     # 本文件：项目总览 + 文档索引
├── server.py                     # 零依赖本地服务：静态托管 + /api/chat（DeepSeek）+ /api/feedback（Supabase）
├── .env.example                  # 环境变量示例（复制为 .env 并填密钥）
├── sql/
│   └── feedback.sql              # 意见反馈建表 SQL（在 Supabase SQL Editor 执行一次）
├── docs/                         # 项目文档（需求 / 结构 / 设计 / 内容 / 技术 / 计划）
│   ├── 00-项目交接与进度.md
│   ├── 01-需求说明.md
│   ├── 02-页面结构与信息架构.md
│   ├── 03-设计规范.md
│   ├── 04-内容清单.md
│   ├── 05-技术方案.md
│   └── 06-开发计划与验收标准.md
├── index.html                    # 单页主页（已录入真实信息，含数字分身）
├── styles/
│   └── main.css                  # 全局样式（高对比色块版式 + CSS 变量主题 + 数字分身 UI）
├── scripts/
│   └── main.js                   # 交互脚本（主题切换/菜单/平滑滚动/意见反馈提交/分身 AI 调用与回退）
└── assets/images/                # 图片素材（avatar.jpg 已接入）
```

## 使用方式

1. **预览**：直接用浏览器打开 `index.html`，或本地起一个静态服务（见下）。
2. **确认方向**：阅读 `docs/01` 到 `docs/06`，对其中标注「待确认 / 建议 / 可选」的决策点给出你的选择。
3. **补充素材**：按 `docs/04-内容清单.md` 提供真实内容与图片，替换 `index.html` 中的占位内容。
4. **进入开发**：确认 `docs/05` 技术选型与 `docs/06` 计划后，开始实现。

## 本地预览

```powershell
# 方式一：直接用浏览器打开 index.html（数字分身走本地演示回复）
start index.html

# 方式二（推荐）：启动带数字分身后端的本地服务
py server.py
# 然后浏览器访问 http://localhost:8000
```

## 数字分身（AI 接入）

页面中的「我的数字分身」支持接入 **DeepSeek** 大模型：

- **未配置密钥时**：自动使用本地关键词回复（演示模式），页面照常可用。
- **启用真实 AI**：
  1. 复制 `.env.example` 为 `.env`
  2. 在其中填入 `DEEPSEEK_API_KEY`（在 https://platform.deepseek.com/ 获取）
  3. 运行 `py server.py`，访问 `http://localhost:8000`

> 密钥只保存在服务端 `.env`（已被 `.gitignore` 忽略），前端只调用同源的 `/api/chat`，不会暴露密钥。
> 分身的人格与知识来源定义在 `server.py` 顶部的 `SYSTEM_PROMPT`，可按需修改。

## 意见反馈（Supabase）

页面底部「意见反馈」区块用于收集访客建议，数据写入 **Supabase**（PostgreSQL）的 `feedback` 表：

- **流程**：表单 → 同源 `POST /api/feedback` → Supabase REST 接口。
- **安全**：密钥只存服务端 `.env`；数据库开启 RLS，仅放行匿名**插入**，即使密钥泄露也读不到反馈内容。
- **防刷**：隐藏蜜罐字段 + 服务端长度校验（内容 ≤ 2000 字）。
- **查看反馈**：登录 Supabase 控制台 → Table Editor → `feedback` 表（或写 SQL 查询）。

**启用步骤**：

1. 在 Supabase 控制台新建项目（Region 建议 Singapore / Tokyo，国内访问更快）
2. 打开 SQL Editor，粘贴执行 `sql/feedback.sql`
3. 到 Project Settings → API Keys 复制 **Project URL** 和 **anon / publishable key**
4. 填入本地 `.env`：

```ini
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_KEY=eyJhbGciOi...
```

5. 重启服务 `py server.py`，`/api/health` 里的 `feedbackEnabled` 变为 `true` 即生效

> 未配置时页面照常浏览，提交时会提示「反馈功能尚未接通」。

## 状态

- [x] 需求方向确认（单页滑动 / 极简专业 / 中文 / 纯静态）
- [x] 占位 Demo 页面
- [x] 录入真实个人信息（并保存为 Git 标签 `V1`）
- [x] 数字分身接入框架（DeepSeek 代理 + 前端调用 + 无密钥回退）
- [x] 头像接入（`assets/images/avatar.jpg`，替换该文件即可更换）
- [x] 数字分身配置真实 API Key（DeepSeek，已实测连通）
- [x] 意见反馈接入 Supabase（已实测：提交入库 / 空值与超长拦截 / 蜜罐静默丢弃）
- [x] 版式改版：整页重排为高对比色块版式（保留蓝青主色，素材与文案全部自制）
- [ ] 其余素材补齐（更多经历 / 作品）
- [ ] 技术选型确定（纯静态已定，待具体部署平台）
- [ ] 部署上线
