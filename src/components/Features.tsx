import { getTranslations, Locale } from '@/lib/i18n';

interface Props {
  locale: Locale;
}

export default function Features({ locale }: Props) {
  const t = getTranslations(locale);

  const features = [
    { icon: '🧮', ...t.features.feature1 },
    { icon: '📦', ...t.features.feature2 },
    { icon: '⚙️', ...t.features.feature3 },
    { icon: '👁️', ...t.features.feature4 },
    { icon: '🔒', ...t.features.feature5 },
    { icon: '🆓', ...t.features.feature6 },
  ];

  return (
    <section className="py-16">
      <h2 className="text-3xl font-bold text-center mb-12">{t.features.title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {features.map((feature, index) => (
          <div key={index} className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition">
            <div className="text-4xl mb-4">{feature.icon}</div>
            <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
            <p className="text-gray-600">{feature.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
