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
import { Item, ItemActions, ItemContent, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import type { IdName } from "@/libs/collections";

export interface GenreDrawerProps {
  /** 显示名称 */
  title: string;
  /** 类型列表 */
  items: IdName[];
  /** 当前选中的 catalogIds */
  catalogIds: string[];
  /** 切换选中状态的回调 */
  onToggle: (id: string, checked: boolean) => void;
}

export const GenreDrawer: FC<GenreDrawerProps> = ({ title, items, catalogIds, onToggle }) => {
  const [open, setOpen] = useState(false);

  // 计算选中的类型数量
  const selectedCount = items.filter((item) => catalogIds.includes(item.id)).length;

  // 获取当前选中状态的描述文字
  const getStatusText = () => {
    if (selectedCount > 0) {
      return `已选 ${selectedCount} 个`;
    }
    return "未选择";
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
          <DrawerDescription>选择要显示的类型榜单</DrawerDescription>
        </DrawerHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <ItemGroup className="rounded-lg border">
            {items.map((item, index, array) => (
              <Fragment key={item.id}>
                <Item size="sm" asChild>
                  <label>
                    <ItemContent>
                      <ItemTitle>{item.name}</ItemTitle>
                    </ItemContent>
                    <ItemActions>
                      <Switch
                        checked={catalogIds.includes(item.id)}
                        onCheckedChange={(checked) => onToggle(item.id, checked)}
                      />
                    </ItemActions>
                  </label>
                </Item>
                {index !== array.length - 1 && <ItemSeparator />}
              </Fragment>
            ))}
          </ItemGroup>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
