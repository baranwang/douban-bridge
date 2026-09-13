import { useForm } from "@tanstack/react-form";
import { isEqual } from "es-toolkit";
import { hc } from "hono/client";
import { Copy, Film, Image, Settings, Tv } from "lucide-react";
import { type FC, Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { Toaster } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import type { User } from "@/db";
import {
  COLLECTION_CONFIGS,
  isYearlyRankingId,
  MOVIE_GENRE_CONFIGS,
  MOVIE_YEARLY_RANKING_ID,
  TV_GENRE_CONFIGS,
  TV_YEARLY_RANKING_ID,
} from "@/libs/collections";
import type { Config } from "@/libs/config";
import type { ConfigureRoute } from "@/routes/configure";
import { GenreDrawer } from "../genre-drawer";
import { ImageProviderSortable } from "../image-provider-sortable";
import { SettingSection } from "../setting-section";
import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Spinner } from "../ui/spinner";
import { YearlyRankingDrawer } from "../yearly-ranking-drawer";
import { ConfigureContext } from "./context";

export interface ConfigureProps {
  config: Config;
  manifestUrl: string;
  user?: User;
}

const client = hc<ConfigureRoute>("/configure");

export const Configure: FC<ConfigureProps> = ({ config: initialConfig, manifestUrl: initialManifestUrl, user }) => {
  const [manifestUrl, setManifestUrl] = useState(initialManifestUrl);
  const [savedConfig, setSavedConfig] = useState(initialConfig);
  const isStarredUser = !!user?.hasStarred;

  const form = useForm({
    defaultValues: initialConfig,
    onSubmit: async ({ value }) => {
      try {
        const res = await client.index.$post({ json: value });
        const result = await res.json();
        if (result.success && result.manifestUrl) {
          setManifestUrl(result.manifestUrl);
          setSavedConfig(value); // 更新已保存的配置
          toast.success(isStarredUser ? "配置已保存" : "配置链接已生成");
        } else {
          toast.error("保存失败");
        }
      } catch {
        toast.error("保存失败，请稍后重试");
      }
    },
  });

  // 监听页面离开事件，提示未保存的改动
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // 对比当前值与最后保存的配置
      const hasChanges = !isEqual(form.state.values, savedConfig);
      if (hasChanges) {
        e.preventDefault();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [form, savedConfig]);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("链接已复制到剪贴板");
    } catch {
      toast.error("复制失败");
    }
  }, []);

  const handleImport = useCallback(() => {
    let didBlur = false;

    const handleBlur = () => {
      didBlur = true;
    };

    window.addEventListener("blur", handleBlur);

    setTimeout(() => {
      window.removeEventListener("blur", handleBlur);
      if (!didBlur) {
        toast.error("未检测到支持的应用，请确保已安装兼容 stremio 协议的应用");
      }
    }, 1000);
  }, []);

  // 创建类型榜单 ID 集合，用于过滤
  const movieGenreIds = useMemo(() => new Set(MOVIE_GENRE_CONFIGS.map((c) => c.id)), []);
  const tvGenreIds = useMemo(() => new Set(TV_GENRE_CONFIGS.map((c) => c.id)), []);

  const getConfigsByType = useCallback(
    (type: "movie" | "series") => {
      const genreIds = type === "movie" ? movieGenreIds : tvGenreIds;
      // 过滤掉类型榜单和年度榜单，它们会单独渲染为抽屉
      return COLLECTION_CONFIGS.filter((c) => c.type === type && !genreIds.has(c.id) && !isYearlyRankingId(c.id));
    },
    [movieGenreIds, tvGenreIds],
  );

  const movieConfigs = useMemo(() => getConfigsByType("movie"), [getConfigsByType]);
  const seriesConfigs = useMemo(() => getConfigsByType("series"), [getConfigsByType]);

  const manifestUrlConfigs = useMemo(() => {
    const stremioUrl = manifestUrl.replace(/^https?:\/\//, "stremio://");
    const forwardUrl = new URL("forward://stremio");
    forwardUrl.searchParams.set("url", manifestUrl);
    return {
      stremio: stremioUrl,
      forward: forwardUrl.toString(),
    };
  }, [manifestUrl]);

  return (
    <ConfigureContext.Provider value={{ isStarredUser }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="flex h-full flex-col"
      >
        {/* 中间：可滚动的列表 */}
        <div className="relative flex-1 overflow-hidden">
          <div className="h-full space-y-4 overflow-y-auto pb-4">
            <div className="page-container space-y-4 px-4">
              {/* 通用模块 */}
              <SettingSection title="通用" icon={<Settings className="size-4 text-muted-foreground" />}>
                <ItemGroup className="rounded-lg border">
                  {/* 动态集合 */}
                  <form.Field name="dynamicCollections">
                    {(field) => (
                      <Item size="sm">
                        <ItemContent>
                          <ItemTitle>启用动态集合</ItemTitle>
                          <ItemDescription>豆瓣会不定期更新一些集合，启用后会自动添加</ItemDescription>
                        </ItemContent>
                        <ItemActions>
                          <Switch name={field.name} checked={field.state.value} onCheckedChange={field.handleChange} />
                        </ItemActions>
                      </Item>
                    )}
                  </form.Field>
                </ItemGroup>
              </SettingSection>

              {/* 图片提供商模块 */}
              <SettingSection
                title="图片来源"
                icon={<Image className="size-4 text-muted-foreground" />}
                footer="拖动排序调整优先级，排在前面的图片来源将优先使用"
              >
                <ItemGroup className="rounded-lg border">
                  <form.Field name="imageProviders" mode="array">
                    {(field) => (
                      <ImageProviderSortable
                        value={field.state.value}
                        onChange={field.handleChange}
                        disabled={!user?.hasStarred}
                      />
                    )}
                  </form.Field>
                </ItemGroup>
              </SettingSection>

              <form.Field name="catalogIds" mode="array">
                {(field) => {
                  const handleChange = (id: string, checked: boolean) => {
                    field.handleChange((prev) => (checked ? [...prev, id] : prev.filter((i) => i !== id)));
                  };

                  const renderCatalogItems = (items: typeof movieConfigs) =>
                    items.map((item, index, array) => (
                      <Fragment key={item.id}>
                        <Item size="sm" asChild>
                          <label>
                            <ItemContent>
                              <ItemTitle>{item.name}</ItemTitle>
                            </ItemContent>
                            <ItemActions>
                              <Switch
                                checked={field.state.value.includes(item.id)}
                                onCheckedChange={(checked) => handleChange(item.id, checked)}
                              />
                            </ItemActions>
                          </label>
                        </Item>
                        {index !== array.length - 1 && <ItemSeparator />}
                      </Fragment>
                    ));

                  return (
                    <>
                      {/* 电影分类 */}
                      <SettingSection title="电影" icon={<Film className="size-4 text-muted-foreground" />}>
                        <ItemGroup className="rounded-lg border">
                          {renderCatalogItems(movieConfigs)}
                          <ItemSeparator />
                          <GenreDrawer
                            title="电影类型榜"
                            items={MOVIE_GENRE_CONFIGS}
                            catalogIds={field.state.value}
                            onToggle={handleChange}
                          />
                          <ItemSeparator />
                          <YearlyRankingDrawer
                            yearlyRankingId={MOVIE_YEARLY_RANKING_ID}
                            title="豆瓣年度评分最高电影"
                            catalogIds={field.state.value}
                            onToggle={handleChange}
                          />
                        </ItemGroup>
                      </SettingSection>

                      {/* 剧集分类 */}
                      <SettingSection title="剧集" icon={<Tv className="size-4 text-muted-foreground" />}>
                        <ItemGroup className="rounded-lg border">
                          {renderCatalogItems(seriesConfigs)}
                          <ItemSeparator />
                          <GenreDrawer
                            title="剧集类型榜"
                            items={TV_GENRE_CONFIGS}
                            catalogIds={field.state.value}
                            onToggle={handleChange}
                          />
                          <ItemSeparator />
                          <YearlyRankingDrawer
                            yearlyRankingId={TV_YEARLY_RANKING_ID}
                            title="豆瓣年度评分最高剧集"
                            catalogIds={field.state.value}
                            onToggle={handleChange}
                          />
                        </ItemGroup>
                      </SettingSection>
                    </>
                  );
                }}
              </form.Field>
            </div>
          </div>

          {/* 底部渐变遮罩 */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-t from-background to-transparent" />
        </div>

        {/* 底部：固定操作区 */}
        <div className="page-container shrink-0 px-4 pt-4">
          <form.Subscribe selector={(state) => [state.values.catalogIds, state.isSubmitting, state.values] as const}>
            {([catalogIds, isSubmitting, values]) => {
              const isNoneSelected = catalogIds.length === 0;
              const hasChanges = !isEqual(values, savedConfig);

              const saveButtonText = isStarredUser ? "保存配置" : "生成配置链接";
              const loadingText = isStarredUser ? "保存中..." : "生成中...";

              return (
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    className="flex-2"
                    size="lg"
                    disabled={isNoneSelected || !hasChanges || isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Spinner />
                        {loadingText}
                      </>
                    ) : (
                      saveButtonText
                    )}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="lg" className="flex-1">
                        安装
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => copyToClipboard(manifestUrl)}>
                        <Copy />
                        复制链接
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild onClick={handleImport}>
                        <a href={manifestUrlConfigs.stremio}>
                          <img className="size-4" src="https://www.stremio.com/website/stremio-logo-small.png" />
                          导入 Stremio
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild onClick={handleImport}>
                        <a href={manifestUrlConfigs.forward}>
                          <img className="size-4" src="https://forward.inch.red/favicon.ico" />
                          导入 Forward
                        </a>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            }}
          </form.Subscribe>
        </div>
      </form>
      <Toaster />
    </ConfigureContext.Provider>
  );
};
