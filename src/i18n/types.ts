import type { ParseKeys } from "i18next";
import type { namespaces } from "./resources";

/** 动态文案表只能存储语义 key，不能把业务数据或服务端消息当作翻译 key。 */
export type TranslationKey<Namespace extends (typeof namespaces)[number] = (typeof namespaces)[number]> = Extract<ParseKeys<readonly Namespace[]>, `${Namespace}:${string}`>;
