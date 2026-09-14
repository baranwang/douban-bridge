import type { ImageProvider } from "@douban-bridge/contracts/image-providers";
import { Button } from "@douban-bridge/ui/components/button";
import { ItemGroup } from "@douban-bridge/ui/components/item";
import { Toaster } from "@douban-bridge/ui/components/sonner";
import { Spinner } from "@douban-bridge/ui/components/spinner";
import { ImageProviderSortable } from "@douban-bridge/ui/image-providers";
import { isEqual } from "es-toolkit";
import { Image as ImageIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import type { PublicUser } from "@/libs/public-user";
import { SettingSection } from "../setting-section";
import { StarBanner } from "../star-banner";
import { UserMenu } from "../user-menu";
import { ApiKeySettings } from "./api-key-settings";

export interface RexProps {
  user?: PublicUser;
  imageProviders: ImageProvider[];
}

export function Rex({ user, imageProviders: initialImageProviders }: RexProps) {
  const [imageProviders, setImageProviders] = useState(initialImageProviders);
  const [savedImageProviders, setSavedImageProviders] = useState(initialImageProviders);
  const [saving, setSaving] = useState(false);
  const isStarred = user?.hasStarred === true;

  const saveImageProviders = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/rex/image-providers", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageProviders }),
      });
      if (!response.ok) throw new Error("image provider save failed");
      const saved = (await response.json()) as { success: true; imageProviders: ImageProvider[] };
      setImageProviders(saved.imageProviders);
      setSavedImageProviders(saved.imageProviders);
      toast.success("图片设置已保存");
    } catch {
      toast.error("保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-dvh bg-muted/30">
      <div className="page-container flex min-h-dvh flex-col px-4 py-8 sm:py-12">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-balance font-bold text-2xl tracking-tight sm:text-3xl">Rex 设置</h1>
            <p className="mt-2 text-balance text-muted-foreground">管理 Rex 密钥与所有播放器共用的图片来源。</p>
          </div>
          {user ? <UserMenu user={user} /> : null}
        </header>

        <main className="flex-1 py-8">
          {isStarred ? (
            <div className="space-y-8">
              <div data-section="rex-key-settings">
                <ApiKeySettings user={user} />
              </div>

              <form data-section="image-provider-settings" onSubmit={saveImageProviders}>
                <SettingSection
                  title="图片来源"
                  icon={<ImageIcon className="size-4 text-muted-foreground" />}
                  footer="拖动排序调整优先级，排在前面的图片来源将优先使用"
                >
                  <ItemGroup className="rounded-lg border">
                    <ImageProviderSortable value={imageProviders} onChange={setImageProviders} />
                  </ItemGroup>
                </SettingSection>
                <Button
                  className="mt-4 w-full sm:w-auto"
                  type="submit"
                  disabled={saving || isEqual(imageProviders, savedImageProviders)}
                >
                  {saving ? (
                    <>
                      <Spinner />
                      保存中…
                    </>
                  ) : (
                    "保存图片设置"
                  )}
                </Button>
              </form>
            </div>
          ) : (
            <section aria-labelledby="rex-cloud-access-title">
              <h2 id="rex-cloud-access-title" className="font-semibold text-lg">
                启用 Rex 云端能力
              </h2>
              <p className="mt-1 max-w-prose text-muted-foreground text-sm">
                登录并 Star 项目后，即可创建 Rex 密钥，并在云端保存所有播放器共用的图片设置。
              </p>
              <StarBanner user={user} context="rex" />
            </section>
          )}
        </main>
      </div>
      <Toaster />
    </div>
  );
}
