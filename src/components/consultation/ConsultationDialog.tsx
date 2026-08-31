'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { Clock3, Network, ShieldCheck, Sparkles } from 'lucide-react';
import ContactForm from '@/components/contact/ContactForm';
import { getContactCopy } from '@/components/contact/contactCopy';
import { defaultLocale } from '@/lib/i18n';
import { localeDirections, normalizeLocale } from '@/lib/locales';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

const CONSULTATION_TRIGGER_SELECTOR = 'a[data-consultation-trigger="true"]';
const BENEFIT_ICONS = [Sparkles, Clock3, ShieldCheck, Network] as const;

// 站点级 source：主站读 NEXT_PUBLIC_ATTRIBUTION_SOURCE（home-cn / home-io），
// customers 站读 NEXT_PUBLIC_CUSTOMERS_SOURCE（默认 customers）。
const HOME_SOURCE = process.env.NEXT_PUBLIC_ATTRIBUTION_SOURCE?.trim()?.slice(0, 128) || undefined;
const CUSTOMERS_SOURCE =
  process.env.NEXT_PUBLIC_CUSTOMERS_SOURCE?.trim()?.slice(0, 128) || 'customers';

export type ConsultationDialogCopy = {
  badge: string;
  title: string;
  description: string;
  benefits: { title: string; description: string }[];
  footer: string;
};

function shouldOpenDialog(event: MouseEvent) {
  return (
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export default function ConsultationDialog() {
  const params = useParams<{ lang?: string }>();
  const pathname = usePathname();
  const locale = normalizeLocale(params?.lang || defaultLocale);
  const dir = localeDirections[locale] || 'ltr';

  const [copy, setCopy] = useState<ConsultationDialogCopy | null>(null);
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submissionSource, setSubmissionSource] = useState<string>();
  const triggerRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    import(`@/locales/${locale}.json`)
      .then((module) => {
        if (!cancelled) setCopy(module.default.Home.consultationDialog);
      })
      .catch(() => {
        if (!cancelled) setCopy(null);
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  useEffect(() => {
    const handleConsultationClick = (event: MouseEvent) => {
      if (!shouldOpenDialog(event) || !(event.target instanceof Element)) return;

      const trigger = event.target.closest<HTMLAnchorElement>(CONSULTATION_TRIGGER_SELECTOR);
      if (!trigger) return;

      event.preventDefault();
      triggerRef.current = trigger;
      const isCustomers = pathname?.startsWith('/customers');
      setSubmissionSource(isCustomers ? CUSTOMERS_SOURCE : HOME_SOURCE);
      setSubmitted(false);
      setOpen(true);
    };

    // 捕获阶段监听：必须在 Next.js <Link> 的 client-side navigation（React 合成事件）之前
    // preventDefault，否则用 <Link> 的咨询按钮会在弹窗拦截前就完成路由跳转。
    document.addEventListener('click', handleConsultationClick, true);
    return () => document.removeEventListener('click', handleConsultationClick, true);
  }, [pathname]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSubmissionSource(undefined);
    }
  };

  if (!copy) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} modal>
      <DialogContent
        dir={dir}
        className="home fixed left-1/2 top-1/2 block max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[1040px] -translate-x-1/2 -translate-y-1/2 gap-0 overflow-y-auto rounded-xl border-[#dfe5ef] bg-white p-0 font-sans text-[#101828] shadow-[0_28px_90px_rgba(15,23,42,0.24)] sm:w-[calc(100%-4rem)] sm:max-w-[1040px]"
        aria-label={copy.title}
        closeLabel={getContactCopy(locale).close}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      >
        <div
          className={`grid h-auto min-h-0 grid-cols-1 ${
            submitted ? '' : 'lg:grid-cols-[0.95fr_1.05fr]'
          }`}
        >
          <aside
            className={`relative overflow-hidden border-b border-[#e4e7ec] bg-[#f7f9fc] px-6 py-7 sm:px-9 sm:py-9 lg:border-b-0 lg:border-r lg:px-10 lg:py-10 ${
              submitted ? 'hidden' : ''
            }`}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(21,94,239,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(21,94,239,0.055)_1px,transparent_1px)] [background-size:36px_36px] [mask-image:linear-gradient(to_bottom_right,black,transparent_78%)]"
            />
            <div className="relative flex h-full flex-col items-center lg:items-start">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#c7d7fe] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#155eef] shadow-sm">
                {copy.badge}
              </div>

              <DialogHeader className="mt-6 max-w-[430px] text-center lg:mt-7 lg:text-left">
                <DialogTitle className="m-0 text-[24px] font-semibold leading-[1.3] tracking-tight text-[#101828] sm:text-[28px] lg:text-[30px]">
                  {copy.title}
                </DialogTitle>
                <DialogDescription className="mt-2.5 max-w-[400px] text-[14px] leading-6 text-[#667085]">
                  {copy.description}
                </DialogDescription>
              </DialogHeader>

              <div className="my-6 hidden space-y-1.5 lg:block">
                {copy.benefits.map((benefit, index) => {
                  const Icon = BENEFIT_ICONS[index] ?? Sparkles;
                  return (
                    <div
                      key={benefit.title}
                      className="group flex items-start gap-3.5 rounded-xl p-2.5 transition-colors hover:bg-white/70"
                    >
                      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#c7d7fe] bg-white text-[#155eef] shadow-sm transition-colors group-hover:border-[#9db8f7]">
                        <Icon size={18} strokeWidth={1.9} aria-hidden />
                      </span>
                      <div className="pt-0.5">
                        <p className="text-[14px] font-semibold leading-5 text-[#1d2939]">
                          {benefit.title}
                        </p>
                        <p className="mt-0.5 max-w-[330px] text-[13px] leading-5 text-[#667085]">
                          {benefit.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="mt-auto hidden border-t border-[#dfe5ef] pt-4 text-[12px] leading-5 text-[#667085] lg:block">
                {copy.footer}
              </p>
            </div>
          </aside>

          <section className="h-fit min-h-0 overflow-visible bg-white lg:self-start">
            <ContactForm
              locale={locale}
              variant="modal"
              submissionSource={submissionSource}
              onSuccess={() => setSubmitted(true)}
              onClose={() => setOpen(false)}
            />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
