import { hydrateRoot } from "react-dom/client";
import { Rex, type RexProps } from "@/components/rex";

const root = document.getElementById("rex");
const initialData = JSON.parse(document.getElementById("__INITIAL_DATA__")?.textContent || "{}") as RexProps;
if (root) hydrateRoot(root, <Rex {...initialData} />);
