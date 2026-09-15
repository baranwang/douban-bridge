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
interface MovieHotGaiaLoadDefaultCatalogParams extends DoubanBridge.GlobalParams {
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
interface MovieWeeklyBestLoadDefaultCatalogParams extends DoubanBridge.GlobalParams {
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
interface MovieRealTimeHotestLoadDefaultCatalogParams extends DoubanBridge.GlobalParams {
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
interface MovieTop250LoadDefaultCatalogParams extends DoubanBridge.GlobalParams {
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
interface MovieShowingLoadDefaultCatalogParams extends DoubanBridge.GlobalParams {
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
interface TvHotLoadDefaultCatalogParams extends DoubanBridge.GlobalParams {
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

//#region tv_animation
/** Params of 近期热门动画 */
interface TvAnimationLoadDefaultCatalogParams extends DoubanBridge.GlobalParams {
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
interface ShowHotLoadDefaultCatalogParams extends DoubanBridge.GlobalParams {
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

//#region tv_real_time_hotest
/** Params of 实时热门电视 */
interface TvRealTimeHotestLoadDefaultCatalogParams extends DoubanBridge.GlobalParams {
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
interface TvChineseBestWeeklyLoadDefaultCatalogParams extends DoubanBridge.GlobalParams {
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
interface TvGlobalBestWeeklyLoadDefaultCatalogParams extends DoubanBridge.GlobalParams {
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
interface ShowChineseBestWeeklyLoadDefaultCatalogParams extends DoubanBridge.GlobalParams {
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
interface ShowGlobalBestWeeklyLoadDefaultCatalogParams extends DoubanBridge.GlobalParams {
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
interface MovieGenreLoadGenreCatalogParams extends DoubanBridge.GlobalParams {
    /** 榜单 */
    collectionId: 'film_genre_27' | 'movie_comedy' | 'movie_love' | 'movie_action' | 'movie_scifi' | 'film_genre_31' | 'film_genre_32' | 'film_genre_46' | 'film_genre_33' | 'film_genre_49' | 'film_genre_41' | 'film_genre_42' | 'film_genre_44' | 'film_genre_39' | 'film_genre_48' | 'film_genre_34' | 'film_genre_45' | 'film_genre_43' | 'film_genre_40' | 'film_genre_50' | 'film_genre_37' | 'natural_disasters' | 'film_genre_47' | 'film_genre_51' | 'ECCEPGM4Y' | 'film_genre_36';
    /**
     * 分类
     * @default 'movie_comedy'
     */
    subCollectionId_movie_comedy: 'ECAYN54KI' | 'movie_comedy' | 'ECVUOUD7A' | 'ECPQO4BPA' | 'ECKIO6SXI' | 'ECGUO62ZA' | 'ECOYO2QPA' | 'ECEAOX2BI' | 'ECFIOT7JA' | 'ECOIOVQPY' | 'EC6IOYROI' | 'ECIEOY5UI' | 'ECFQO5B4A' | 'ECREOTSEI' | 'EC6UO37NQ' | 'ECPMPBHBI' | 'ECTIOYBOY' | 'ECAIO3EWI' | 'ECYUPAHZY' | 'ECKMOXL6Q' | 'ECOAOZY7Y' | 'ECLYOFOKA';
    /**
     * 分类
     * @default 'movie_love'
     */
    subCollectionId_movie_love: 'ECSAOJFTA' | 'movie_love' | 'ECOIOTUGY' | 'ECUAOYUCA' | 'EC64OQVEQ' | 'EC4EOSAQA' | 'ECWQOQO4A' | 'ECKMOVF3Y' | 'ECHIOXXIQ' | 'ECHAO4AAQ' | 'ECTAOT7GQ' | 'ECNIOS7EQ' | 'EC3UOSWUY' | 'ECU4OWMMI' | 'ECCEOUVAA' | 'ECLUOQWVY' | 'ECYQO7YPQ' | 'ECEAOXFIQ' | 'ECOUOXYUA' | 'ECJMO2O5Y' | 'EC2UOKRRQ';
    /**
     * 分类
     * @default 'movie_action'
     */
    subCollectionId_movie_action: 'ECBUOLQGY' | 'movie_action' | 'EC2YO2M2A' | 'ECHUOXOUA' | 'ECPMPC7JA' | 'ECTMO64KY' | 'ECBAPBW2Y' | 'ECWQOU2HI' | 'ECCUPDBHQ' | 'EC5UOWEFY' | 'EC7AOW57Q' | 'ECMQO4F2I' | 'ECUQPDN7Y' | 'EC4QPALEI' | 'ECVIOHY6A';
    /**
     * 分类
     * @default 'movie_scifi'
     */
    subCollectionId_movie_scifi: 'ECZYOJPLI' | 'movie_scifi' | 'ECX4O7JAA' | 'ECDAO6XZI' | 'ECSYOV6GY' | 'EC4UOZQ4Y' | 'EC3MO34NI' | 'ECOUO2ETY' | 'ECX4PAGTA' | 'ECTAOXLWQ' | 'EC2IOENJA';
    /**
     * 分类
     * @default 'film_genre_31'
     */
    subCollectionId_film_genre_31: 'EC3UOBDQY' | 'film_genre_31' | 'ECFMOYMKA' | 'ECLYO57HA' | 'EC4IPDWYI' | 'ECLYO6JQQ' | 'ECWUO3RJA' | 'ECIQPF7NY' | 'EC3YPB7WQ' | 'ECTUO3I3A';
    /**
     * 分类
     * @default 'film_genre_32'
     */
    subCollectionId_film_genre_32: 'ECPQOJP5Q' | 'film_genre_32' | 'ECRMOX2JI' | 'ECUMPB7SA' | 'ECJUO3L7I' | 'ECV4OU2WA' | 'ECVYOVDIA' | 'ECSYOYZWI' | 'EC5YPE3OI' | 'ECQUO7FVQ' | 'ECZQO7KSQ' | 'ECVEO7MPI' | 'ECAYOVXFA' | 'ECYMPDCTI' | 'ECIMOWR2I' | 'ECK4OEBJY';
    /**
     * 分类
     * @default 'film_genre_46'
     */
    subCollectionId_film_genre_46: 'ECLAN6LHQ' | 'film_genre_46' | 'ECVUO4O4Q' | 'EC5QO2HUI' | 'ECWAPHUIA' | 'ECEAPADKY' | 'EC3AOZZUY' | 'ECVUO43DY' | 'ECGYO2SPA' | 'ECVYOZNAI' | 'ECFEPCR2A' | 'ECVAPBWRI' | 'ECRMO4X7I' | 'ECPAPDKZA' | 'EC2MPBOOI' | 'ECEMOZ6DI' | 'EC7EOG3RI';
    /**
     * 分类
     * @default 'film_genre_33'
     */
    subCollectionId_film_genre_33: 'ECBUOL2DA' | 'film_genre_33' | 'EC5MPCA7Y' | 'ECTMPCZTY' | 'ECSYO3JKQ' | 'ECFUO25PI' | 'ECTMPDECI' | 'ECU4O6QYQ' | 'ECPMPHOMI' | 'ECJIPH4JA' | 'EC2QPBTHY' | 'ECLMPAEZY' | 'ECMIPBWCY' | 'ECRQPBSYI' | 'ECZMPDHQI' | 'EC7QPFMYA' | 'ECY4ODRSY';
    /**
     * 分类
     * @default 'film_genre_49'
     */
    subCollectionId_film_genre_49: 'ECDYOE7WY' | 'film_genre_49' | 'ECAUOWGNQ' | 'ECW4O3GHY' | 'ECOMON43Q' | 'ECOUOVT2Q' | 'ECFUORHLY' | 'EC5YO53DI' | 'ECMYOXC2Y' | 'ECRYO5ULY' | 'ECFIOR3MY' | 'ECEMN5MLA';
    /**
     * 分类
     * @default 'film_genre_44'
     */
    subCollectionId_film_genre_44: 'film_genre_44' | 'ECV4N7YWY' | 'ECIAOE4OY' | 'ECK4OGBSA' | 'ECPYOEZNY' | 'EC54OCODY' | 'ECMAOINLA' | 'ECSEOEISY' | 'ECUMONVJQ' | 'ECNQODGKI' | 'ECL4OLRCY' | 'ECBAOKDHQ';
    /**
     * 分类
     * @default 'film_genre_39'
     */
    subCollectionId_film_genre_39: 'film_genre_39' | 'ECAQO25QI' | 'ECUAOV5NA' | 'ECFYORPYQ' | 'ECAQO3LYY' | 'ECYAORESI' | 'EC2UOKJFQ';
    /**
     * 分类
     * @default 'film_genre_48'
     */
    subCollectionId_film_genre_48: 'film_genre_48' | 'EC5MOJAZY' | 'ECUMOLXQY' | 'ECVIOIPDI' | 'ECUUOJIFA' | 'ECEIOJZTQ' | 'ECDAOLOSI' | 'ECRAOGHZY' | 'EC6QOILRA' | 'EC4YOCBLQ' | 'ECCMOLZQA';
    /**
     * 分类
     * @default 'film_genre_34'
     */
    subCollectionId_film_genre_34: 'ECV4N4FBI' | 'film_genre_34' | 'EC54OE5HA' | 'ECFAOK5WQ' | 'ECGMORRUY' | 'EC6QOMMWY' | 'ECFEOMHIQ' | 'ECFUOGJDQ' | 'ECHIOLPXA' | 'ECWUOILKA' | 'EC2AOMMKY' | 'ECVYODZIA' | 'ECFYOIWBQ' | 'ECTMOHSQY';
    /**
     * 分类
     * @default 'film_genre_45'
     */
    subCollectionId_film_genre_45: 'EC6MOCTVQ' | 'film_genre_45' | 'ECWUOKOLY' | 'ECUIOKO6I' | 'ECDYONLLI' | 'ECO4OUYWI' | 'ECFYOK3AQ' | 'EC2UOS6AQ' | 'ECVIOP57A' | 'EC6UOQ3TY' | 'ECV4OGCIA' | 'ECYUOU5TA' | 'ECGEOIWRA' | 'ECF4OMYDQ';
    /**
     * 分类
     * @default 'film_genre_43'
     */
    subCollectionId_film_genre_43: 'EC3EOHEYY' | 'film_genre_43' | 'ECVYOEEUA' | 'ECZIOQ6LY' | 'ECE4OHQQY' | 'ECNMONJTQ' | 'ECYIOK3PY' | 'ECAYOFADY' | 'ECLEOKFFQ' | 'ECCUOUMXQ' | 'ECRAODXXI';
    /**
     * 分类
     * @default 'film_genre_40'
     */
    subCollectionId_film_genre_40: 'film_genre_40' | 'EC3QOS5MA' | 'ECYQOXMSA' | 'ECZMOHQ3Q';
    /**
     * 分类
     * @default 'film_genre_50'
     */
    subCollectionId_film_genre_50: 'film_genre_50' | 'ECEAOOAHI' | 'EC6YOLGQQ' | 'ECWAOLLZQ';
    /**
     * 分类
     * @default 'film_genre_37'
     */
    subCollectionId_film_genre_37: 'film_genre_37' | 'ECKQOVFTY' | 'ECVUONKTI' | 'ECTQOQ6XQ' | 'ECLUOK4TA' | 'ECDMOZMVI' | 'ECA4OSUNA' | 'ECDAOW2PY' | 'ECM4OVMRY' | 'ECGYN6NHI';
    /**
     * 分类
     * @default 'natural_disasters'
     */
    subCollectionId_natural_disasters: 'natural_disasters' | 'EC5IOQ75I' | 'EC4IOWGKA' | 'ECHMOGZLQ';
    /**
     * 分类
     * @default 'film_genre_47'
     */
    subCollectionId_film_genre_47: 'film_genre_47' | 'ECM4OWDGI' | 'ECU4ORYVI';
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
interface TvGenreLoadGenreCatalogParams extends DoubanBridge.GlobalParams {
    /** 榜单 */
    collectionId: 'EC74443FY' | 'ECFA5DI7Q' | 'ECVACXBWI' | 'ECNA46YBA' | 'ECBE5CBEI' | 'ECVM47WUA' | 'ECBI5EL6A' | 'EC2Y5FJTY' | 'EC6I5FYHA' | 'ECR4CRXHA';
    /**
     * 分类
     * @default 'EC74443FY'
     */
    subCollectionId_EC74443FY: 'EC74443FY' | 'ECT45KVZI' | 'ECVQ47BUI' | 'ECZM5H55I' | 'ECIU5AZDA' | 'ECJU5D3PY' | 'ECTU453WI' | 'EC4Q5JNKI' | 'ECN45K75A' | 'ECRI46YZQ';
    /**
     * 分类
     * @default 'ECFA5DI7Q'
     */
    subCollectionId_ECFA5DI7Q: 'ECFA5DI7Q' | 'ECVACWVGI' | 'ECX45ISGQ' | 'ECA45D3RQ' | 'ECKI5JNJI' | 'ECME44L4Y' | 'ECL45GQ4I' | 'EC2Y5CTPA' | 'ECMM5ALJQ' | 'ECHU473PI' | 'ECRE46B7Y' | 'ECGI5HUQI';
    /**
     * 分类
     * @default 'ECVACXBWI'
     */
    subCollectionId_ECVACXBWI: 'ECVACXBWI' | 'ECZE5BCZA' | 'ECTM5HMAI' | 'EC5I5EOCQ' | 'ECEM4373Q';
    /**
     * 分类
     * @default 'ECNA46YBA'
     */
    subCollectionId_ECNA46YBA: 'ECNA46YBA' | 'ECBQCUATA' | 'ECWM5LNJI' | 'ECEA5D2RQ' | 'ECHI5FDTQ' | 'ECEA5DW5Q';
    /**
     * 分类
     * @default 'ECBE5CBEI'
     */
    subCollectionId_ECBE5CBEI: 'ECBE5CBEI' | 'EC6EC5GBQ' | 'ECS45ISKI' | 'ECOU5ECZQ' | 'ECZY5IDOY';
    /**
     * 分类
     * @default 'ECVM47WUA'
     */
    subCollectionId_ECVM47WUA: 'ECVM47WUA' | 'ECXI5EIII' | 'EC3Y5ISIQ' | 'ECIE5FVTI' | 'EC3A46RGQ' | 'EC3U5ASKQ';
    /**
     * 分类
     * @default 'ECBI5EL6A'
     */
    subCollectionId_ECBI5EL6A: 'ECBI5EL6A' | 'ECBU5LX3A' | 'ECJQ5LAFY';
    /**
     * 分类
     * @default 'EC6I5FYHA'
     */
    subCollectionId_EC6I5FYHA: 'EC6I5FYHA' | 'ECZY5KBOQ' | 'ECJQ5LPXY' | 'ECSA5KEKY' | 'ECEU47F2I' | 'ECGM5NIQA' | 'ECTM5JVYA';
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
interface MovieYearlyLoadYearlyCatalogParams extends DoubanBridge.GlobalParams {
    /** 年度 */
    collectionId: '__movie_yearly_ranking__' | 'ECE472UNY' | 'ECBE7RX5A' | 'ECQ46F7XI' | 'ECKA55LSA' | 'ECWY6B2GQ' | 'EC2A5MRIY' | 'ECFYHQBWQ' | '2018_movie_1' | '2017_movie_chinese_score' | '2016_movie_451' | '2015_movie_3' | '2014_movie_2';
    /**
     * 分类
     * @default '__movie_yearly_ranking__'
     */
    subCollectionId___movie_yearly_ranking__: '__movie_yearly_ranking__' | 'ECB5AE5EQ' | 'ECFM7Z3AA' | 'ECNI724YA' | 'EC45ABN2Y' | 'ECANAAAGY' | 'ECM5AC2HQ' | 'ECNA72CVA' | 'ECKU74SFA' | 'ECDBAETMY';
    /**
     * 分类
     * @default 'ECE472UNY'
     */
    subCollectionId_ECE472UNY: 'ECE472UNY' | 'ECB5AE5EQ' | 'ECFM7Z3AA' | 'ECNI724YA' | 'EC45ABN2Y' | 'ECANAAAGY' | 'ECM5AC2HQ' | 'ECNA72CVA' | 'ECKU74SFA' | 'ECDBAETMY';
    /**
     * 分类
     * @default 'ECBE7RX5A'
     */
    subCollectionId_ECBE7RX5A: 'ECBE7RX5A' | 'ECBQ7RNSA' | 'ECSE7P7GQ' | 'ECRY73E2Q' | 'ECBM7NLJA' | 'ECLE7RV6Y' | 'ECHU7QOYQ' | 'ECKY7RPLQ' | 'ECZA7V7AA' | 'ECS47YXRQ';
    /**
     * 分类
     * @default 'ECQ46F7XI'
     */
    subCollectionId_ECQ46F7XI: 'ECQ46F7XI' | 'ECFA6FLWQ' | 'ECMY6GCCA' | 'ECCU6MRTY' | 'EC4Y6ALRA' | 'ECCI6H3TA' | 'EC3A56FJA' | 'ECYI6DWVQ' | 'ECHU6BXBI' | 'ECRM6A2JA';
    /**
     * 分类
     * @default 'ECKA55LSA'
     */
    subCollectionId_ECKA55LSA: 'ECKA55LSA' | 'ECQU6DFQA' | 'ECSQ6DBYA' | 'ECEA6ANKY' | 'ECHM6DG7Y' | 'EC4Y54ORI' | 'ECYU6IHKI' | 'ECRI53OUQ' | 'EC4M6ACVQ' | 'ECGY527GY';
    /**
     * 分类
     * @default 'ECWY6B2GQ'
     */
    subCollectionId_ECWY6B2GQ: 'ECWY6B2GQ' | 'ECNE54UQI' | 'ECRA53WMI' | 'ECJM6BMEA' | 'EC6A575FI' | 'ECBM5YQVA' | 'ECOY6BCBI' | 'ECLY57EVQ';
    /**
     * 分类
     * @default 'EC2A5MRIY'
     */
    subCollectionId_EC2A5MRIY: 'EC2A5MRIY' | 'ECIU5HIEQ' | 'ECGY5FDUA' | 'ECCA5MMHI' | 'EC3A5GQ5A' | 'ECM45Q7VI' | 'ECBA5UC6Q' | 'EC7U5TVBY' | 'ECMY5PBHI' | 'EC4Q5SGKQ';
    /**
     * 分类
     * @default 'ECFYHQBWQ'
     */
    subCollectionId_ECFYHQBWQ: 'ECFYHQBWQ' | 'ECFQHXCTQ' | 'ECOUHS3TY' | 'ECBU6ENLI' | 'ECSY52PSI' | 'EC7E57OPQ' | 'ECYQ6G4WI';
    /**
     * 分类
     * @default '2018_movie_1'
     */
    subCollectionId_2018_movie_1: '2018_movie_1' | '2018_movie_0' | '2018_movie_14' | '2018_movie_5' | '2018_movie_4' | '2018_movie_16' | '2018_movie_17' | '2018_movie_19' | '2018_movie_20' | '2018_movie_21';
    /**
     * 分类
     * @default '2017_movie_chinese_score'
     */
    subCollectionId_2017_movie_chinese_score: '2017_movie_chinese_score' | '2017_movie_foreign_score' | '2017_movie_dark_horse' | '2017_movie_696' | '2017_movie_695' | '2017_movie_699' | '2017_movie_700' | '2017_movie_702' | '2017_movie_686';
    /**
     * 分类
     * @default '2016_movie_451'
     */
    subCollectionId_2016_movie_451: '2016_movie_451' | '2016_movie_272' | '2016_movie_456' | '2016_movie_459' | '2016_movie_458' | '2016_movie_465' | '2016_movie_466' | '2016_movie_468' | '2016_movie_469' | '2016_movie_470';
    /**
     * 分类
     * @default '2015_movie_3'
     */
    subCollectionId_2015_movie_3: '2015_movie_3' | '2015_movie_2' | '2015_movie_43' | '2015_movie_45' | '2015_movie_44' | '2015_movie_54' | '2015_movie_55';
    /**
     * 分类
     * @default '2014_movie_2'
     */
    subCollectionId_2014_movie_2: '2014_movie_2' | '2014_movie_1' | '2014_movie_5' | '2014_movie_7' | '2014_movie_6' | '2014_movie_9' | '2014_movie_10';
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
interface TvYearlyLoadYearlyCatalogParams extends DoubanBridge.GlobalParams {
    /** 年度 */
    collectionId: '__tv_yearly_ranking__' | 'EC2FACYKQ' | 'ECYA7RAZQ' | 'ECTE6EOZA' | 'ECWU56XUI' | 'ECOY56I6Y' | 'ECCM5TXSI' | 'ECR4HOW3I' | '2018_tv_23' | '2017_tv_domestic_score' | '2016_tv_478' | '2015_tv_6' | '2014_tv_14';
    /**
     * 分类
     * @default '__tv_yearly_ranking__'
     */
    subCollectionId___tv_yearly_ranking__: '__tv_yearly_ranking__' | 'ECHNAB4LY' | 'ECWQ7ZJGY' | 'ECPNAHZ2A' | 'EC7VAFY4Q' | 'EC647Z33A' | 'ECQM7YUOQ' | 'ECIM7ZJCI' | 'EC2RAB7MY';
    /**
     * 分类
     * @default 'EC2FACYKQ'
     */
    subCollectionId_EC2FACYKQ: 'EC2FACYKQ' | 'ECHNAB4LY' | 'ECWQ7ZJGY' | 'ECPNAHZ2A' | 'EC7VAFY4Q' | 'EC647Z33A' | 'ECQM7YUOQ' | 'ECIM7ZJCI' | 'EC2RAB7MY';
    /**
     * 分类
     * @default 'ECYA7RAZQ'
     */
    subCollectionId_ECYA7RAZQ: 'ECYA7RAZQ' | 'EC5U7O7WY' | 'ECOY7WR4I' | 'ECRE7PJSQ' | 'ECMM7RKRA' | 'ECTE7TV3Y' | 'ECHQ7SAPY' | 'ECDM74KXY';
    /**
     * 分类
     * @default 'ECTE6EOZA'
     */
    subCollectionId_ECTE6EOZA: 'ECTE6EOZA' | 'ECUI6CVAI' | 'ECM46I42A' | 'ECPE6B6NI' | 'EC246FT6Y' | 'EC7I6GR6A' | 'EC3Q6JTOQ' | 'ECCU6NNCI';
    /**
     * 分类
     * @default 'ECWU56XUI'
     */
    subCollectionId_ECWU56XUI: 'ECWU56XUI' | 'ECQY6HRQQ' | 'ECMU6H5VY' | 'ECRY6I6FA' | 'EC2Y6BEGQ' | 'EC4U6BXLA' | 'ECRI533KQ' | 'ECR455GTQ';
    /**
     * 分类
     * @default 'ECOY56I6Y'
     */
    subCollectionId_ECOY56I6Y: 'ECOY56I6Y' | 'EC5U5X5FA' | 'ECEI6A5ZI' | 'ECZQ6AD6Y' | 'ECNI5ZBSQ' | 'ECGA6CUPA' | 'ECPY52QZY';
    /**
     * 分类
     * @default 'ECCM5TXSI'
     */
    subCollectionId_ECCM5TXSI: 'ECCM5TXSI' | 'ECSA5PTFI' | 'ECZU5SJAI' | 'ECBI5KPKY' | 'ECJM5OL6Y';
    /**
     * 分类
     * @default 'ECR4HOW3I'
     */
    subCollectionId_ECR4HOW3I: 'ECR4HOW3I' | 'ECS4HX5JI' | 'ECS4HX6GQ' | 'EC2AHUXEA' | 'ECR4HO7JA';
    /**
     * 分类
     * @default '2018_tv_23'
     */
    subCollectionId_2018_tv_23: '2018_tv_23' | '2018_tv_24' | '2018_tv_25' | '2018_tv_26' | '2018_tv_27' | '2018_tv_28' | '2018_tv_29';
    /**
     * 分类
     * @default '2017_tv_domestic_score'
     */
    subCollectionId_2017_tv_domestic_score: '2017_tv_domestic_score' | '2017_tv_american_score' | '2017_tv_743' | '2017_tv_740' | '2017_tv_741' | '2017_tv_706' | '2017_tv_707';
    /**
     * 分类
     * @default '2016_tv_478'
     */
    subCollectionId_2016_tv_478: '2016_tv_478' | '2016_tv_472' | '2016_tv_474' | '2016_tv_482' | '2016_tv_481' | '2016_tv_486' | '2016_tv_487';
    /**
     * 分类
     * @default '2015_tv_6'
     */
    subCollectionId_2015_tv_6: '2015_tv_6' | '2015_tv_7' | '2015_tv_13' | '2015_tv_14' | '2015_tv_15' | '2015_tv_60';
    /**
     * 分类
     * @default '2014_tv_14'
     */
    subCollectionId_2014_tv_14: '2014_tv_14' | '2014_tv_13' | '2014_tv_12' | '2014_tv_16' | '2014_tv_15';
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
type LoadDefaultCatalogParams = MovieHotGaiaLoadDefaultCatalogParams | MovieWeeklyBestLoadDefaultCatalogParams | MovieRealTimeHotestLoadDefaultCatalogParams | MovieTop250LoadDefaultCatalogParams | MovieShowingLoadDefaultCatalogParams | TvHotLoadDefaultCatalogParams | TvAnimationLoadDefaultCatalogParams | ShowHotLoadDefaultCatalogParams | TvRealTimeHotestLoadDefaultCatalogParams | TvChineseBestWeeklyLoadDefaultCatalogParams | TvGlobalBestWeeklyLoadDefaultCatalogParams | ShowChineseBestWeeklyLoadDefaultCatalogParams | ShowGlobalBestWeeklyLoadDefaultCatalogParams;
type LoadDefaultCatalogReturnType = MovieHotGaiaLoadDefaultCatalogReturnType | MovieWeeklyBestLoadDefaultCatalogReturnType | MovieRealTimeHotestLoadDefaultCatalogReturnType | MovieTop250LoadDefaultCatalogReturnType | MovieShowingLoadDefaultCatalogReturnType | TvHotLoadDefaultCatalogReturnType | TvAnimationLoadDefaultCatalogReturnType | ShowHotLoadDefaultCatalogReturnType | TvRealTimeHotestLoadDefaultCatalogReturnType | TvChineseBestWeeklyLoadDefaultCatalogReturnType | TvGlobalBestWeeklyLoadDefaultCatalogReturnType | ShowChineseBestWeeklyLoadDefaultCatalogReturnType | ShowGlobalBestWeeklyLoadDefaultCatalogReturnType;

/** 豆瓣热门电影 */
declare let loadDefaultCatalog: (params: LoadDefaultCatalogParams) => LoadDefaultCatalogReturnType | null | Promise<LoadDefaultCatalogReturnType | null>;

type LoadGenreCatalogParams = MovieGenreLoadGenreCatalogParams | TvGenreLoadGenreCatalogParams;
type LoadGenreCatalogReturnType = MovieGenreLoadGenreCatalogReturnType | TvGenreLoadGenreCatalogReturnType;

/** 电影类型榜 */
declare let loadGenreCatalog: (params: LoadGenreCatalogParams) => LoadGenreCatalogReturnType | null | Promise<LoadGenreCatalogReturnType | null>;

type LoadYearlyCatalogParams = MovieYearlyLoadYearlyCatalogParams | TvYearlyLoadYearlyCatalogParams;
type LoadYearlyCatalogReturnType = MovieYearlyLoadYearlyCatalogReturnType | TvYearlyLoadYearlyCatalogReturnType;

/** 豆瓣年度评分最高电影 */
declare let loadYearlyCatalog: (params: LoadYearlyCatalogParams) => LoadYearlyCatalogReturnType | null | Promise<LoadYearlyCatalogReturnType | null>;
