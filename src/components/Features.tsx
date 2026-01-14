import { getTranslations, Locale } from '@/lib/i18n';

interface Props {
  locale: Locale;
}

export default function Features({ locale }: Props) {
  const t = getTranslations(locale);

  const features = [
    { icon: '🧮', color: 'from-violet-500 to-purple-600', bg: 'bg-violet-50', ...t.features.feature1 },
    { icon: '📦', color: 'from-blue-500 to-cyan-600', bg: 'bg-blue-50', ...t.features.feature2 },
    { icon: '⚙️', color: 'from-amber-500 to-orange-600', bg: 'bg-amber-50', ...t.features.feature3 },
    { icon: '👁️', color: 'from-emerald-500 to-teal-600', bg: 'bg-emerald-50', ...t.features.feature4 },
    { icon: '🔒', color: 'from-rose-500 to-pink-600', bg: 'bg-rose-50', ...t.features.feature5 },
    { icon: '🆓', color: 'from-indigo-500 to-blue-600', bg: 'bg-indigo-50', ...t.features.feature6 },
  ];

  return (
    <section className="py-20">
      <div className="text-center mb-14">
        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">{t.features.title}</h2>
        <div className="w-20 h-1 bg-gradient-to-r from-indigo-500 to-purple-500 mx-auto rounded-full"></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feature, index) => (
          <div 
            key={index} 
            className="group bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-xl hover:shadow-gray-100 hover:-translate-y-1 transition-all duration-300"
          >
            <div className={`w-14 h-14 ${feature.bg} rounded-2xl flex items-center justify-center text-2xl mb-5 group-hover:scale-110 transition-transform`}>
              {feature.icon}
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">{feature.title}</h3>
            <p className="text-gray-600 text-sm leading-relaxed">{feature.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
