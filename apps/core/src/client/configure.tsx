import { createRoot, hydrateRoot } from "react-dom/client";
import { Configure, type ConfigureProps } from "@/components/configure";
import { StarBanner } from "@/components/star-banner";
import { UserMenu } from "@/components/user-menu";

const root = document.getElementById("configure");
const initialData = JSON.parse(document.getElementById("__INITIAL_DATA__")?.textContent || "{}") as ConfigureProps;

// 渲染主配置组件
if (root) {
  hydrateRoot(root, <Configure {...initialData} />);
}

const starBannerRoot = document.getElementById("star-banner");
if (starBannerRoot) {
  createRoot(starBannerRoot).render(<StarBanner user={initialData.user} />);
}

// 渲染用户菜单
const userMenuRoot = document.getElementById("user-menu");
if (userMenuRoot) {
  createRoot(userMenuRoot).render(<UserMenu user={initialData.user} />);
}
