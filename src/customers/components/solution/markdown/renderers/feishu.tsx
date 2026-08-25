import React from 'react';
import DOMPurify from 'isomorphic-dompurify';
import type { Components } from 'react-markdown';
import type { MarkdownRendererProps } from '../types';
import { extractTextFromReactNode, getStringProp, joinClassNames } from '../utils';
import { MermaidChart } from './charts';

export const FEISHU_MARKER_CLASS = 'marker:text-[#3370ff] ';

export function getFeishuAlignClass(align: unknown) {
  switch (getStringProp(align)) {
    case 'center':
      return 'text-center';
    case 'right':
      return 'text-right';
    default:
      return undefined;
  }
}

const feishuTextColorClasses: Record<string, string> = {
  red: 'text-red-700 ',
  orange: 'text-orange-700 ',
  yellow: 'text-yellow-700 ',
  green: 'text-emerald-700 ',
  blue: 'text-blue-700 ',
  purple: 'text-purple-700 ',
  gray: 'text-slate-600 '
};

const feishuBackgroundColorClasses: Record<string, string> = {
  red: 'bg-red-100 ',
  orange: 'bg-orange-100 ',
  yellow: 'bg-yellow-100 ',
  green: 'bg-emerald-100 ',
  blue: 'bg-blue-100 ',
  purple: 'bg-purple-100 ',
  gray: 'bg-slate-100 ',
  'light-red': 'bg-red-50 ',
  'light-orange': 'bg-orange-50 ',
  'light-yellow': 'bg-yellow-50 ',
  'light-green': 'bg-emerald-50 ',
  'light-blue': 'bg-blue-50 ',
  'light-purple': 'bg-purple-50 ',
  'light-gray': 'bg-slate-50 ',
  'medium-red': 'bg-red-100 ',
  'medium-orange': 'bg-orange-100 ',
  'medium-yellow': 'bg-yellow-100 ',
  'medium-green': 'bg-emerald-100 ',
  'medium-blue': 'bg-blue-100 ',
  'medium-purple': 'bg-purple-100 ',
  'medium-gray': 'bg-slate-200 '
};

const feishuBorderColorClasses: Record<string, string> = {
  red: 'border-red-200 ',
  orange: 'border-orange-200 ',
  yellow: 'border-yellow-200 ',
  green: 'border-emerald-200 ',
  blue: 'border-blue-200 ',
  purple: 'border-purple-200 ',
  gray: 'border-slate-200 '
};

export function getFeishuTextColorClass(value: unknown) {
  return feishuTextColorClasses[getStringProp(value)] ?? undefined;
}

export function getFeishuBackgroundColorClass(value: unknown) {
  return feishuBackgroundColorClasses[getStringProp(value)] ?? undefined;
}

function getFeishuBorderColorClass(value: unknown) {
  return feishuBorderColorClasses[getStringProp(value)] ?? undefined;
}

export function getFeishuTableVerticalAlignClass(value: unknown) {
  switch (getStringProp(value)) {
    case 'top':
      return 'align-top';
    case 'bottom':
      return 'align-bottom';
    case 'middle':
      return 'align-middle';
    default:
      return undefined;
  }
}

export function formatFeishuTime(value: unknown) {
  const timestamp = Number(getStringProp(value));
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '';
  }

  try {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(timestamp));
  } catch {
    return '';
  }
}

const unsupportedFeishuResourceLabels: Record<string, string> = {
  base_ref: '多维表格引用',
  bitable: '多维表格',
  chat_card: '群聊卡片',
  okr: 'OKR',
  sheet: '电子表格',
  source: '飞书附件',
  synced_reference: '同步块',
  synced_source: '同步块源',
  task: '飞书任务'
};

function getFeishuResourceHref(props: MarkdownRendererProps) {
  return getStringProp(props.href) || getStringProp(props.src) || getStringProp(props.url);
}

function getFeishuResourceTitle(
  tagName: string,
  props: MarkdownRendererProps,
  children: React.ReactNode
) {
  const explicitTitle =
    getStringProp(props.title) ||
    getStringProp(props.name) ||
    extractTextFromReactNode(children).trim();

  if (explicitTitle) {
    return explicitTitle;
  }

  return `${unsupportedFeishuResourceLabels[tagName] || tagName}暂不可预览`;
}

function renderUnsupportedFeishuResource(
  tagName: keyof typeof unsupportedFeishuResourceLabels,
  props: MarkdownRendererProps
) {
  const { children } = props;
  const href = getFeishuResourceHref(props);
  const label = unsupportedFeishuResourceLabels[tagName];
  const title = getFeishuResourceTitle(tagName, props, children);
  const token = getStringProp(props.token);

  return (
    <div
      className={joinClassNames(
        'not-prose my-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600   ',
        props.className
      )}
    >
      <div className="font-semibold text-slate-800 ">{label}暂不可预览</div>
      <div className="mt-1 leading-6">
        {title}
        {token && <span className="ml-2 text-xs text-slate-400">token: {token}</span>}
      </div>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex text-sm font-medium text-[#3370ff] no-underline hover:underline "
        >
          打开资源
        </a>
      )}
    </div>
  );
}

const feishuSource = (props: { node?: unknown } & MarkdownRendererProps) =>
  renderUnsupportedFeishuResource('source', props);

export const feishuMarkdownRenderers: Components & Record<string, unknown> = {
  span: ({ children, ...props }) => {
    const markdownProps = props as MarkdownRendererProps;
    const backgroundClass = getFeishuBackgroundColorClass(markdownProps['background-color']);
    const textClass = getFeishuTextColorClass(markdownProps['text-color']);
    const hasFeishuStyle = Boolean(backgroundClass || textClass);

    return (
      <span
        className={joinClassNames(
          textClass,
          backgroundClass,
          hasFeishuStyle ? 'rounded-[4px] px-1 py-0.5' : undefined,
          markdownProps.className
        )}
      >
        {children}
      </span>
    );
  },
  callout: ({ children, ...props }: MarkdownRendererProps) => {
    const emoji = getStringProp(props.emoji) || '💡';
    const backgroundClass =
      getFeishuBackgroundColorClass(props['background-color']) ||
      getFeishuBackgroundColorClass('light-blue');
    const borderClass =
      getFeishuBorderColorClass(props['border-color']) || getFeishuBorderColorClass('blue');
    const textClass = getFeishuTextColorClass(props['text-color']);

    return (
      <div
        className={joinClassNames(
          'not-prose my-5 flex gap-3 rounded-2xl border p-4 shadow-sm',
          backgroundClass,
          borderClass,
          textClass,
          props.className
        )}
      >
        <span className="mt-0.5 shrink-0 text-xl leading-none" aria-hidden="true">
          {emoji}
        </span>
        <div className="min-w-0 flex-1 text-[15px] leading-[1.8] text-slate-900  [&>p]:m-0 [&>p]:mb-2 [&>p:last-child]:mb-0 [&_ul]:my-2 [&_ol]:my-2">
          {children}
        </div>
      </div>
    );
  },
  checkbox: ({ children, ...props }: MarkdownRendererProps) => {
    const done = getStringProp(props.done).toLowerCase() === 'true';

    return (
      <div
        className={joinClassNames(
          'not-prose my-2 flex items-start gap-2 text-[15px] leading-[1.75] text-slate-900 ',
          getFeishuAlignClass(props.align),
          props.className
        )}
      >
        <span
          className={joinClassNames(
            'mt-[0.35rem] flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold',
            done
              ? 'border-[#3370ff] bg-[#3370ff] text-white   '
              : 'border-slate-300 bg-white text-transparent  '
          )}
          aria-hidden="true"
        >
          ✓
        </span>
        <span className={done ? 'text-slate-500 line-through decoration-slate-400 ' : undefined}>
          {children}
        </span>
      </div>
    );
  },
  button: ({ children, ...props }) => {
    const markdownProps = props as MarkdownRendererProps;
    const src = getStringProp(markdownProps.src || markdownProps.href);
    const action = getStringProp(markdownProps.action) || 'OpenLink';
    const backgroundClass =
      getFeishuBackgroundColorClass(markdownProps['background-color']) ||
      getFeishuBackgroundColorClass('light-blue');
    const label = children || (src ? '打开链接' : action);

    if (!src) {
      return (
        <span
          className={joinClassNames(
            'not-prose my-2 inline-flex items-center rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600  ',
            backgroundClass,
            markdownProps.className
          )}
        >
          {label}
        </span>
      );
    }

    return (
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className={joinClassNames(
          'not-prose my-2 inline-flex items-center rounded-lg border border-[#3370ff]/20 px-3 py-1.5 text-sm font-semibold text-[#3370ff] no-underline transition-colors hover:border-[#3370ff]/40 hover:bg-blue-50   ',
          backgroundClass,
          markdownProps.className
        )}
      >
        {label}
      </a>
    );
  },
  time: ({ children, ...props }) => {
    const markdownProps = props as MarkdownRendererProps;
    const expireText = formatFeishuTime(markdownProps['expire-time']);
    const notifyText = formatFeishuTime(markdownProps['notify-time']);
    const shouldNotify = getStringProp(markdownProps['should-notify']).toLowerCase() === 'true';

    return (
      <span
        className={joinClassNames(
          'not-prose inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600   ',
          markdownProps.className
        )}
      >
        <span>{children || expireText || '时间'}</span>
        {expireText && children && <span className="text-slate-400">· {expireText}</span>}
        {notifyText && shouldNotify && <span className="text-slate-400">提醒 {notifyText}</span>}
      </span>
    );
  },
  bookmark: ({ children, ...props }: MarkdownRendererProps) => {
    const href = getStringProp(props.href || props.url || props.src);
    const label =
      extractTextFromReactNode(children).trim() ||
      getStringProp(props.name) ||
      getStringProp(props.title) ||
      href ||
      '书签';
    const content = (
      <>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#3370ff]/10 text-[#3370ff]  ">
          ↗
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{label}</span>
      </>
    );

    if (!href) {
      return (
        <span
          className={joinClassNames(
            'not-prose my-3 flex max-w-2xl items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700   ',
            props.className
          )}
        >
          {content}
        </span>
      );
    }

    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={joinClassNames(
          'not-prose my-3 flex max-w-2xl items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 no-underline shadow-sm transition-colors hover:border-[#3370ff]/40 hover:bg-blue-50     ',
          props.className
        )}
      >
        {content}
      </a>
    );
  },
  grid: ({ children, ...props }: MarkdownRendererProps) => (
    <div
      className={joinClassNames(
        'not-prose my-6 grid gap-4 md:grid-flow-col md:auto-cols-fr',
        props.className
      )}
    >
      {children}
    </div>
  ),
  column: ({ children, ...props }: MarkdownRendererProps) => {
    const widthRatio = Number(getStringProp(props['width-ratio']));
    const style =
      Number.isFinite(widthRatio) && widthRatio > 0 ? { flex: `${widthRatio} 1 0%` } : undefined;

    return (
      <div style={style} className={joinClassNames('min-w-0 p-0 text-slate-900 ', props.className)}>
        {children}
      </div>
    );
  },
  whiteboard: ({ children, ...props }: MarkdownRendererProps) => {
    const type = getStringProp(props.type) || 'blank';
    const content = extractTextFromReactNode(children).trim();

    if (type === 'mermaid') {
      return (
        <div className="not-prose my-8 w-full flex justify-center">
          <MermaidChart chart={content} />
        </div>
      );
    }

    if (type === 'svg') {
      // 飞书画板导出的 SVG 属不可信内容：用 DOMPurify 白名单净化，
      // 仅保留 SVG 标签并剥离所有 on* 事件属性与脚本，防止存储型 XSS。
      const sanitizedSvg = DOMPurify.sanitize(content, {
        USE_PROFILES: { svg: true, svgFilters: true }
      });
      return (
        <div className="not-prose my-8 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm  ">
          <div
            className="[&>svg]:mx-auto [&>svg]:max-w-full [&>svg]:h-auto"
            dangerouslySetInnerHTML={{
              __html: sanitizedSvg
            }}
          />
        </div>
      );
    }

    return (
      <div className="not-prose my-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500   ">
        {type === 'blank' ? '空白画板暂不可预览。' : `${type} 画板暂不可预览。`}
      </div>
    );
  },
  source: feishuSource as Components['source'],
  sheet: (props: { node?: unknown } & MarkdownRendererProps) =>
    renderUnsupportedFeishuResource('sheet', props),
  bitable: (props: { node?: unknown } & MarkdownRendererProps) =>
    renderUnsupportedFeishuResource('bitable', props),
  base_ref: (props: { node?: unknown } & MarkdownRendererProps) =>
    renderUnsupportedFeishuResource('base_ref', props),
  task: (props: { node?: unknown } & MarkdownRendererProps) =>
    renderUnsupportedFeishuResource('task', props),
  chat_card: (props: { node?: unknown } & MarkdownRendererProps) =>
    renderUnsupportedFeishuResource('chat_card', props),
  synced_reference: (props: { node?: unknown } & MarkdownRendererProps) =>
    renderUnsupportedFeishuResource('synced_reference', props),
  synced_source: (props: { node?: unknown } & MarkdownRendererProps) =>
    renderUnsupportedFeishuResource('synced_source', props),
  okr: (props: { node?: unknown } & MarkdownRendererProps) =>
    renderUnsupportedFeishuResource('okr', props)
};
