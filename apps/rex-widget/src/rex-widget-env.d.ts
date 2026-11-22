/// <reference types='@rexnow/libs/env' />
declare namespace DoubanBridge {
    interface GlobalParams {
        /**
         * 密钥
         * @description 点击上方网站获取密钥，开启完整功能
         */
        sk: string;
        /** 用户 ID */
        userId: string;
    }
}

//#region movie_hot_gaia
/** Params of 豆瓣热门电影 */
interface MovieHotGaiaLoadDefaultCatalogParams extends DoubanBridge.GlobalParams, VideoListParams {
    /**
     * 榜单
     * @default 'movie_hot_gaia'
     */
    collectionId: 'movie_hot_gaia';
    /**
     * 页码
     * @default '1'
     */
    page: string;
}

/** Return Type of 豆瓣热门电影 */
interface MovieHotGaiaLoadDefaultCatalogReturnType extends Array<VideoItem> {
}
//#endregion movie_hot_gaia

//#region movie_weekly_best
/** Params of 一周口碑电影榜 */
interface MovieWeeklyBestLoadDefaultCatalogParams extends DoubanBridge.GlobalParams, VideoListParams {
    /**
     * 榜单
     * @default 'movie_weekly_best'
     */
    collectionId: 'movie_weekly_best';
    /**
     * 页码
     * @default '1'
     */
    page: string;
}

/** Return Type of 一周口碑电影榜 */
interface MovieWeeklyBestLoadDefaultCatalogReturnType extends Array<VideoItem> {
}
//#endregion movie_weekly_best

//#region movie_real_time_hotest
/** Params of 实时热门电影 */
interface MovieRealTimeHotestLoadDefaultCatalogParams extends DoubanBridge.GlobalParams, VideoListParams {
    /**
     * 榜单
     * @default 'movie_real_time_hotest'
     */
    collectionId: 'movie_real_time_hotest';
    /**
     * 页码
     * @default '1'
     */
    page: string;
}

/** Return Type of 实时热门电影 */
interface MovieRealTimeHotestLoadDefaultCatalogReturnType extends Array<VideoItem> {
}
//#endregion movie_real_time_hotest

//#region movie_top250
/** Params of 豆瓣电影 Top250 */
interface MovieTop250LoadDefaultCatalogParams extends DoubanBridge.GlobalParams, VideoListParams {
    /**
     * 榜单
     * @default 'movie_top250'
     */
    collectionId: 'movie_top250';
    /**
     * 页码
     * @default '1'
     */
    page: string;
}

/** Return Type of 豆瓣电影 Top250 */
interface MovieTop250LoadDefaultCatalogReturnType extends Array<VideoItem> {
}
//#endregion movie_top250

//#region movie_showing
/** Params of 影院热映 */
interface MovieShowingLoadDefaultCatalogParams extends DoubanBridge.GlobalParams, VideoListParams {
    /**
     * 榜单
     * @default 'movie_showing'
     */
    collectionId: 'movie_showing';
    /**
     * 页码
     * @default '1'
     */
    page: string;
}

/** Return Type of 影院热映 */
interface MovieShowingLoadDefaultCatalogReturnType extends Array<VideoItem> {
}
//#endregion movie_showing

//#region tv_hot
/** Params of 近期热门剧集 */
interface TvHotLoadDefaultCatalogParams extends DoubanBridge.GlobalParams, VideoListParams {
    /**
     * 榜单
     * @default 'tv_hot'
     */
    collectionId: 'tv_hot';
    /**
     * 页码
     * @default '1'
     */
    page: string;
}

/** Return Type of 近期热门剧集 */
interface TvHotLoadDefaultCatalogReturnType extends Array<VideoItem> {
}
//#endregion tv_hot

//#region tv_american
/** Params of 近期热门美剧 */
interface TvAmericanLoadDefaultCatalogParams extends DoubanBridge.GlobalParams, VideoListParams {
    /**
     * 榜单
     * @default 'tv_american'
     */
    collectionId: 'tv_american';
    /**
     * 页码
     * @default '1'
     */
    page: string;
}

/** Return Type of 近期热门美剧 */
interface TvAmericanLoadDefaultCatalogReturnType extends Array<VideoItem> {
}
//#endregion tv_american

//#region tv_korean
/** Params of 近期热门韩剧 */
interface TvKoreanLoadDefaultCatalogParams extends DoubanBridge.GlobalParams, VideoListParams {
    /**
     * 榜单
     * @default 'tv_korean'
     */
    collectionId: 'tv_korean';
    /**
     * 页码
     * @default '1'
     */
    page: string;
}

/** Return Type of 近期热门韩剧 */
interface TvKoreanLoadDefaultCatalogReturnType extends Array<VideoItem> {
}
//#endregion tv_korean

//#region tv_domestic
/** Params of 近期热门国产剧 */
interface TvDomesticLoadDefaultCatalogParams extends DoubanBridge.GlobalParams, VideoListParams {
    /**
     * 榜单
     * @default 'tv_domestic'
     */
    collectionId: 'tv_domestic';
    /**
     * 页码
     * @default '1'
     */
    page: string;
}

/** Return Type of 近期热门国产剧 */
interface TvDomesticLoadDefaultCatalogReturnType extends Array<VideoItem> {
}
//#endregion tv_domestic

//#region tv_japanese
/** Params of 近期热门日剧 */
interface TvJapaneseLoadDefaultCatalogParams extends DoubanBridge.GlobalParams, VideoListParams {
    /**
     * 榜单
     * @default 'tv_japanese'
     */
    collectionId: 'tv_japanese';
    /**
     * 页码
     * @default '1'
     */
    page: string;
}

/** Return Type of 近期热门日剧 */
interface TvJapaneseLoadDefaultCatalogReturnType extends Array<VideoItem> {
}
//#endregion tv_japanese

//#region tv_animation
/** Params of 近期热门动画 */
interface TvAnimationLoadDefaultCatalogParams extends DoubanBridge.GlobalParams, VideoListParams {
    /**
     * 榜单
     * @default 'tv_animation'
     */
    collectionId: 'tv_animation';
    /**
     * 页码
     * @default '1'
     */
    page: string;
}

/** Return Type of 近期热门动画 */
interface TvAnimationLoadDefaultCatalogReturnType extends Array<VideoItem> {
}
//#endregion tv_animation

//#region show_hot
/** Params of 近期热门综艺节目 */
interface ShowHotLoadDefaultCatalogParams extends DoubanBridge.GlobalParams, VideoListParams {
    /**
     * 榜单
     * @default 'show_hot'
     */
    collectionId: 'show_hot';
    /**
     * 页码
     * @default '1'
     */
    page: string;
}

/** Return Type of 近期热门综艺节目 */
interface ShowHotLoadDefaultCatalogReturnType extends Array<VideoItem> {
}
//#endregion show_hot

//#region tv_documentary
/** Params of 近期热门纪录片 */
interface TvDocumentaryLoadDefaultCatalogParams extends DoubanBridge.GlobalParams, VideoListParams {
    /**
     * 榜单
     * @default 'tv_documentary'
     */
    collectionId: 'tv_documentary';
    /**
     * 页码
     * @default '1'
     */
    page: string;
}

/** Return Type of 近期热门纪录片 */
interface TvDocumentaryLoadDefaultCatalogReturnType extends Array<VideoItem> {
}
//#endregion tv_documentary

//#region tv_real_time_hotest
/** Params of 实时热门电视 */
interface TvRealTimeHotestLoadDefaultCatalogParams extends DoubanBridge.GlobalParams, VideoListParams {
    /**
     * 榜单
     * @default 'tv_real_time_hotest'
     */
    collectionId: 'tv_real_time_hotest';
    /**
     * 页码
     * @default '1'
     */
    page: string;
}

/** Return Type of 实时热门电视 */
interface TvRealTimeHotestLoadDefaultCatalogReturnType extends Array<VideoItem> {
}
//#endregion tv_real_time_hotest

//#region tv_chinese_best_weekly
/** Params of 华语口碑剧集榜 */
interface TvChineseBestWeeklyLoadDefaultCatalogParams extends DoubanBridge.GlobalParams, VideoListParams {
    /**
     * 榜单
     * @default 'tv_chinese_best_weekly'
     */
    collectionId: 'tv_chinese_best_weekly';
    /**
     * 页码
     * @default '1'
     */
    page: string;
}

/** Return Type of 华语口碑剧集榜 */
interface TvChineseBestWeeklyLoadDefaultCatalogReturnType extends Array<VideoItem> {
}
//#endregion tv_chinese_best_weekly

//#region tv_global_best_weekly
/** Params of 全球口碑剧集榜 */
interface TvGlobalBestWeeklyLoadDefaultCatalogParams extends DoubanBridge.GlobalParams, VideoListParams {
    /**
     * 榜单
     * @default 'tv_global_best_weekly'
     */
    collectionId: 'tv_global_best_weekly';
    /**
     * 页码
     * @default '1'
     */
    page: string;
}

/** Return Type of 全球口碑剧集榜 */
interface TvGlobalBestWeeklyLoadDefaultCatalogReturnType extends Array<VideoItem> {
}
//#endregion tv_global_best_weekly

//#region show_chinese_best_weekly
/** Params of 国内口碑综艺榜 */
interface ShowChineseBestWeeklyLoadDefaultCatalogParams extends DoubanBridge.GlobalParams, VideoListParams {
    /**
     * 榜单
     * @default 'show_chinese_best_weekly'
     */
    collectionId: 'show_chinese_best_weekly';
    /**
     * 页码
     * @default '1'
     */
    page: string;
}

/** Return Type of 国内口碑综艺榜 */
interface ShowChineseBestWeeklyLoadDefaultCatalogReturnType extends Array<VideoItem> {
}
//#endregion show_chinese_best_weekly

//#region show_global_best_weekly
/** Params of 国外口碑综艺榜 */
interface ShowGlobalBestWeeklyLoadDefaultCatalogParams extends DoubanBridge.GlobalParams, VideoListParams {
    /**
     * 榜单
     * @default 'show_global_best_weekly'
     */
    collectionId: 'show_global_best_weekly';
    /**
     * 页码
     * @default '1'
     */
    page: string;
}

/** Return Type of 国外口碑综艺榜 */
interface ShowGlobalBestWeeklyLoadDefaultCatalogReturnType extends Array<VideoItem> {
}
//#endregion show_global_best_weekly

//#region movie_genre
/** Params of 电影类型榜 */
interface MovieGenreLoadGenreCatalogParams extends DoubanBridge.GlobalParams, VideoListParams {
    /**
     * 榜单
     * @default 'film_genre_27'
     */
    collectionId: 'film_genre_27' | 'movie_comedy' | 'movie_love' | 'movie_action' | 'movie_scifi' | 'film_genre_31' | 'film_genre_32' | 'film_genre_46' | 'film_genre_33' | 'film_genre_49' | 'film_genre_41' | 'film_genre_42' | 'film_genre_44' | 'film_genre_39' | 'film_genre_48' | 'film_genre_34' | 'film_genre_45' | 'film_genre_43' | 'film_genre_40' | 'film_genre_50' | 'film_genre_37' | 'natural_disasters' | 'film_genre_47' | 'film_genre_51' | 'ECCEPGM4Y' | 'film_genre_36';
    /** 分类 */
    subCollectionId: string;
    /**
     * 页码
     * @default '1'
     */
    page: string;
}

/** Return Type of 电影类型榜 */
interface MovieGenreLoadGenreCatalogReturnType extends Array<VideoItem> {
}
//#endregion movie_genre

//#region tv_genre
/** Params of 剧集类型榜 */
interface TvGenreLoadGenreCatalogParams extends DoubanBridge.GlobalParams, VideoListParams {
    /**
     * 榜单
     * @default 'EC74443FY'
     */
    collectionId: 'EC74443FY' | 'ECFA5DI7Q' | 'ECVACXBWI' | 'ECNA46YBA' | 'ECBE5CBEI' | 'ECVM47WUA' | 'ECBI5EL6A' | 'EC2Y5FJTY' | 'EC6I5FYHA' | 'ECR4CRXHA';
    /** 分类 */
    subCollectionId: string;
    /**
     * 页码
     * @default '1'
     */
    page: string;
}

/** Return Type of 剧集类型榜 */
interface TvGenreLoadGenreCatalogReturnType extends Array<VideoItem> {
}
//#endregion tv_genre

//#region movie_yearly
/** Params of 豆瓣年度评分最高电影 */
interface MovieYearlyLoadYearlyCatalogParams extends DoubanBridge.GlobalParams, VideoListParams {
    /**
     * 年度
     * @default '__movie_yearly_ranking__'
     */
    collectionId: '__movie_yearly_ranking__' | 'ECE472UNY' | 'ECBE7RX5A' | 'ECQ46F7XI' | 'ECKA55LSA' | 'ECWY6B2GQ' | 'EC2A5MRIY' | 'ECFYHQBWQ' | '2018_movie_1' | '2017_movie_chinese_score' | '2016_movie_451' | '2015_movie_3' | '2014_movie_2';
    /** 分类 */
    subCollectionId: string;
    /**
     * 页码
     * @default '1'
     */
    page: string;
}

/** Return Type of 豆瓣年度评分最高电影 */
interface MovieYearlyLoadYearlyCatalogReturnType extends Array<VideoItem> {
}
//#endregion movie_yearly

//#region tv_yearly
/** Params of 豆瓣年度评分最高剧集 */
interface TvYearlyLoadYearlyCatalogParams extends DoubanBridge.GlobalParams, VideoListParams {
    /**
     * 年度
     * @default '__tv_yearly_ranking__'
     */
    collectionId: '__tv_yearly_ranking__' | 'EC2FACYKQ' | 'ECYA7RAZQ' | 'ECTE6EOZA' | 'ECWU56XUI' | 'ECOY56I6Y' | 'ECCM5TXSI' | 'ECR4HOW3I' | '2018_tv_23' | '2017_tv_domestic_score' | '2016_tv_478' | '2015_tv_6' | '2014_tv_14';
    /** 分类 */
    subCollectionId: string;
    /**
     * 页码
     * @default '1'
     */
    page: string;
}

/** Return Type of 豆瓣年度评分最高剧集 */
interface TvYearlyLoadYearlyCatalogReturnType extends Array<VideoItem> {
}
//#endregion tv_yearly

//#region selected_collections
/** Params of 豆瓣精选榜单 */
interface LoadSelectedCatalogParams extends DoubanBridge.GlobalParams, VideoListParams {
    /**
     * 类型
     * @default 'movie'
     */
    type: 'movie' | 'tv';
    /** 榜单 */
    collectionId: string;
    /**
     * 页码
     * @default '1'
     */
    page: string;
}

/** Return Type of 豆瓣精选榜单 */
interface LoadSelectedCatalogReturnType extends Array<VideoItem> {
}

/** 豆瓣精选榜单 */
declare let loadSelectedCatalog: (params: LoadSelectedCatalogParams) => LoadSelectedCatalogReturnType | Promise<LoadSelectedCatalogReturnType>;
//#endregion selected_collections

//#region movie_recommend
/** Params of 电影推荐 */
interface LoadMovieRecommendCatalogParams extends DoubanBridge.GlobalParams, VideoListParams {
    /** 类型 */
    genre: '' | '喜剧' | '爱情' | '动作' | '科幻' | '动画' | '悬疑' | '犯罪' | '惊悚' | '冒险' | '音乐' | '历史' | '奇幻' | '恐怖' | '战争' | '传记' | '歌舞' | '武侠' | '灾难' | '西部' | '纪录片' | '短片';
    /** 地区 */
    region: '' | '华语' | '欧美' | '国外' | '韩国' | '日本' | '大陆' | '香港' | '美国' | '英国' | '泰国' | '台湾' | '意大利' | '法国' | '德国' | '西班牙' | '俄罗斯' | '瑞典' | '巴西' | '丹麦' | '印度' | '加拿大' | '爱尔兰' | '澳大利亚';
    /**
     * 排序
     * @default 'T'
     */
    sort: 'T' | 'U' | 'R' | 'S';
    /** 年代 */
    year: '' | '2020年代' | '2026' | '2025' | '2024' | '2023' | '2022' | '2021' | '2020' | '2019' | '2010年代' | '2000年代' | '90年代' | '80年代' | '70年代' | '60年代' | '更早';
    /**
     * 自定义标签
     * @description 多个标签用逗号分隔
     */
    tag: string;
    /**
     * 页码
     * @default '1'
     */
    page: string;
}

/** Return Type of 电影推荐 */
interface LoadMovieRecommendCatalogReturnType extends Array<VideoItem> {
}

/** 电影推荐 */
declare let loadMovieRecommendCatalog: (params: LoadMovieRecommendCatalogParams) => LoadMovieRecommendCatalogReturnType | Promise<LoadMovieRecommendCatalogReturnType>;
//#endregion movie_recommend

//#region tv_recommend
/** Params of 剧集推荐 */
interface LoadTvRecommendCatalogParams extends DoubanBridge.GlobalParams, VideoListParams {
    /**
     * 类型
     * @default ''
     */
    genre: '' | '电视剧' | '综艺';
    /** 分类 */
    subGenre?: string;
    /** 地区 */
    region: '' | '华语' | '欧美' | '国外' | '韩国' | '日本' | '大陆' | '香港' | '美国' | '英国' | '泰国' | '台湾' | '意大利' | '法国' | '德国' | '西班牙' | '俄罗斯' | '瑞典' | '巴西' | '丹麦' | '印度' | '加拿大' | '爱尔兰' | '澳大利亚';
    /**
     * 排序
     * @default 'T'
     */
    sort: 'T' | 'U' | 'R' | 'S';
    /** 年代 */
    year: '' | '2020年代' | '2026' | '2025' | '2024' | '2023' | '2022' | '2021' | '2020' | '2019' | '2010年代' | '2000年代' | '90年代' | '80年代' | '70年代' | '60年代' | '更早';
    /**
     * 自定义标签
     * @description 多个标签用逗号分隔
     */
    tag: string;
    /**
     * 页码
     * @default '1'
     */
    page: string;
}

/** Return Type of 剧集推荐 */
interface LoadTvRecommendCatalogReturnType extends Array<VideoItem> {
}

/** 剧集推荐 */
declare let loadTvRecommendCatalog: (params: LoadTvRecommendCatalogParams) => LoadTvRecommendCatalogReturnType | Promise<LoadTvRecommendCatalogReturnType>;
//#endregion tv_recommend

//#region search
/** Params of 搜索 */
interface LoadSearchParams extends DoubanBridge.GlobalParams {
    /** 搜索关键词 */
    keyword: string;
}

/** Return Type of 搜索 */
interface LoadSearchReturnType extends Array<VideoItem> {
}

/** 搜索 */
declare let loadSearch: (params: LoadSearchParams) => LoadSearchReturnType | Promise<LoadSearchReturnType>;
//#endregion search
type LoadDefaultCatalogParams = MovieHotGaiaLoadDefaultCatalogParams | MovieWeeklyBestLoadDefaultCatalogParams | MovieRealTimeHotestLoadDefaultCatalogParams | MovieTop250LoadDefaultCatalogParams | MovieShowingLoadDefaultCatalogParams | TvHotLoadDefaultCatalogParams | TvAmericanLoadDefaultCatalogParams | TvKoreanLoadDefaultCatalogParams | TvDomesticLoadDefaultCatalogParams | TvJapaneseLoadDefaultCatalogParams | TvAnimationLoadDefaultCatalogParams | ShowHotLoadDefaultCatalogParams | TvDocumentaryLoadDefaultCatalogParams | TvRealTimeHotestLoadDefaultCatalogParams | TvChineseBestWeeklyLoadDefaultCatalogParams | TvGlobalBestWeeklyLoadDefaultCatalogParams | ShowChineseBestWeeklyLoadDefaultCatalogParams | ShowGlobalBestWeeklyLoadDefaultCatalogParams;
type LoadDefaultCatalogReturnType = MovieHotGaiaLoadDefaultCatalogReturnType | MovieWeeklyBestLoadDefaultCatalogReturnType | MovieRealTimeHotestLoadDefaultCatalogReturnType | MovieTop250LoadDefaultCatalogReturnType | MovieShowingLoadDefaultCatalogReturnType | TvHotLoadDefaultCatalogReturnType | TvAmericanLoadDefaultCatalogReturnType | TvKoreanLoadDefaultCatalogReturnType | TvDomesticLoadDefaultCatalogReturnType | TvJapaneseLoadDefaultCatalogReturnType | TvAnimationLoadDefaultCatalogReturnType | ShowHotLoadDefaultCatalogReturnType | TvDocumentaryLoadDefaultCatalogReturnType | TvRealTimeHotestLoadDefaultCatalogReturnType | TvChineseBestWeeklyLoadDefaultCatalogReturnType | TvGlobalBestWeeklyLoadDefaultCatalogReturnType | ShowChineseBestWeeklyLoadDefaultCatalogReturnType | ShowGlobalBestWeeklyLoadDefaultCatalogReturnType;

/** 豆瓣热门电影 */
declare let loadDefaultCatalog: (params: LoadDefaultCatalogParams) => LoadDefaultCatalogReturnType | Promise<LoadDefaultCatalogReturnType>;

type LoadGenreCatalogParams = MovieGenreLoadGenreCatalogParams | TvGenreLoadGenreCatalogParams;
type LoadGenreCatalogReturnType = MovieGenreLoadGenreCatalogReturnType | TvGenreLoadGenreCatalogReturnType;

/** 电影类型榜 */
declare let loadGenreCatalog: (params: LoadGenreCatalogParams) => LoadGenreCatalogReturnType | Promise<LoadGenreCatalogReturnType>;

type LoadYearlyCatalogParams = MovieYearlyLoadYearlyCatalogParams | TvYearlyLoadYearlyCatalogParams;
type LoadYearlyCatalogReturnType = MovieYearlyLoadYearlyCatalogReturnType | TvYearlyLoadYearlyCatalogReturnType;

/** 豆瓣年度评分最高电影 */
declare let loadYearlyCatalog: (params: LoadYearlyCatalogParams) => LoadYearlyCatalogReturnType | Promise<LoadYearlyCatalogReturnType>;

//#region dynamicOptions:loadSubCollections
/** Dynamic options loader: loadSubCollections */
declare let loadSubCollections: (params: MovieGenreLoadGenreCatalogParams | TvGenreLoadGenreCatalogParams | MovieYearlyLoadYearlyCatalogParams | TvYearlyLoadYearlyCatalogParams) => Array<WidgetModuleParamOption> | Promise<Array<WidgetModuleParamOption>>;
//#endregion dynamicOptions:loadSubCollections

//#region dynamicOptions:loadSelectedCollections
/** Dynamic options loader: loadSelectedCollections */
declare let loadSelectedCollections: (params: LoadSelectedCatalogParams) => Array<WidgetModuleParamOption> | Promise<Array<WidgetModuleParamOption>>;
//#endregion dynamicOptions:loadSelectedCollections

//#region dynamicOptions:loadTvRecommendSubGenres
/** Dynamic options loader: loadTvRecommendSubGenres */
declare let loadTvRecommendSubGenres: (params: LoadTvRecommendCatalogParams) => Array<WidgetModuleParamOption> | Promise<Array<WidgetModuleParamOption>>;
//#endregion dynamicOptions:loadTvRecommendSubGenres
