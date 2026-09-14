import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ImageProvider } from "@douban-bridge/contracts/image-providers";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@douban-bridge/ui/components/drawer";
import { Item, ItemActions, ItemContent, ItemSeparator, ItemTitle } from "@douban-bridge/ui/components/item";
import { Switch } from "@douban-bridge/ui/components/switch";
import { GripVertical, Settings2 } from "lucide-react";
import * as React from "react";
import type { ProviderConfig } from "./provider-configs";

interface SortableProviderItemProps {
  provider: ImageProvider;
  config: ProviderConfig;
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  onExtraChange: (extra: ImageProvider["extra"]) => void;
  disabled?: boolean;
  showSeparator?: boolean;
}

export const SortableProviderItem: React.FC<SortableProviderItemProps> = ({
  provider,
  config,
  isEnabled,
  onToggle,
  onExtraChange,
  disabled,
  showSeparator,
}) => {
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // 使用本地状态管理 extra，确保输入框能正确响应
  const [localExtra, setLocalExtra] = React.useState<ImageProvider["extra"]>(provider.extra);

  // 使用 ref 来跟踪是否是本地更新，避免循环
  const isLocalUpdateRef = React.useRef(false);

  // 当外部 provider.extra 变化且不是本地更新引起的时，同步到本地
  React.useEffect(() => {
    if (!isLocalUpdateRef.current) {
      setLocalExtra(provider.extra);
    }
    isLocalUpdateRef.current = false;
  }, [provider.extra]);

  // 处理本地 extra 变化
  const handleLocalExtraChange = React.useCallback(
    (newExtra: ImageProvider["extra"]) => {
      isLocalUpdateRef.current = true;
      setLocalExtra(newExtra);
      onExtraChange(newExtra);
    },
    [onExtraChange],
  );

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: config.id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <>
      <div ref={setNodeRef} style={style}>
        <Item size="sm">
          <button
            type="button"
            aria-label={`调整 ${config.name} 优先级`}
            className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
          <ItemContent>
            <ItemTitle className={disabled && !isEnabled ? "text-muted-foreground" : undefined}>
              {config.name}
            </ItemTitle>
          </ItemContent>
          <ItemActions>
            {/* 配置按钮 - 只有启用且有配置项时才显示 */}
            {isEnabled && config.renderConfig && (
              <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
                <DrawerTrigger
                  render={
                    <button
                      type="button"
                      aria-label={`配置 ${config.name}`}
                      className="p-1 text-muted-foreground hover:text-foreground"
                    />
                  }
                >
                  <Settings2 className="size-4" />
                </DrawerTrigger>
                <DrawerContent className="h-4/5">
                  <DrawerHeader>
                    <DrawerTitle>{config.name} 配置</DrawerTitle>
                  </DrawerHeader>
                  <div className="px-4 pb-6">
                    {config.renderConfig({
                      extra: localExtra as never,
                      onChange: handleLocalExtraChange as never,
                    })}
                  </div>
                </DrawerContent>
              </Drawer>
            )}
            <Switch
              aria-label={`启用 ${config.name}`}
              checked={isEnabled}
              disabled={disabled}
              onCheckedChange={onToggle}
            />
          </ItemActions>
        </Item>
      </div>
      {showSeparator && <ItemSeparator />}
    </>
  );
};
