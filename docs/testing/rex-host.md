# Rex 宿主契约验证记录

## 任务状态

**本任务未完成。** 当前环境无 Rex 设备 / 应用，Step 3–5 的 Rex 宿主实验均未执行。下文 Node fixture 验证仅证明本地 HTTP 探针服务可用，**不能**视为 Rex 宿主验证通过。

| 步骤 | 内容 | 状态 |
| --- | --- | --- |
| Step 1 | 建立宿主探针 `tools/rex-probe/probe.js` | 已完成（代码就绪） |
| Step 2 | 建立本地 HTTP fixture `tools/rex-probe/server.mjs` | 已完成（Node 验证见下） |
| Step 3 | Rex 导入脚本、四种类别、列表 / 详情 / TMDB 识别 | **未执行** |
| Step 4 | 重启 Rex、凭证 lifecycle、`globalParams` vs 模块 params | **未执行** |
| Step 5 | 503、断网、`/slow` 失败时间与控制台行为 | **未执行** |
| Step 6 | 保存证据并提交 | 部分完成（本文件 + 探针代码；Rex 证据缺失） |

## 测试环境

| 项 | 值 |
| --- | --- |
| Rex 版本 | **未执行**（无 Rex 设备） |
| 操作系统 | **未执行** |
| 测试日期 | 2026-09-13（Node fixture 本地验证） |
| 测试密钥 | 仅字面量 `probe-a` / `probe-b`（Rex 侧未使用） |
| 探针脚本 | `tools/rex-probe/probe.js` |
| Fixture 服务 | `rtk proxy node tools/rex-probe/server.mjs` → `0.0.0.0:8789` |

## Node fixture 验证（非 Rex）

在 cloud agent 环境对 fixture 做 HTTP 冒烟测试。日志格式为 `{ pathname, count, authenticated }`，其中 `authenticated === (Authorization === "Bearer probe-a")`；**不记录** Authorization  header 值。

| 路径 | HTTP 状态 | 响应要点 | 请求次数（本次冒烟） |
| --- | --- | --- | --- |
| `/probe.js` | 200 | 返回相邻 `probe.js` 源码 | 1 |
| `/item` | 200 | `description: cloud-list-v2`，含 `posterPath` / `link` | 4（含 `probe-a` / `probe-b` 各 1 次） |
| `/meta/1292052` | 200 | `description: cloud-detail-v2` | 2 |
| `/poster.svg` | 200 | SVG 含大字 `CLOUD V2` | 2 |
| `/fail` | 503 | 空 body | 1 |
| `/unknown` | 404 | 未列举路径 | 1 |
| `/slow` | 未测 | 设计为 45s 延迟；Rex Step 5 未执行，fixture 未在本轮等待 | 0 |

认证日志抽样（fixture stdout）：

```json
{"pathname":"/item","count":3,"authenticated":true}
{"pathname":"/item","count":4,"authenticated":false}
```

- `Authorization: Bearer probe-a` → `authenticated: true`
- `Authorization: Bearer probe-b` → `authenticated: false`
- 无 Authorization → `authenticated: false`

## Rex 实验记录（Step 3–5：未执行）

以下实验需在目标 Rex 中导入 fixture 打印的 `http://<本机 IPv4>:8789/probe.js` 后执行。当前 **全部未执行**。

### Step 3：列表、详情、类型与 TMDB 识别

| 实验输入 | 预期观察 | 结果 | 请求次数 | 截图 |
| --- | --- | --- | --- | --- |
| 模块 `a` / `b`，`base` = fixture origin，`sk` = `probe-a`，`kind` = `detail` | 列表标题 / 图、`loadDetail` 调 `/meta/1292052` | **未执行** | — | — |
| 同上，`kind` = `tmdb` | 条目 id 278，媒体识别仍为 TMDB 278 | **未执行** | — | — |
| 同上，`kind` = `imdb` | 条目 id `tt0111161` | **未执行** | — | — |
| 同上，`kind` = `douban` | 条目 id `1292052` | **未执行** | — | — |
| `globalParams.sk` 是否传入两模块 | 若否，模块级同名 `sk` 再测 | **未执行** | — | — |

### Step 4：凭证 lifecycle

| 实验 | 结果 | 请求次数 | 截图 |
| --- | --- | --- | --- |
| 关闭并重启 Rex；从历史详情打开条目 | **未执行** | — | — |
| `sk` 从 `probe-a` 换为 `probe-b` | **未执行** | — | — |
| 清空 `sk` 参数 | **未执行** | — | — |
| 详情 URL 不携带密钥；历史仍调云端 | **未执行** | — | — |
| 切换模块 / 账号 / 封面版本后下一次请求是否真实发生 | **未执行** | — | — |

### Step 5：失败行为

| 实验 | 结果 | 耗时 / 控制台 | 截图 |
| --- | --- | --- | --- |
| `probeList` 请求 `/fail`（503） | **未执行** | — | — |
| `probeList` 请求 `/slow`（45s） | **未执行** | — | — |
| 关闭 fixture 后断网请求 | **未执行** | — | — |

## 最终采用的字段与契约

**待定。** Rex 宿主验证未执行，不能确认以下候选组合是否可用：

- `id` / `type` / `link` 组合（`detail` / `tmdb` / `imdb` / `douban`）
- `loadDetail(link)` + `Widget.storage` 凭证传递
- `Widget.http.get` 与 `Authorization: Bearer <sk>`
- 自定义 `posterPath`（SVG `CLOUD V2`）
- 503 / 超时 / 断网时的宿主行为

后续 Widget 实施应等待 Rex 真机完成 Step 3–5 并更新本文件后再锁定契约。

## Task 9 Rex 复测

**未执行。** 当前环境无 Rex 设备 / 应用。下列实验均未在目标 Rex 中操作；Node 中的 Widget / bundle 测试不能代替 Rex 请求计数或截图。

| 实验 | 状态 | 请求次数 | 截图 |
| --- | --- | --- | --- |
| 两个默认模块 | **未执行** | — | — |
| 一个类别模块 | **未执行** | — | — |
| 两个年度模块 | **未执行** | — | — |
| 第二页 | **未执行** | — | — |
| 有 key 的成功请求没有第二份本地列表 | **未执行** | — | — |
| 空页不回退 | **未执行** | — | — |
| 401 / 断网回退 | **未执行** | — | — |
| 云端、本地都失败显示宿主错误 | **未执行** | — | — |
| 直接详情走云端 | **未执行** | — | — |
| 替换 key / 变更网页图源后下次请求生效 | **未执行** | — | — |

Task 1 Steps 3–6 仍为 **未执行**。宿主字段组合（`id` / `type` / `link`、`Widget.storage`、`cacheDuration: 0`、`Object.assign(globalThis, …)`）仍按规划候选实现，未经 Rex 复测锁定。

## 探针约定（实验输入，非生产协议）

- 测试密钥：仅 `probe-a` / `probe-b`
- 不得添加 `videoUrl` 使实验通过
- `setTimeout` 仅存在于 Node fixture，不在 Rex 脚本中
