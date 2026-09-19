import type { Page } from "../data/types";
export const pages: Page[] = [
  "home",
  "create",
  "invite",
  "relationship",
  "dispute",
  "jury",
  "ended",
];
export const getPage = (): Page => {
  const p = location.hash.replace("#/", "") as Page;
  return pages.includes(p) ? p : "home";
};
export const go = (page: Page) => {
  location.hash = `/${page}`;
};
export const date = (n?: number) =>
  n
    ? new Intl.DateTimeFormat("zh-CN", {
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Shanghai",
        hour12: false,
      }).format(n)
    : "尚未开始";
export const day = (n: number) =>
  new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    timeZone: "Asia/Shanghai",
  }).format(n);
export const labels = {
  invited: "待接受",
  funding: "待存入资金",
  active: "进行中",
  ending: "待双方结束",
  appeal: "说明窗口",
  voting: "好友监督中",
  ended: "已结束",
};
