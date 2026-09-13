import { hc } from "hono/client";
import { Check, Github, Star } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { User } from "@/db";
import type { AuthRoute } from "@/routes/auth";

const client = hc<AuthRoute>("/auth");

interface StarBannerProps {
  user?: User;
}

export const StarBanner: React.FC<StarBannerProps> = ({ user }) => {
  const [hasClicked, setHasClicked] = useState(false);
  const $get = client["check-star"].$get;

  const { data, isValidating } = useSWR(
    hasClicked ? "check-star" : null, // 只有点击后才启用
    async () => {
      const res = await $get();
      return res.json();
    },
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      refreshInterval: 0,
      dedupingInterval: 1000,
    },
  );

  const handleClick = useCallback(() => {
    setHasClicked(true);
  }, []);

  const alert = useMemo(() => {
    if (user?.hasStarred) {
      return null;
    }
    return (
      <div className="-mx-2 relative mt-3 overflow-hidden rounded-xl bg-neutral-900 p-4">
        {/* 装饰性星星 */}
        <div className="-right-4 -top-4 pointer-events-none absolute text-neutral-700/50">
          <Star className="size-24" fill="currentColor" />
        </div>
        <div className="pointer-events-none absolute right-16 bottom-2 text-neutral-700/30">
          <Star className="size-8" fill="currentColor" />
        </div>

        <div className="relative z-10 flex items-start gap-4">
          {/* 内容区域 */}
          <div className="flex flex-1 flex-col gap-2">
            <span className="font-bold text-neutral-100">✨ Star 项目解锁专属特权</span>
            <ul className="flex flex-col gap-1.5 text-neutral-400 text-xs">
              {[
                "配置云同步，修改后无需更换 Manifest 链接",
                "更高的 API 请求限额，减少限流等待时间",
                "支持项目持续开发与维护",
              ].map((text) => (
                <li key={text} className="flex items-center gap-2">
                  <Check className="size-3.5 shrink-0 text-neutral-300" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* CTA 按钮 */}
          <Button size="sm" className="shrink-0 bg-neutral-100 font-semibold text-neutral-900 hover:bg-white" asChild>
            {user ? (
              <a
                href="https://github.com/baranwang/stremio-addon-douban"
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleClick}
              >
                <Star className="size-4" />
                <span>去 Star 解锁</span>
              </a>
            ) : (
              <a href="/auth/github">
                <Github className="size-4" />
                <span>GitHub 登录</span>
              </a>
            )}
          </Button>
        </div>
      </div>
    );
  }, [user, handleClick]);

  // 如果已 Star，跳转到新 URL
  if (data?.hasStarred && data?.userId) {
    window.location.href = `/${data.userId}/configure`;
    return null;
  }

  return (
    <>
      {/* Loading 遮罩 */}
      {isValidating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="flex items-center gap-3 rounded-lg bg-background p-4 shadow-lg">
            <Spinner />
          </div>
        </div>
      )}

      {alert}
    </>
  );
};
