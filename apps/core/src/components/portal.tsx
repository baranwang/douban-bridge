import { Button } from "@douban-bridge/ui/components/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@douban-bridge/ui/components/card";
import { Github } from "@/components/github-icon";
import type { PublicUser } from "@/libs/public-user";

export interface PortalProps {
  user?: PublicUser;
  stremioConfigureUrl: string;
}

export function Portal({ user, stremioConfigureUrl }: PortalProps) {
  return (
    <div className="min-h-dvh bg-muted/30">
      <div className="page-container flex min-h-dvh flex-col px-4 py-8 sm:py-12">
        <header className="mb-10 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-balance font-bold text-2xl tracking-tight sm:text-3xl">Douban Bridge</h1>
            <p className="mt-2 text-balance text-muted-foreground">把豆瓣目录接入你正在使用的播放器</p>
          </div>
          <a
            href="https://github.com/baranwang/douban-bridge"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="在 GitHub 上查看 Douban Bridge"
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 font-medium text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Github className="size-4" />
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </header>

        <main className="flex flex-1 flex-col justify-center">
          <div className="space-y-4">
            <Card data-product="rex" className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="mx-6 mt-6 flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10 sm:mr-0 sm:mb-6">
                <img src="/rex-mark.png" alt="" className="size-7" />
              </div>
              <CardHeader className="min-w-0 flex-1">
                <CardTitle>Rex</CardTitle>
                <CardDescription>
                  在 Rex 中浏览豆瓣完整列表与详情。基础模式可直接使用，登录后可启用云端能力。
                </CardDescription>
              </CardHeader>
              <CardFooter className="shrink-0 sm:pl-0">
                <Button className="w-full sm:w-auto" render={<a href="/rex" />}>
                  设置 Rex
                </Button>
              </CardFooter>
            </Card>

            <Card data-product="stremio" className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="mx-6 mt-6 flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted sm:mr-0 sm:mb-6">
                <img src="/stremio-logo.png" alt="" className="size-7" />
              </div>
              <CardHeader className="min-w-0 flex-1">
                <CardTitle>Stremio</CardTitle>
                <CardDescription>选择目录并生成 Manifest，然后导入 Stremio 或 Forward。</CardDescription>
              </CardHeader>
              <CardFooter className="shrink-0 sm:pl-0">
                <Button className="w-full sm:w-auto" variant="outline" render={<a href={stremioConfigureUrl} />}>
                  配置 Stremio
                </Button>
              </CardFooter>
            </Card>
          </div>

          <div className="mt-8 flex flex-col items-start justify-between gap-4 border-t pt-6 sm:flex-row sm:items-center">
            <p className="max-w-2xl text-muted-foreground text-sm">
              登录不是浏览入口的前置条件；仅在同步 Stremio 配置或启用 Rex 云端能力时需要。
            </p>
            <Button variant="ghost" render={<a href={user ? "/rex" : "/auth/github"} />}>
              {user?.githubLogin ?? "使用 GitHub 登录"}
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
}
