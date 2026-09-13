export function apiKeyActionUi({
  loaded,
  hasKey,
  busy,
}: {
  loaded: boolean;
  hasKey: boolean;
  busy: boolean;
}): { disabled: boolean; label: "生成密钥" | "重新生成密钥" } {
  return {
    disabled: !loaded || busy,
    label: hasKey ? "重新生成密钥" : "生成密钥",
  };
}
