'use client';

import { useState } from 'react';
import { getTranslations, Locale } from '@/lib/i18n';

interface Props {
  locale: Locale;
}

export default function FAQ({ locale }: Props) {
  const t = getTranslations(locale);
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    { q: t.faq.q1, a: t.faq.a1 },
    { q: t.faq.q2, a: t.faq.a2 },
    { q: t.faq.q3, a: t.faq.a3 },
    { q: t.faq.q4, a: t.faq.a4 },
  ];

  return (
    <section className="py-16">
      <h2 className="text-3xl font-bold text-center mb-12">{t.faq.title}</h2>
      <div className="max-w-3xl mx-auto space-y-4">
        {faqs.map((faq, index) => (
          <div key={index} className="bg-white rounded-xl shadow-sm overflow-hidden">
            <button
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
              className="w-full px-6 py-4 text-left flex justify-between items-center hover:bg-gray-50 transition"
            >
              <span className="font-semibold">{faq.q}</span>
              <span className="text-2xl text-gray-400">{openIndex === index ? '−' : '+'}</span>
            </button>
            {openIndex === index && (
              <div className="px-6 pb-4 text-gray-600">
                {faq.a}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
