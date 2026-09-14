import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { type FC, useState } from "react";
import type { ImageProvider } from "@/libs/config";
import { PROVIDER_CONFIGS } from "./provider-configs";
import { SortableProviderItem } from "./sortable-provider-item";
import type { ImageProviderSortableProps } from "./types";

export const ImageProviderSortable: FC<ImageProviderSortableProps> = ({ value, onChange, disabled }) => {
  // 使用本地状态跟踪所有 provider 的显示顺序
  const [displayOrder, setDisplayOrder] = useState<string[]>(() => {
    // 初始化：已启用的在前（保持顺序），未启用的在后
    const enabledIds = value.map((p) => p.provider);
    const disabledIds = PROVIDER_CONFIGS.filter((c) => !enabledIds.includes(c.id)).map((c) => c.id);
    return [...enabledIds, ...disabledIds];
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  // 根据 displayOrder 获取排序后的配置列表
  const sortedConfigs = displayOrder
    .map((id) => PROVIDER_CONFIGS.find((c) => c.id === id))
    .filter((c) => c !== undefined);

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

      // 同步更新 value 数组中已启用 provider 的顺序
      const newValue = newDisplayOrder
        .map((id) => value.find((p) => p.provider === id))
        .filter((p): p is ImageProvider => p !== undefined);
      onChange(newValue);
    }
  };

  const handleToggle = (providerId: string, enabled: boolean, defaultExtra?: ImageProvider["extra"]) => {
    if (enabled) {
      // 添加到末尾
      if (defaultExtra !== undefined) {
        onChange([...value, { provider: providerId, extra: defaultExtra } as ImageProvider]);
      }
    } else {
      // 防止关闭最后一个提供商
      if (value.length <= 1) return;
      // 移除
      onChange(value.filter((p) => p.provider !== providerId));
    }
  };

  const handleExtraChange = (providerId: string, extra: ImageProvider["extra"]) => {
    onChange(
      value.map((p) => {
        if (p.provider === providerId) {
          return { ...p, extra } as ImageProvider;
        }
        return p;
      }),
    );
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={displayOrder} strategy={verticalListSortingStrategy}>
        {sortedConfigs.map((config, index) => {
          const provider = value.find((p) => p.provider === config.id);
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
              showSeparator={index < sortedConfigs.length - 1}
            />
          );
        })}
      </SortableContext>
    </DndContext>
  );
};
