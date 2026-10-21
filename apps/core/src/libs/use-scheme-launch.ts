import { toast } from "@douban-bridge/ui/components/toast";
import { useCallback } from "react";
import { track } from "@/libs/track";

/**
 * 点击自定义协议链接后，1 秒内没有发生 blur 就认为没有 App 接住，弹出提示。
 * 失焦才算打开成功。eventName 必须是字符串，避免 onClick 把点击事件传进来。
 */
export function useSchemeLaunch(message: string) {
  return useCallback(
    (eventName?: string) => {
      let didBlur = false;
      const handleBlur = () => {
        didBlur = true;
      };
      window.addEventListener("blur", handleBlur);
      setTimeout(() => {
        window.removeEventListener("blur", handleBlur);
        if (!didBlur) {
          toast.add({ title: message, type: "error" });
          return;
        }
        if (typeof eventName === "string") track(eventName);
      }, 1000);
    },
    [message],
  );
}
