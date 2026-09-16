import { toast } from "@douban-bridge/ui/components/toast";
import { useCallback } from "react";

/**
 * 点击自定义协议链接后，1 秒内没有发生 blur 就认为没有 App 接住，弹出提示。
 */
export function useSchemeLaunch(message: string) {
  return useCallback(() => {
    let didBlur = false;
    const handleBlur = () => {
      didBlur = true;
    };
    window.addEventListener("blur", handleBlur);
    setTimeout(() => {
      window.removeEventListener("blur", handleBlur);
      if (!didBlur) {
        toast.add({ title: message, type: "error" });
      }
    }, 1000);
  }, [message]);
}
