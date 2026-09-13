export function apiKeyActionUi({
  loaded,
  hasKey,
  busy,
  loadFailed = false,
}: {
  loaded: boolean;
  hasKey: boolean;
  busy: boolean;
  loadFailed?: boolean;
}): { disabled: boolean; label: "生成密钥" | "重新生成密钥"; showRetry: boolean } {
  return {
    disabled: !loaded || busy,
    label: hasKey ? "重新生成密钥" : "生成密钥",
    showRetry: Boolean(loadFailed) && !loaded,
  };
}
