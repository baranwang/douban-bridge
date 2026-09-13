WidgetMetadata = {
  id: "douban.bridge.probe",
  title: "Douban Bridge 验证",
  version: "0.0.1",
  requiredVersion: "0.0.1",
  detailCacheDuration: 0,
  globalParams: [{ name: "sk", title: "测试密钥", type: "input" }],
  modules: ["a", "b"].map((id) => ({
    id,
    title: `验证 ${id}`,
    functionName: "probeList",
    cacheDuration: 0,
    params: [
      { name: "base", title: "探针地址", type: "input" },
      { name: "page", title: "页码", type: "page" },
      {
        name: "kind",
        title: "条目类型",
        type: "enumeration",
        value: "detail",
        enumOptions: ["detail", "tmdb", "imdb", "douban"].map((value) => ({ title: value, value })),
      },
    ],
  })),
};
async function probeList(params) {
  Widget.storage.set("douban.bridge.probe.key", params.sk || "");
  Widget.storage.set("douban.bridge.probe.base", params.base);
  const response = await Widget.http.get(`${params.base}/item`, {
    headers: { Authorization: `Bearer ${params.sk || ""}` },
  });
  const item = response.data;
  return [
    {
      ...item,
      type: params.kind,
      id: params.kind === "tmdb" ? 278 : params.kind === "imdb" ? "tt0111161" : "1292052",
      link: `${params.base}/meta/1292052`,
    },
  ];
}
async function loadDetail(link) {
  const sk = Widget.storage.get("douban.bridge.probe.key") || "";
  const response = await Widget.http.get(link, {
    headers: { Authorization: `Bearer ${sk}` },
  });
  return response.data;
}
