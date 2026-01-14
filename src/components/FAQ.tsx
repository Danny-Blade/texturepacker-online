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
    <section className="py-20">
      <div className="text-center mb-14">
        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">{t.faq.title}</h2>
        <div className="w-20 h-1 bg-gradient-to-r from-indigo-500 to-purple-500 mx-auto rounded-full"></div>
      </div>
      <div className="max-w-3xl mx-auto space-y-4">
        {faqs.map((faq, index) => (
          <div 
            key={index} 
            className={`bg-white rounded-2xl shadow-sm border overflow-hidden transition-all duration-300 ${
              openIndex === index ? 'border-indigo-200 shadow-md' : 'border-gray-100'
            }`}
          >
            <button
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
              className="w-full px-6 py-5 text-left flex justify-between items-center hover:bg-gray-50 transition"
            >
              <span className="font-semibold text-gray-800 pr-4">{faq.q}</span>
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-lg transition-all ${
                openIndex === index 
                  ? 'bg-indigo-100 text-indigo-600 rotate-180' 
                  : 'bg-gray-100 text-gray-400'
              }`}>
                ↓
              </span>
            </button>
            <div className={`overflow-hidden transition-all duration-300 ${
              openIndex === index ? 'max-h-96' : 'max-h-0'
            }`}>
              <div className="px-6 pb-5 text-gray-600 leading-relaxed">
                {faq.a}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
