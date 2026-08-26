export const CTA_SOURCES = [
  'customers',
  'home_hero',
  'home_bottom',
  'navbar_poc',
  'customers_hero',
  'customers_sidebar',
  'customers_bottom',
  'empty_state',
  'footer_private_deploy'
] as const;

export type CtaSource = (typeof CTA_SOURCES)[number];

/** 主站独立商务咨询表单的 iframe 嵌入地址（专用 embed 路由，无站点导航/页脚） */
export const CONTACT_FORM_BASE_URL = 'https://fastgpt.cn/zh/contact/embed';

/** UTM 固定参数：来源统一为 customers 站 */
export const UTM_SOURCE = 'customers';
export const UTM_MEDIUM = 'referral';

/**
 * 各按钮位置 → utm_campaign 映射（按转化意图分组）：
 * - poc-application：POC 申请类（商务跟进：POC 验证）
 * - requirement-match：需求匹配类（首页空状态提需求）
 * - private-deploy：私有化咨询类（页脚入口）
 * utm_content 直接复用 CTA_SOURCES 枚举值，与站内 MongoDB 点击统计口径一致。
 */
export const SOURCE_UTM_CAMPAIGNS: Record<CtaSource, string> = {
  customers: 'poc-application',
  home_hero: 'poc-application',
  home_bottom: 'poc-application',
  navbar_poc: 'poc-application',
  customers_hero: 'poc-application',
  customers_sidebar: 'poc-application',
  customers_bottom: 'poc-application',
  empty_state: 'requirement-match',
  footer_private_deploy: 'private-deploy'
};
