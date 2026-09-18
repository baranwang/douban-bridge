import { DoubanAPI } from "@/libs/api";

export function isAllowedDoubanImageUrl(url: string): boolean {
  try {
    const image = new URL(url);
    return (
      image.protocol === "https:" &&
      !image.username &&
      !image.password &&
      (!image.port || image.port === "443") &&
      image.hostname.endsWith(".doubanio.com")
    );
  } catch {
    return false;
  }
}

export async function fetchDoubanImage(url: string): Promise<Response> {
  if (!isAllowedDoubanImageUrl(url)) {
    return new Response("Unsupported image source", { status: 400 });
  }

  const response = await fetch(url, {
    headers: DoubanAPI.BASE_HEADERS,
    redirect: "manual",
  });
  if (response.status >= 300 && response.status < 400) {
    return new Response("Image source redirected", { status: 502 });
  }

  const headers = new Headers();
  const contentType = response.headers.get("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);
  if (response.status === 200) {
    headers.set("ETag", url);
    headers.set("Access-Control-Allow-Origin", "*");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function dashDoubanImageSrc(url: string): string {
  return `/dash/image-proxy?url=${encodeURIComponent(url)}`;
}
