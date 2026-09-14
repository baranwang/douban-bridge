# Douban addon for Stremio

为 Stremio 提供豆瓣电影/剧集目录的插件，并附带 Rex Widget（云端列表优先，本地基础模式回退）。

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/baranwang/douban-bridge)

## ✨ 功能特性

- 📽️ **丰富的电影目录** - 豆瓣热门、Top250、一周口碑榜、影院热映等
- 📺 **全面的剧集覆盖** - 热门剧集、综艺节目、动画、华语/全球口碑榜
- 🎭 **多类型片单** - 覆盖剧情、喜剧、动作、科幻、悬疑、恐怖等 20+ 类型
- 🌍 **多地区剧集** - 大陆、美剧、英剧、日剧、韩剧、港剧、台剧等
- ⚙️ **可配置目录** - 自定义选择要显示的目录内容
- 🔗 **ID 映射** - 自动将豆瓣 ID 映射到 TMDB/IMDB/Trakt ID
- 🔑 **网页密钥** - 登录并 Star 后可生成 `sk`，供 Rex Widget 读取云端完整列表与详情

## 📋 支持的目录

<details>
<summary><strong>🎬 电影目录</strong></summary>

| 目录名称 | 描述 |
|---------|------|
| 豆瓣热门电影 | 热门电影榜单 |
| 一周口碑电影榜 | 近一周口碑最佳电影 |
| 实时热门电影 | 实时热度排行 |
| 豆瓣电影 Top250 | 经典高分电影 |
| 影院热映 | 正在上映的电影 |
| 类型片榜 | 剧情、喜剧、爱情、动作、科幻、动画、悬疑、犯罪、惊悚、冒险、家庭、儿童、历史、音乐、奇幻、恐怖、战争、传记、歌舞、武侠、情色、灾难、西部、古装、运动、短片 |

</details>

<details>
<summary><strong>📺 剧集目录</strong></summary>

| 目录名称 | 描述 |
|---------|------|
| 近期热门剧集 | 近期热播剧集 |
| 近期热门综艺节目 | 热门综艺 |
| 近期热门动画 | 热门动画作品 |
| 实时热门电视 | 实时热度排行 |
| 华语口碑剧集榜 | 华语剧集口碑榜 |
| 全球口碑剧集榜 | 全球剧集口碑榜 |
| 国内/国外口碑综艺榜 | 综艺口碑榜 |
| 地区剧榜 | 大陆、美剧、英剧、日剧、韩剧、港剧、台剧、泰剧、欧洲剧 |

</details>

## 🚀 快速开始

### Stremio 安装

直接在 Stremio 中添加：

```
https://stremio-addon-douban.baran.wang/manifest.json
```

已安装用户无需更换地址。自定义目录：

```
https://stremio-addon-douban.baran.wang/configure
```

同一配置页也在网页后台提供：

```
https://douban-bridge.baran.wang/configure
```

安装链接始终指向 `stremio-addon-douban.baran.wang`。登录并 Star 仓库后，可在配置页生成 / 替换 / 撤销 API 密钥（`sk_` 前缀）。密钥只显示一次，不要写进目录 URL。

### Rex Widget

1. 在配置页生成 `sk`。
2. 在 Rex 导入 Widget 脚本（发布到 npm 后）：

```
https://unpkg.com/@douban-bridge/rex-widget
```

3. 在模块参数 **密钥**（`sk`）中粘贴该值。Widget 把它记在 `douban.bridge.sk`。清空 `sk` 后回到本地基础列表；详情链接不携带密钥。

尚未 `changeset publish` 时上述 URL 为 404，这是预期。不要把本地 `apps/rex-widget/dist/` 当成已分发。

Widget 发版与 [rex-widget](https://github.com/baranwang/rex-widget) 相同：根目录 `pnpm changeset`，合并进 `main` 后由 [Release workflow](.github/workflows/release.yml) 开版本 PR 或发布到 npm。根目录 `pnpm deploy` 只部署 core Worker，不会发 Widget。

### 自行部署

#### 环境要求

- Node.js 24+
- pnpm
- Cloudflare 账户

#### 1. 克隆项目

```bash
git clone https://github.com/baranwang/douban-bridge.git
cd douban-bridge
pnpm install
```

#### 2. 开发命令

```bash
pnpm test
pnpm build
```

本地两个预览（需先 `pnpm build`；core 使用构建产物）：

```bash
pnpm --filter @douban-bridge/core preview    # http://localhost:8787  网页 + /v1
pnpm --filter @douban-bridge/stremio preview # http://localhost:8788
node scripts/smoke.mjs
```

`pnpm dev` 只启动 core 的 Vite 开发服务。生产切换、迁移和回滚见 [docs/deployment/douban-bridge.md](docs/deployment/douban-bridge.md)。根目录 `pnpm deploy` 不会一次发布全部服务，也不会应用远端数据库迁移。

## 🛠️ 技术栈

- **运行时**: [Cloudflare Workers](https://workers.cloudflare.com/)
- **框架**: [Hono](https://hono.dev/)
- **前端**: React + [shadcn/ui](https://ui.shadcn.com/) + TailwindCSS
- **数据库**: Cloudflare D1 + [Drizzle ORM](https://orm.drizzle.team/)
- **缓存**: Cloudflare KV
- **构建**: [Vite](https://vitejs.dev/)
- **语言**: TypeScript

## 📁 项目结构

```
apps/core/        # Worker douban-bridge-core：网页、/v1、后台、数据与定时任务
apps/stremio/     # Stremio 安装与协议
apps/rex-widget/  # Rex 静态脚本
packages/contracts/
```

## 🔗 相关链接

- [Stremio 官网](https://www.stremio.com/)
- [Stremio Addon SDK](https://github.com/Stremio/stremio-addon-sdk)
- [豆瓣](https://www.douban.com/)

## ❤️ 支持

如果这个项目对你有帮助，欢迎 [Star](https://github.com/baranwang/douban-bridge) 支持！

也可以通过 [爱发电](https://afdian.com/a/baran) 进行捐赠。

## 📄 License

MIT
