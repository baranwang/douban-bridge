import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { ImageProvider } from "@douban-bridge/contracts/image-providers";
import * as React from "react";
import { reorderImageProviders, toggleImageProvider } from "./image-provider-state";
import { PROVIDER_CONFIGS } from "./provider-configs";
import { SortableProviderItem } from "./sortable-provider-item";
import type { ImageProviderSortableProps } from "./types";

export const ImageProviderSortable: React.FC<ImageProviderSortableProps> = ({ value, onChange, disabled }) => {
  // 使用本地状态跟踪所有 provider 的显示顺序
  const [displayOrder, setDisplayOrder] = React.useState<string[]>(() => {
    // 初始化：已启用的在前（保持顺序），未启用的在后
    const enabledIds = value.map((provider) => provider.provider);
    const disabledIds = PROVIDER_CONFIGS.filter((config) => !enabledIds.includes(config.id)).map((config) => config.id);
    return [...enabledIds, ...disabledIds];
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // 根据 displayOrder 获取排序后的配置列表
  const sortedConfigs = displayOrder
    .map((id) => PROVIDER_CONFIGS.find((config) => config.id === id))
    .filter((config) => config !== undefined);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const oldIndex = displayOrder.indexOf(activeId);
    const newIndex = displayOrder.indexOf(overId);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newDisplayOrder = arrayMove(displayOrder, oldIndex, newIndex);
      setDisplayOrder(newDisplayOrder);
      onChange(reorderImageProviders(value, newDisplayOrder));
    }
  };

  const handleToggle = (providerId: string, enabled: boolean, defaultExtra: ImageProvider["extra"]) => {
    onChange(toggleImageProvider(value, { provider: providerId, extra: defaultExtra } as ImageProvider, enabled));
  };

  const handleExtraChange = (providerId: string, extra: ImageProvider["extra"]) => {
    onChange(
      value.map((provider) => {
        if (provider.provider === providerId) {
          return { ...provider, extra } as ImageProvider;
        }
        return provider;
      }),
    );
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={displayOrder} strategy={verticalListSortingStrategy}>
        {sortedConfigs.map((config) => {
          const provider = value.find((item) => item.provider === config.id);
          const isEnabled = !!provider;
          // 合并默认 extra，确保客户端动态默认值被应用
          // 只在客户端调用函数形式的 defaultExtra（避免服务端访问 window）
          const defaultExtra =
            typeof config.defaultExtra === "function"
              ? typeof window !== "undefined"
                ? config.defaultExtra()
                : {}
              : config.defaultExtra;
          const mergedProvider = provider
            ? { ...provider, extra: { ...defaultExtra, ...provider.extra } }
            : { provider: config.id, extra: defaultExtra };

          return (
            <SortableProviderItem
              key={config.id}
              provider={mergedProvider as ImageProvider}
              config={config}
              isEnabled={isEnabled}
              onToggle={(enabled) => handleToggle(config.id, enabled, defaultExtra)}
              onExtraChange={(extra) => handleExtraChange(config.id, extra)}
              disabled={disabled}
            />
          );
        })}
      </SortableContext>
    </DndContext>
  );
};
