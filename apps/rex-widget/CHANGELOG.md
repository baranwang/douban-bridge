# @rexnow/douban

## 0.3.1

### Patch Changes

- 5d20f41: 「最新年度」直接映射到最新年份的子榜，不再重复一份 category tabs。
- 201e329: catalog 直接返回 Rex VideoItem：去掉 description，类型走 genres，basic 有 TMDB 匹配时使用 tmdb id。

## 0.3.0

### Minor Changes

- 9fa92d6: 年度电影/剧集榜补上豆瓣分类子榜，并把 TMDB original 图片前缀剥掉交给 Rex 内部图片策略。

## 0.2.1

### Patch Changes

- 21b822f: 使用 `@rexnow/libs-fetch` 请求云端和豆瓣接口，兼容没有全局 `URL` 的 JavaScriptCore，并更新密钥入口提示。

## 0.2.0

### Minor Changes

- 5efec12: Add localized Widget metadata and the Douban Bridge icon.

## 0.1.0

### Minor Changes

- 89494c0: Align Rex catalog loading with generated parameter types, nested subcollections, native media IDs, and request-scoped credentials.

## 0.0.1

### Patch Changes

- 93565b3: Publish the Rex Widget to npm with the same Changesets workflow as baranwang/rex-widget.
