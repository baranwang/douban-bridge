import { createRoot } from "react-dom/client";
import { UserMenu } from "@/components/user-menu";
import type { PublicUser } from "@/libs/public-user";

const root = document.getElementById("user-menu");
const user = JSON.parse(document.getElementById("__USER__")?.textContent || "null") as PublicUser | null;

if (root && user) {
  createRoot(root).render(<UserMenu user={user} />);
}
