import { Button } from "@douban-bridge/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@douban-bridge/ui/components/item";
import { ChevronRight } from "lucide-react";
import { Github } from "@/components/github-icon";
import { PageShell } from "@/components/page-shell";
import type { PublicUser } from "@/libs/public-user";

export interface PortalProps {
  user?: PublicUser;
  stremioConfigureUrl: string;
}

export function Portal({ user, stremioConfigureUrl }: PortalProps) {
  return (
    <PageShell
      title="Douban Bridge"
      description="把豆瓣目录接入你正在使用的播放器"
      actions={
        user ? (
          <div id="user-menu" className="size-8" />
        ) : (
          <Button variant="ghost" size="sm" render={<a href="/auth/github" />}>
            <Github className="size-4" />
            GitHub 登录
          </Button>
        )
      }
    >
      <ItemGroup className="mt-9 gap-3">
        <Item data-product="rex" variant="outline" render={<a href="/rex" />}>
          <ItemMedia>
            <img src="/rex-mark.png" alt="" className="size-9 dark:invert" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="text-base">Rex</ItemTitle>
            <ItemDescription>
              在 Rex 中浏览豆瓣完整列表与详情。基础模式可直接使用，登录后可启用完整模式。
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover/item:translate-x-0.5" />
          </ItemActions>
        </Item>

        <Item data-product="stremio" variant="outline" render={<a href={stremioConfigureUrl} />}>
          <ItemMedia>
            <img src="/stremio-logo.png" alt="" className="size-9" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="text-base">Stremio</ItemTitle>
            <ItemDescription>选择目录并生成 Manifest，然后导入 Stremio 或 Forward。</ItemDescription>
          </ItemContent>
          <ItemActions>
            <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover/item:translate-x-0.5" />
          </ItemActions>
        </Item>
      </ItemGroup>

      <div className="mt-8 flex items-center border-t pt-5">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2.5 text-muted-foreground hover:text-foreground"
          render={
            <a
              href="https://github.com/baranwang/douban-bridge"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="在 GitHub 上查看 Douban Bridge"
            />
          }
        >
          <Github className="size-3.5" />
          GitHub
        </Button>
      </div>
    </PageShell>
  );
}
