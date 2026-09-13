export type HostResponse = { statusCode: number; data: unknown };
export type HostWidget = {
  http: { get(url: string, options?: { headers?: Record<string, string> }): Promise<HostResponse> };
  tmdb: { get(path: string, options?: { params?: Record<string, string> }): Promise<unknown> };
  storage: { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void };
};
declare global {
  var Widget: HostWidget;
}
