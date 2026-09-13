import type { ManifestCatalog } from "@stremio-addon/sdk";
import { maxBy } from "es-toolkit";

//#region 类型定义

export type IdName = Pick<ManifestCatalog, "id" | "name">;

export type YearlyRankingItem = IdName & { year: number };

export type CollectionConfig = ManifestCatalog & {
  hasGenre?: boolean;
  isDefault?: boolean;
};

//#endregion

//#region 年度榜单

export const MOVIE_YEARLY_RANKING_ID = "__movie_yearly_ranking__";
export const TV_YEARLY_RANKING_ID = "__tv_yearly_ranking__";

const createYearlyRanking = (
  items: { id: string; year: number }[],
  nameTemplate: (year: number) => string,
): YearlyRankingItem[] => items.map((item) => ({ ...item, name: nameTemplate(item.year) }));

const MOVIE_YEARLY_RANKING = createYearlyRanking(
  [
    { id: "ECE472UNY", year: 2025 },
    { id: "ECBE7RX5A", year: 2024 },
    { id: "ECQ46F7XI", year: 2023 },
    { id: "ECKA55LSA", year: 2022 },
    { id: "ECWY6B2GQ", year: 2021 },
    { id: "EC2A5MRIY", year: 2020 },
    { id: "ECFYHQBWQ", year: 2019 },
    { id: "2018_movie_1", year: 2018 },
    { id: "2017_movie_chinese_score", year: 2017 },
    { id: "2016_movie_451", year: 2016 },
    { id: "2015_movie_3", year: 2015 },
    { id: "2014_movie_2", year: 2014 },
  ],
  (year) => `豆瓣 ${year} 评分最高电影`,
);

const TV_YEARLY_RANKING = createYearlyRanking(
  [
    { id: "EC2FACYKQ", year: 2025 },
    { id: "ECYA7RAZQ", year: 2024 },
    { id: "ECTE6EOZA", year: 2023 },
    { id: "ECWU56XUI", year: 2022 },
    { id: "ECOY56I6Y", year: 2021 },
    { id: "ECCM5TXSI", year: 2020 },
    { id: "ECR4HOW3I", year: 2019 },
    { id: "2018_tv_23", year: 2018 },
    { id: "2017_tv_domestic_score", year: 2017 },
    { id: "2016_tv_478", year: 2016 },
    { id: "2015_tv_6", year: 2015 },
    { id: "2014_tv_14", year: 2014 },
  ],
  (year) => `豆瓣 ${year} 评分最高剧集`,
);

export const YEARLY_RANKINGS = {
  [MOVIE_YEARLY_RANKING_ID]: MOVIE_YEARLY_RANKING,
  [TV_YEARLY_RANKING_ID]: TV_YEARLY_RANKING,
} as const satisfies Record<string, YearlyRankingItem[]>;

/** 所有年度榜单项的配置（展平后的 CollectionConfig 格式） */
export const YEARLY_RANKING_CONFIGS: CollectionConfig[] = [
  ...MOVIE_YEARLY_RANKING.map<CollectionConfig>((item) => ({ ...item, type: "movie", hasGenre: false })),
  ...TV_YEARLY_RANKING.map<CollectionConfig>((item) => ({ ...item, type: "series", hasGenre: false })),
];

//#endregion

//#region 类型榜单

export const MOVIE_GENRE_CONFIGS: IdName[] = [
  { id: "film_genre_27", name: "剧情片榜" },
  { id: "movie_comedy", name: "喜剧片榜" },
  { id: "movie_love", name: "爱情片榜" },
  { id: "movie_action", name: "动作片榜" },
  { id: "movie_scifi", name: "科幻片榜" },
  { id: "film_genre_31", name: "动画片榜" },
  { id: "film_genre_32", name: "悬疑片榜" },
  { id: "film_genre_46", name: "犯罪片榜" },
  { id: "film_genre_33", name: "惊悚片榜" },
  { id: "film_genre_49", name: "冒险片榜" },
  { id: "film_genre_41", name: "家庭片榜" },
  { id: "film_genre_42", name: "儿童片榜" },
  { id: "film_genre_44", name: "历史片榜" },
  { id: "film_genre_39", name: "音乐片榜" },
  { id: "film_genre_48", name: "奇幻片榜" },
  { id: "film_genre_34", name: "恐怖片榜" },
  { id: "film_genre_45", name: "战争片榜" },
  { id: "film_genre_43", name: "传记片榜" },
  { id: "film_genre_40", name: "歌舞片榜" },
  { id: "film_genre_50", name: "武侠片榜" },
  { id: "film_genre_37", name: "情色片榜" },
  { id: "natural_disasters", name: "灾难片榜" },
  { id: "film_genre_47", name: "西部片榜" },
  { id: "film_genre_51", name: "古装片榜" },
  { id: "ECCEPGM4Y", name: "运动片榜" },
  { id: "film_genre_36", name: "短片榜" },
];

export const TV_GENRE_CONFIGS: IdName[] = [
  { id: "EC74443FY", name: "大陆剧榜" },
  { id: "ECFA5DI7Q", name: "美剧榜" },
  { id: "ECVACXBWI", name: "英剧榜" },
  { id: "ECNA46YBA", name: "日剧榜" },
  { id: "ECBE5CBEI", name: "韩剧榜" },
  { id: "ECVM47WUA", name: "港剧榜" },
  { id: "ECBI5EL6A", name: "台剧榜" },
  { id: "ECRM5BIFQ", name: "泰剧榜" },
  { id: "EC6I5FYHA", name: "欧洲剧榜" },
];

//#endregion

//#region 集合配置

export const COLLECTION_CONFIGS: CollectionConfig[] = [
  // 电影榜单
  { id: "movie_hot_gaia", name: "豆瓣热门电影", type: "movie", isDefault: true },
  { id: "movie_weekly_best", name: "一周口碑电影榜", type: "movie", isDefault: true },
  { id: "movie_real_time_hotest", name: "实时热门电影", type: "movie", isDefault: true },
  { id: "movie_top250", name: "豆瓣电影 Top250", type: "movie", isDefault: true },
  { id: "movie_showing", name: "影院热映", type: "movie", isDefault: true },
  ...MOVIE_GENRE_CONFIGS.map<CollectionConfig>((item) => ({ ...item, type: "movie", hasGenre: true })),
  { id: MOVIE_YEARLY_RANKING_ID, name: "豆瓣年度评分最高电影", type: "movie", hasGenre: true },

  // 剧集榜单
  { id: "tv_hot", name: "近期热门剧集", type: "series", isDefault: true },
  { id: "tv_american", name: "近期热门美剧", type: "series" },
  { id: "tv_korean", name: "近期热门韩剧", type: "series" },
  { id: "tv_domestic", name: "近期热门国产剧", type: "series" },
  { id: "tv_japanese", name: "近期热门日剧", type: "series" },
  { id: "tv_animation", name: "近期热门动画", type: "series", isDefault: true },
  { id: "show_hot", name: "近期热门综艺节目", type: "series", isDefault: true },
  { id: "tv_documentary", name: "近期热门纪录片", type: "series" },
  { id: "tv_real_time_hotest", name: "实时热门电视", type: "series", isDefault: true },
  { id: "tv_chinese_best_weekly", name: "华语口碑剧集榜", type: "series", isDefault: true },
  { id: "tv_global_best_weekly", name: "全球口碑剧集榜", type: "series", isDefault: true },
  { id: "show_chinese_best_weekly", name: "国内口碑综艺榜", type: "series", isDefault: true },
  { id: "show_global_best_weekly", name: "国外口碑综艺榜", type: "series", isDefault: true },
  ...TV_GENRE_CONFIGS.map<CollectionConfig>((item) => ({ ...item, type: "series", hasGenre: true })),
  { id: TV_YEARLY_RANKING_ID, name: "豆瓣年度评分最高剧集", type: "series", hasGenre: true },
];

//#endregion

//#region 派生常量和工具函数

export const DEFAULT_COLLECTION_IDS = COLLECTION_CONFIGS.filter((item) => item.isDefault).map((item) => item.id);

export const isYearlyRankingId = (id: string): id is keyof typeof YEARLY_RANKINGS => id in YEARLY_RANKINGS;

export const getLatestYearlyRanking = (id: string): YearlyRankingItem | undefined =>
  isYearlyRankingId(id) ? maxBy(YEARLY_RANKINGS[id], (item) => item.year) : undefined;

//#endregion
