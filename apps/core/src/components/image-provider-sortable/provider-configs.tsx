import { forwardRef, useState } from "react";
import { TMDB_IMAGE_LANGUAGE } from "@/libs/api/tmdb/constants";
import { TmdbLanguageSortable } from "../tmdb-language-sortable";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "../ui/input-group";
import { Item, ItemContent, ItemDescription, ItemTitle } from "../ui/item";
import type { ProviderConfigDef } from "./types";

const InputGroupPassword = forwardRef<HTMLInputElement, React.ComponentProps<typeof InputGroupInput>>((props, ref) => {
  const [isFocus, setIsFocus] = useState(false);
  return (
    <InputGroupInput
      {...props}
      type={isFocus ? "text" : "password"}
      onFocus={() => setIsFocus(true)}
      onBlur={() => setIsFocus(false)}
      ref={ref}
    />
  );
});

/** 豆瓣配置 */
export const doubanConfig: ProviderConfigDef<"douban"> = {
  id: "douban",
  name: "豆瓣",
  defaultExtra: {},
};

/** Fanart 配置 */
export const fanartConfig: ProviderConfigDef<"fanart"> = {
  id: "fanart",
  name: "Fanart.tv",
  defaultExtra: {},
  renderConfig: ({ extra, onChange }) => {
    return (
      <Item size="sm">
        <ItemContent className="flex-1">
          <ItemTitle>API 密钥（可选）</ItemTitle>
          <ItemDescription>
            未提供密钥仅显示 7 天前过审图片，提供后缩短至 48 小时，VIP 为 10 分钟。
            <a href="https://wiki.fanart.tv/General/personal%20api/" target="_blank" rel="noreferrer">
              了解更多
            </a>
          </ItemDescription>
          <InputGroup className="mt-2">
            <InputGroupPassword
              placeholder="请输入你的 API 密钥"
              value={extra.apiKey ?? ""}
              onChange={(e) => onChange({ ...extra, apiKey: e.target.value || undefined })}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton asChild>
                <a href="https://fanart.tv/get-an-api-key/" target="_blank" rel="noreferrer">
                  获取 API 密钥
                </a>
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </ItemContent>
      </Item>
    );
  },
};

/** TMDB 配置 */
export const tmdbConfig: ProviderConfigDef<"tmdb"> = {
  id: "tmdb",
  name: "TMDB",
  defaultExtra: {
    imageLanguages: TMDB_IMAGE_LANGUAGE,
  },
  renderConfig: ({ extra, onChange }) => (
    <>
      <Item size="sm">
        <ItemContent className="flex-1">
          <ItemTitle>API 读访问令牌（可选）</ItemTitle>
          <ItemDescription>
            不提供令牌则使用系统默认令牌。
            <a href="https://www.themoviedb.org/documentation/api" target="_blank" rel="noreferrer">
              了解更多
            </a>
          </ItemDescription>
          <InputGroup className="mt-2">
            <InputGroupPassword
              placeholder="请输入你的 API 读访问令牌"
              value={extra.apiKey ?? ""}
              onChange={(e) => onChange({ ...extra, apiKey: e.target.value || undefined })}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton asChild>
                <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">
                  获取令牌
                </a>
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </ItemContent>
      </Item>
      <TmdbLanguageSortable
        value={extra.imageLanguages ?? TMDB_IMAGE_LANGUAGE}
        onChange={(imageLanguages) => onChange({ ...extra, imageLanguages })}
      />
    </>
  ),
};

export const PROVIDER_CONFIGS = [fanartConfig, tmdbConfig, doubanConfig] as const;
export type ProviderConfig = (typeof PROVIDER_CONFIGS)[number];
