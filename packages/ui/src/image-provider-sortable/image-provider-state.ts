import type { ImageProvider } from "@douban-bridge/contracts/image-providers";

export function reorderImageProviders(value: ImageProvider[], displayOrder: string[]): ImageProvider[] {
  const byId = new Map(value.map((provider) => [provider.provider, provider]));
  return displayOrder.flatMap((id) => {
    const provider = byId.get(id);
    return provider ? [provider] : [];
  });
}

export function toggleImageProvider(
  value: ImageProvider[],
  provider: ImageProvider,
  enabled: boolean,
): ImageProvider[] {
  if (enabled) {
    return value.some((item) => item.provider === provider.provider) ? value : [...value, provider];
  }
  return value.length <= 1 ? value : value.filter((item) => item.provider !== provider.provider);
}
