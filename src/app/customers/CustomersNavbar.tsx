'use client';

import Navbar from '@/components/home/Navbar';
import { openCtaModal } from '@customers/lib/cta';

interface CustomersNavbarProps {
  links: { label: string; href: string }[];
  t: { trial: string; consult: string };
}

// 复用主页 Navbar，并把「商务咨询」按钮改为打开内嵌咨询表单（source=customers）。
export default function CustomersNavbar({ links, t }: CustomersNavbarProps) {
  return (
    <Navbar
      links={links}
      t={t}
      locale="zh"
      publishedLocales={['zh']}
      onConsultClick={() =>
        openCtaModal({
          source: 'customers',
          title: '商务咨询',
          subtitle:
            '填写约 1 分钟。商务顾问将在 1 天内联系你，协助判断解决方案如何适配你的业务并推进免费 POC 验证。'
        })
      }
    />
  );
}
