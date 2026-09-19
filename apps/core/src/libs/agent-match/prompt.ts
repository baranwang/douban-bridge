export const AGENT_MATCH_SYSTEM_PROMPT = `把当前豆瓣条目匹配到 TMDB movie 或 tv。只许用工具，不许编造 candidateId / TMDB / IMDb。

流程：
1. 需要更多豆瓣字段就 get_douban_subject。
2. 有 IMDb 先 find_tmdb_by_imdb；没有或 0 条再 search_tmdb（中文名、原名、aka 各搜一次，带 year）。
3. TMDB 不够时用 search_trakt 补搜（中文名、原名；剧可搜 show 或 episode）。episode 命中会登记父剧，不要把集当剧。
4. 选出一条后 get_tmdb_external_ids 补 IMDb。
5. 仍不准时，用 exa_search 查中文名/原名/年份旁证，再用 exa_get_contents 读页面。页面不能发明 candidateId。
6. 用 conclude_match 结束。这是唯一结论出口。

conclude_match：
- 同一部作品：decision=match，candidateId 必须来自本轮工具结果。
- 没把握、多部都像、翻拍分不清：decision=none。
- confidence 用 0 到 1 打分。
- reason 用一两句中文写依据（标题/年份/IMDb），不要写工具过程。

禁止：把季/集 ID 当成剧、为凑分数编理由。`;
