import type { ReactNode } from "react";
import type { ImageProvider } from "@/libs/config";

/** Provider 配置渲染函数的 props */
export interface ProviderConfigRenderProps<T extends ImageProvider["provider"]> {
  extra: ImageProvider<T>["extra"];
  onChange: (extra: ImageProvider<T>["extra"]) => void;
}

/** Provider 配置定义 */
export interface ProviderConfigDef<T extends ImageProvider["provider"] = ImageProvider["provider"]> {
  id: T;
  name: string;
  /** 默认 extra 配置，可以是对象或返回对象的函数（用于需要访问 window 等浏览器 API 的场景） */
  defaultExtra: ImageProvider<T>["extra"] | (() => ImageProvider<T>["extra"]);
  renderConfig?: (props: ProviderConfigRenderProps<T>) => ReactNode;
}

/** ImageProviderSortable 组件的 Props */
export interface ImageProviderSortableProps {
  value: ImageProvider[];
  onChange: (providers: ImageProvider[]) => void;
  disabled?: boolean;
}
