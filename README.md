# Douban Bridge

把豆瓣榜单、推荐与搜索带进 Rex 的 Widget，背后是校准过的豆瓣 → TMDB / IMDb / Trakt ID 映射库。

[![npm](https://img.shields.io/npm/v/@rexnow/douban)](https://www.npmjs.com/package/@rexnow/douban)

## 安装到 Rex

打开 **<https://douban-bridge.baran.wang/rex>**，点「在 Rex 中安装」。也可以在 Rex 里手动添加 Widget 地址：

```
https://unpkg.com/@rexnow/douban
```

装上即可使用基础模式。想要完整模式：在同一页面用 GitHub 登录并 Star 本项目，生成密钥，粘贴到 Widget 全局参数 **密钥**（`sk`）。

| | 基础模式 | 完整模式 |
|---|---|---|
| 门槛 | 无需登录 | GitHub 登录 + Star 项目 |
| 请求方式 | Widget 直接请求豆瓣 | 经 Douban Bridge，整页一次返回并缓存 |
| ID 匹配 | 逐条现查 TMDB，慢且可能猜错 | 映射经大模型与人工校准 |
| 图片来源 | 固定豆瓣 | 可选、可排序（在 `/rex` 页面设置） |

清空 `sk` 即回到基础模式。详情链接不携带密钥。

## Widget 内容

- **固定榜单**：豆瓣热门电影、一周口碑电影榜、实时热门电影、豆瓣电影 Top250、影院热映；近期热门剧集 / 美剧 / 韩剧 / 国产剧 / 日剧 / 动画 / 纪录片 / 综艺；实时热门电视；华语 / 全球口碑剧集榜；国内 / 国外口碑综艺榜
- **类型榜**：电影类型榜（剧情、喜剧、动作、科幻、悬疑等 26 类）、剧集类型榜（大陆、美、英、日、韩、港、台、泰、欧洲、动画）
- **年度榜**：豆瓣年度评分最高电影 / 剧集，含分类子榜
- **电影推荐 / 剧集推荐**：按类型、地区、年代、排序筛选，支持自定义标签
- **搜索**

榜单定义见 [`packages/contracts/src/collections.ts`](packages/contracts/src/collections.ts)，Widget 入口见 [`apps/rex-widget/src/index.ts`](apps/rex-widget/src/index.ts)，版本历史见 [CHANGELOG](apps/rex-widget/CHANGELOG.md)。

## Stremio（兼容保留）

原 Stremio 插件仍在运行，已安装的用户无需更换地址，但不再是主推方向：

```
https://stremio-addon-douban.baran.wang/manifest.json
```

配置页：<https://stremio-addon-douban.baran.wang/configure>

## 开发

需要 Node.js 24+、pnpm、Cloudflare 账户。

```bash
git clone https://github.com/baranwang/douban-bridge.git
cd douban-bridge
pnpm install
pnpm test
pnpm build
```

| 包 | 说明 |
|---|---|
| `apps/rex-widget` | Rex Widget，npm 包 `@rexnow/douban`（Rslib + `@rexnow/libs`） |
| `apps/core` | Worker `douban-bridge-core`：网页（`/rex` 等）、`/v1` API、后台、D1 映射库、定时任务与 Agent 匹配队列 |
| `apps/stremio` | Worker `stremio-addon-douban`：Stremio 协议，经 service binding 调用 core |
| `packages/contracts` | 共享榜单定义与 HTTP schema |
| `packages/ui` | 共享 UI 组件 |

技术栈：Cloudflare Workers、Hono、React SSR + Tailwind v4 / shadcn、D1 + Drizzle、KV、Queues、Workers AI Gateway。

本地预览（需先 `pnpm build`）：

```bash
pnpm --filter @douban-bridge/core preview    # http://localhost:8787
pnpm --filter @douban-bridge/stremio preview # http://localhost:8788
node scripts/smoke.mjs
```

### 发布

- **Widget**：根目录 `pnpm changeset` 写变更，合并进 `main` 后由 [Release workflow](.github/workflows/release.yml) 开版本 PR 或发布到 npm。
- **Worker**：根目录 `pnpm deploy` 只部署 core，不发 Widget、不部署 stremio。完整的上线顺序、D1 迁移与回滚见 [docs/deployment/douban-bridge.md](docs/deployment/douban-bridge.md)。

## 支持

觉得有用的话欢迎 [Star](https://github.com/baranwang/douban-bridge)，也可以通过 [爱发电](https://afdian.com/a/baran) 支持。

## License

MIT
