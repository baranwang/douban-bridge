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
import { toast } from "@douban-bridge/ui/components/toast";
import { Copy } from "lucide-react";
import { useCallback } from "react";
import { SettingSection } from "@/components/setting-section";
import { useSchemeLaunch } from "@/libs/use-scheme-launch";

const WIDGET_URL = "https://unpkg.com/@rexnow/douban";
const WIDGET_SCHEME = `rex://widget/?url=${WIDGET_URL}`;

export const InstallWidget: React.FC = () => {
  const launch = useSchemeLaunch("未检测到 Rex，请复制链接后在 Rex 中手动添加");

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(WIDGET_URL);
      toast.add({ title: "链接已复制到剪贴板", type: "success" });
    } catch {
      toast.add({ title: "复制失败", type: "error" });
    }
  }, []);

  return (
    <SettingSection title="安装 Widget">
      <ItemGroup>
        <Item data-section="install-widget" variant="outline">
          <ItemMedia variant="image">
            <img src="/icon.png" alt="" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>豆瓣榜单</ItemTitle>
            <ItemDescription>@rexnow/douban</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button variant="outline" size="icon" aria-label="复制链接" onClick={copy}>
              <Copy />
            </Button>
            <Button render={<a href={WIDGET_SCHEME} />} onClick={launch}>
              {/* rex-mark 是纯黑图形，这里永远压在 primary 底色上，所以无条件反色 */}
              <img src="/rex-mark.png" alt="" className="size-4 invert" />在 Rex 中安装
            </Button>
          </ItemActions>
        </Item>
      </ItemGroup>
    </SettingSection>
  );
};
