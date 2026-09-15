import { Button } from "@douban-bridge/ui/components/button";
import { hc } from "hono/client";
import { Check, Star } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { Github } from "@/components/github-icon";
import type { PublicUser } from "@/libs/public-user";
import type { AuthRoute } from "@/routes/auth";

const client = hc<AuthRoute>("/auth");

export type StarContext = "rex" | "stremio";

/** Star 状态轮询：点击「去 Star」后开始检查，确认后跳回目标页。 */
export function useStarCheck(context: StarContext) {
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

  const starred = data?.hasStarred === true && Boolean(data.userId);

  useEffect(() => {
    if (!starred || !data?.userId) return;
    window.location.href = context === "rex" ? "/rex" : `/${data.userId}/configure`;
  }, [starred, data?.userId, context]);

  return {
    checking: isValidating || starred,
    onStarClick: useCallback(() => setHasClicked(true), []),
  };
}

interface StarBannerProps {
  user?: PublicUser;
  context: StarContext;
}

export const StarBanner: React.FC<StarBannerProps> = ({ user, context }) => {
  const { checking, onStarClick } = useStarCheck(context);

  if (user?.hasStarred) return null;

  const benefits =
    context === "rex"
      ? ["解锁完整列表与详情", "保存图片来源与语言偏好", "支持项目持续开发与维护"]
      : ["配置云同步，修改后无需更换 Manifest 链接", "保存图片来源与语言偏好", "支持项目持续开发与维护"];

  return (
    <div className="mt-3 rounded-xl border bg-card p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex flex-1 flex-col gap-2">
          <span className="font-medium text-sm">Star 项目解锁完整能力</span>
          <ul className="flex flex-col gap-1.5 text-muted-foreground text-sm">
            {benefits.map((text) => (
              <li key={text} className="flex items-start gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <StarCta user={user} checking={checking} onStarClick={onStarClick} className="w-full sm:w-auto" />
      </div>
    </div>
  );
};

interface StarCtaProps {
  user?: PublicUser;
  checking: boolean;
  onStarClick: () => void;
  className?: string;
}

/** 未登录 → 去登录；已登录未 Star → 去 GitHub Star，回到本页后自动确认。 */
export const StarCta: React.FC<StarCtaProps> = ({ user, checking, onStarClick, className }) => (
  <Button
    className={className}
    disabled={checking}
    render={
      user ? (
        <a
          href="https://github.com/baranwang/douban-bridge"
          target="_blank"
          rel="noopener noreferrer"
          onClick={onStarClick}
        />
      ) : (
        <a href="/auth/github" />
      )
    }
  >
    {user ? <Star className="size-4" /> : <Github className="size-4" />}
    {user ? (checking ? "确认中…" : "去 Star 解锁") : "GitHub 登录"}
  </Button>
);
