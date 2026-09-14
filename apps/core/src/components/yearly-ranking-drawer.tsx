import { ChevronRight } from "lucide-react";
import { type FC, Fragment, useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import { YEARLY_RANKINGS, type YearlyRankingItem } from "@/libs/collections";

export interface YearlyRankingDrawerProps {
  /** 年度榜单的虚拟 ID，如 MOVIE_YEARLY_RANKING_ID */
  yearlyRankingId: keyof typeof YEARLY_RANKINGS;
  /** 显示名称 */
  title: string;
  /** 当前选中的 catalogIds */
  catalogIds: string[];
  /** 切换选中状态的回调 */
  onToggle: (id: string, checked: boolean) => void;
}

export const YearlyRankingDrawer: FC<YearlyRankingDrawerProps> = ({ yearlyRankingId, title, catalogIds, onToggle }) => {
  const [open, setOpen] = useState(false);

  const isDynamicEnabled = catalogIds.includes(yearlyRankingId);
  const yearlyItems = YEARLY_RANKINGS[yearlyRankingId] ?? [];

  // 计算选中的年份数量（不包括动态榜单本身）
  const selectedYearCount = yearlyItems.filter((item) => catalogIds.includes(item.id)).length;

  // 获取当前选中状态的描述文字
  const getStatusText = () => {
    if (isDynamicEnabled) {
      return "自动获取最新";
    }
    if (selectedYearCount > 0) {
      return `已选 ${selectedYearCount} 个年份`;
    }
    return "未选择";
  };

  const handleDynamicToggle = (checked: boolean) => {
    onToggle(yearlyRankingId, checked);
    // 如果开启动态，清除所有单独选中的年份
    if (checked) {
      for (const item of yearlyItems) {
        if (catalogIds.includes(item.id)) {
          onToggle(item.id, false);
        }
      }
    }
  };

  const handleYearToggle = (item: YearlyRankingItem, checked: boolean) => {
    onToggle(item.id, checked);
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Item size="sm" className="cursor-pointer">
          <ItemContent>
            <ItemTitle>{title}</ItemTitle>
          </ItemContent>
          <ItemActions>
            <span className="text-muted-foreground text-sm">{getStatusText()}</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </ItemActions>
        </Item>
      </DrawerTrigger>
      <DrawerContent className="h-4/5">
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>选择自动获取最新榜单，或手动选择特定年份</DrawerDescription>
        </DrawerHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <ItemGroup className="rounded-lg border">
            {/* 动态榜单开关 */}
            <Item size="sm" asChild>
              <label>
                <ItemContent>
                  <ItemTitle>自动获取最新</ItemTitle>
                  <ItemDescription>开启后将自动显示最新年份的榜单</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Switch checked={isDynamicEnabled} onCheckedChange={handleDynamicToggle} />
                </ItemActions>
              </label>
            </Item>

            {/* 年份列表（仅在关闭动态时显示） */}
            {!isDynamicEnabled && (
              <>
                <ItemSeparator />
                <div className="px-4 py-2">
                  <span className="text-muted-foreground text-xs">或选择特定年份</span>
                </div>
                {yearlyItems.map((item, index, array) => (
                  <Fragment key={item.id}>
                    <Item size="sm" asChild>
                      <label>
                        <ItemContent>
                          <ItemTitle>{item.name}</ItemTitle>
                        </ItemContent>
                        <ItemActions>
                          <Switch
                            checked={catalogIds.includes(item.id)}
                            onCheckedChange={(checked) => handleYearToggle(item, checked)}
                          />
                        </ItemActions>
                      </label>
                    </Item>
                    {index !== array.length - 1 && <ItemSeparator />}
                  </Fragment>
                ))}
              </>
            )}
          </ItemGroup>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
