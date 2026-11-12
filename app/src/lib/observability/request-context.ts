import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContext = { requestId: string; method?: string; path?: string; userId?: string };
const storage = new AsyncLocalStorage<RequestContext>();

/** Chạy fn trong ngữ cảnh một request để mọi log/lỗi bên trong tự gắn requestId. */
export const runWithContext = <T>(ctx: RequestContext, fn: () => T): T => storage.run(ctx, fn);
export const getRequestContext = (): RequestContext | undefined => storage.getStore();
export const setRequestUser = (userId: string) => { const s = storage.getStore(); if (s) s.userId = userId; };
