import { Button } from "@douban-bridge/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@douban-bridge/ui/components/input-group";
import { toast } from "@douban-bridge/ui/components/toast";
import { Copy, KeyRound } from "lucide-react";
import { type FC, useCallback, useEffect, useState } from "react";
import { SettingSection } from "@/components/setting-section";
import type { PublicUser } from "@/libs/public-user";
import { apiKeyActionUi } from "./api-key-action";

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("zh-CN");

export const ApiKeySettings: FC<{ user?: PublicUser }> = ({ user }) => {
  const [hasKey, setHasKey] = useState(false);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [sk, setSk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const { disabled, label, showRetry } = apiKeyActionUi({ loaded, hasKey, busy, loadFailed });

  const loadStatus = useCallback(async (signal?: { cancelled: boolean }) => {
    try {
      const response = await fetch("/api-keys", { credentials: "same-origin" });
      if (!response.ok) throw new Error("key request failed");
      const data = (await response.json()) as { hasKey: boolean; createdAt: string | null };
      if (signal?.cancelled) return;
      setHasKey(data.hasKey);
      setCreatedAt(data.createdAt);
      setLoaded(true);
      setLoadFailed(false);
    } catch {
      if (signal?.cancelled) return;
      setLoaded(false);
      setLoadFailed(true);
      toast.add({ title: "操作失败，请重试", type: "error" });
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const signal = { cancelled: false };
    void loadStatus(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [user, loadStatus]);

  const generate = useCallback(() => {
    if (disabled) return;
    setBusy(true);
    void (async () => {
      try {
        const response = await fetch("/api-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: "{}",
        });
        if (!response.ok) throw new Error("key request failed");
        const { sk: next } = (await response.json()) as { sk: string };
        setSk(next);
        setHasKey(true);
        setCreatedAt(new Date().toISOString());
      } catch {
        toast.add({ title: "操作失败，请重试", type: "error" });
      } finally {
        setBusy(false);
      }
    })();
  }, [disabled]);

  if (!user) return null;
  if (!user.hasStarred && !hasKey && !sk) return null;

  return (
    <SettingSection
      title="Rex 密钥"
      icon={<KeyRound className="size-4 text-muted-foreground" />}
      footer="重新生成后，旧密钥立即失效"
    >
      <div className="flex flex-col gap-3">
        {sk ? (
          <InputGroup>
            <InputGroupInput id="account-api-key" type="password" readOnly value={sk} autoComplete="off" />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                disabled={busy}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(sk);
                    toast.add({ title: "密钥已复制到剪贴板", type: "success" });
                  } catch {
                    toast.add({ title: "操作失败，请重试", type: "error" });
                  }
                }}
              >
                <Copy />
                复制
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        ) : null}
        {hasKey && !sk ? (
          <p className="text-muted-foreground text-sm">
            {createdAt ? `密钥生成于 ${formatDate(createdAt)}，` : "密钥已生成，"}
            只在生成的那一次显示，之后连服务端也取不回明文。忘了就重新生成一把。
          </p>
        ) : null}
        <div className="flex gap-2">
          {user.hasStarred ? (
            <Button type="button" variant={sk ? "outline" : "default"} disabled={disabled} onClick={generate}>
              {label}
            </Button>
          ) : null}
          {showRetry ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void loadStatus().finally(() => setBusy(false));
              }}
            >
              重试
            </Button>
          ) : null}
        </div>
      </div>
    </SettingSection>
  );
};
