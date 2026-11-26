import { Hono } from "hono";

export const MEDIAREF_WEBSITE = "https://mediaref.org/";

// 映射纠错交给 MediaRef，用户用自己的账号在那边提交。
export const feedbackRoute = new Hono().get("/", (c) => c.redirect(MEDIAREF_WEBSITE, 302));
