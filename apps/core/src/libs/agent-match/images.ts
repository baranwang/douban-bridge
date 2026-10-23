import { fetchDoubanImage, isAllowedDoubanImageUrl } from "@/libs/douban-image";

export type MatchImage = { data: string; mimeType: string };

const MAX_IMAGE_BYTES = 512 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isAllowedMatchImageUrl(url: string): boolean {
  if (isAllowedDoubanImageUrl(url)) return true;
  try {
    const image = new URL(url);
    return (
      image.protocol === "https:" &&
      !image.username &&
      !image.password &&
      (!image.port || image.port === "443") &&
      image.hostname === "image.tmdb.org"
    );
  } catch {
    return false;
  }
}

export async function fetchMatchImage(url: string): Promise<MatchImage | null> {
  if (!isAllowedMatchImageUrl(url)) return null;
  const response = isAllowedDoubanImageUrl(url)
    ? await fetchDoubanImage(url)
    : await fetch(url, { redirect: "manual" });
  if (!response.ok) return null;
  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (!mimeType || !IMAGE_TYPES.has(mimeType)) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  // shortcut: drops posters over 512KB, raise the cap if larger Douban covers are required
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
  return { data: Buffer.from(bytes).toString("base64"), mimeType };
}

export function matchImageContent(details: Record<string, unknown>): {
  details: Record<string, unknown>;
  content: Array<{ type: "text"; text: string } | (MatchImage & { type: "image" })>;
} {
  const images = Array.isArray(details.images)
    ? details.images.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const image = item as { data?: unknown; mimeType?: unknown };
        if (typeof image.data !== "string" || typeof image.mimeType !== "string" || !image.data) return [];
        return [{ data: image.data, mimeType: image.mimeType }];
      })
    : [];
  const { images: _images, ...rest } = details;
  return {
    details: rest,
    content: [
      { type: "text", text: JSON.stringify(rest) },
      ...images.map((image) => ({ type: "image" as const, ...image })),
    ],
  };
}
