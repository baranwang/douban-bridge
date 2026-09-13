import axios, { type AxiosInstance, type AxiosRequestConfig, type CreateAxiosDefaults } from "axios";
import { getDrizzle } from "@/db";
import { getContext } from "../middleware";

export enum CacheType {
  LOCAL = 1,
  KV = 2,
}

export class BaseAPI {
  protected get context() {
    return getContext();
  }

  protected axios: AxiosInstance;

  constructor(config?: CreateAxiosDefaults) {
    this.axios = axios.create({
      adapter: "fetch",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...config?.headers,
      },
      ...config,
    });

    this.axios.interceptors.request.use((config) => {
      const finalUri = axios.getUri(config);
      console.info("⬆️", config.method?.toUpperCase(), finalUri);
      return config;
    });
    this.axios.interceptors.response.use(
      (response) => {
        console.info("⬇️", response.status, axios.getUri(response.config));
        if (response.status >= 400) {
          console.error("❌", response.status, response.data);
        }
        return response;
      },
      (error) => {
        if (!error.config?.baseURL?.includes("webservice.fanart.tv")) {
          console.error("❌", error.response?.status, axios.getUri(error.config));
        }
        return Promise.reject(error);
      },
    );
  }

  private requestMap = new Map<string, Promise<unknown>>();

  protected async request<T>(config: AxiosRequestConfig & { cache?: { key: string; ttl: number; type?: number } }) {
    const cacheConfig = config.cache;
    const requestKey = cacheConfig?.key;

    // 1. 检查持久化缓存
    if (cacheConfig && requestKey) {
      const cachedRes = await this.getCache<T>(requestKey, { type: cacheConfig.type });
      if (cachedRes) {
        console.info("⚡️ Cache Hit", requestKey);
        return cachedRes;
      }
      console.info("🐢 Cache Miss", requestKey);
    }

    // 2. 检查进行中的请求（请求去重）
    if (requestKey && this.requestMap.has(requestKey)) {
      console.info("🔄 Dedup Hit", requestKey);
      return this.requestMap.get(requestKey) as Promise<T>;
    }

    // 3. 发起新请求
    const fetchData = async (): Promise<T> => {
      try {
        const resp = await this.axios.request<T>(config);
        const respData = resp.data;

        // 写入持久化缓存
        if (cacheConfig && requestKey) {
          this.setCache(requestKey, respData, { type: cacheConfig.type, ttl: cacheConfig.ttl });
        }
        return respData;
      } finally {
        // 无论成功或失败都清理 requestMap
        if (requestKey) {
          this.requestMap.delete(requestKey);
        }
      }
    };

    const promise = fetchData();

    // 存储 promise 用于去重
    if (requestKey) {
      this.requestMap.set(requestKey, promise);
    }

    return promise;
  }

  protected async getCache<T>(key: string, options?: { type?: number }) {
    const { type = CacheType.LOCAL } = options ?? {};
    let result: T | null = null;
    if ((type & CacheType.LOCAL) === CacheType.LOCAL) {
      result = await this.getLocalCache<T>(key).catch(() => null);
    }
    if (!result && (type & CacheType.KV) === CacheType.KV) {
      result = await this.getKVCache<T>(key).catch(() => null);
    }
    return result;
  }
  protected setCache<T>(key: string, value: T, options?: { type?: number; ttl: number }) {
    const { type = CacheType.LOCAL, ttl = 0 } = options ?? {};
    if ((type & CacheType.LOCAL) === CacheType.LOCAL) {
      this.setLocalCache(key, value, ttl);
    }
    if ((type & CacheType.KV) === CacheType.KV) {
      this.setKVCache(key, value, ttl);
    }
  }

  private async getLocalCache<T>(key: string) {
    const cache = caches.default;
    const cacheKey = new Request(`https://cache.internal/${key}`);
    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached.json() as T;
    }
    return null;
  }
  private setLocalCache<T>(key: string, value: T, ttl: number) {
    const cache = caches.default;
    const cacheKey = new Request(`https://cache.internal/${key}`);
    const response = new Response(JSON.stringify(value), {
      headers: {
        "Cache-Control": `public, max-age=${ttl}, s-maxage=${ttl}`,
      },
    });
    this.context.ctx.waitUntil(cache.put(cacheKey, response));
  }
  private async getKVCache<T>(key: string) {
    return this.context.env.KV.get<T>(key, "json");
  }
  private setKVCache<T>(key: string, value: T, ttl: number) {
    this.context.ctx.waitUntil(
      this.context.env.KV.put(key, JSON.stringify(value), {
        expirationTtl: ttl,
      }),
    );
  }

  get db() {
    return getDrizzle(this.context.env);
  }
}
