import { Button } from "@douban-bridge/ui/components/button";
import { Check } from "lucide-react";
import { StarCta } from "@/components/star-banner";
import type { PublicUser } from "@/libs/public-user";

const BASIC = ["浏览豆瓣目录与详情", "逐条现查 TMDB，慢且会猜错", "图片固定用豆瓣，不可调整"];
const FULL = ["映射经大模型与人工校准，海报和详情不会张冠李戴", "图片来源可选可排序", "整页一次返回并缓存，列表秒开"];

export const ModeComparison: React.FC<{ user?: PublicUser }> = ({ user }) => {
  return (
    <section aria-labelledby="rex-full-mode-title">
      <h2 id="rex-full-mode-title" className="font-semibold text-lg">
        启用完整模式
      </h2>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col rounded-xl border p-4">
          <span className="font-medium text-sm">基础模式</span>
          <p className="mt-1.5 text-muted-foreground text-sm">Widget 直接请求豆瓣，装上就能用。</p>
          <p className="mt-4 font-medium text-sm">无需登录</p>
          <Button className="mt-3 w-full text-muted-foreground" variant="outline" disabled>
            当前正在使用
          </Button>
          <ul className="mt-4 flex flex-col gap-2 text-muted-foreground text-sm">
            {BASIC.map((text) => (
              <li key={text} className="flex items-start gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col rounded-xl border border-primary/40 bg-primary/5 p-4">
          <span className="font-medium text-sm">完整模式</span>
          <p className="mt-1.5 text-muted-foreground text-sm">请求经过 Douban Bridge，用校准过的映射库。</p>
          <p className="mt-4 font-medium text-sm">{user ? "Star 项目" : "登录并 Star 项目"}</p>
          <StarCta user={user} context="rex" className="mt-3 w-full" />
          <p className="mt-4 font-medium text-sm">基础模式全部能力，以及：</p>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {FULL.map((text) => (
              <li key={text} className="flex items-start gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};
