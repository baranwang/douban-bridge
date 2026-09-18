# Agent ID 匹配

小时 cron 的确定性唯一命中吃不掉的豆瓣条目，用 Pi 离线消歧。错海报比漏匹配贵。catalog/meta / `findExternalId()` 不跑模型。

## 决策

- 包：`@earendil-works/pi-agent-core` + `@earendil-works/pi-ai`。禁止 `pi-coding-agent`。
- 只由小时 cron 在自己的确定性尝试之后入队。每小时随机抽 `N=20`。
- 工具：`get_douban_subject`、`search_tmdb`、`find_tmdb_by_imdb`、`get_tmdb_external_ids`、`lift_imdb_series`、`conclude_match`。无封面、无 Trakt 搜索、无任意 URL。
- 模型只能引用本轮工具登记的 `candidateId`。直写走代码 verifier，不要求豆瓣 IMDb 锚。
- `calibrated` 仍是人锁。Agent 永不写 `true`。
- 评过的默认不再进池。`reason` 截断 400 字，同行覆盖。

## 分档

| 条件 | 结果 |
| --- | --- |
| `confidence >= 0.9` 且 verifier 通过 | 写正式 ID，`calibrated=false` |
| `0.6 <= confidence < 0.9`，闭集/类型过 | 只写建议，正式 ID 不动 |
| `< 0.6` / `none` / 不够建议档 | `status=no_match` |

直写 verifier：闭集、类型一致、电影明显翻拍年份冲突否决、两边都有 IMDb 则必须相同否则降建议、标题兼容（规范化后的 title/original_title 有交集）否则降建议。缺年份不单独否决。

基础设施错误（认证/网络/解析）必须抛出并 Queue retry，不得写成 `no_match`。

## 数据

`douban_mapping` 只加一列 `agent` text JSON。正式海报仍是 `tmdb_id` / `imdb_id` / `trakt_id` / `calibrated`。

```ts
{
  token?: string;       // 进行中 claim
  leaseUntil?: number;  // 租约到期后可回收
  status?: "suggested" | "no_match";
  confidence?: number;
  reason?: string;
  candidateId?: string;
  tmdbId?: number | null;
  imdbId?: string | null;
  traktId?: number | null;
}
```

进行中只放 `token` + `leaseUntil`。评完清 token，留下结论。对话和搜索 JSON 不进 D1。

直写条件：未校准、`tmdb_id` 为空、token 对上且租约未过期。`persistIdMapping()` 不覆盖已有 TMDB，不加 `calibrated`。

入池：`tmdb_id` 空、未校准、`agent` 空。先 claim 再 `queue.send`。过期 claim 由下一小时 cron 清 token。

## tidy-up

- 建议：`status=suggested` 且正式 TMDB 空
- Agent 已写未校准：正式 TMDB 有值、未校准、`agent` 非空
- 无匹配：`status=no_match`

确认：采用建议 ID、`calibrated=true`、清空 `agent`。驳回 agent 直写：清空正式三 ID，`status=no_match`。普通保存清空 `agent`。空表单不得写成 `tmdb_id=0`。

## 不做

请求路径跑模型、Agent 写校准、Trakt/封面/通用 IMDb 搜索、重写 `findExternalId()` 策略、Cloudflare Agents SDK。
