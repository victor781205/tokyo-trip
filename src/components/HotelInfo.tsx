import { MapPin, Train, Globe, CheckCircle2 } from "lucide-react";

export function HotelInfo() {
  const features = ["🍳 含早餐", "📶 免費 WiFi", "♨️ 大浴場", "🏋️ 健身房", "👔 西裝熨燙", "🧺 洗衣服務"];

  return (
    <section id="hotel" className="py-20 px-6 md:px-12 max-w-6xl mx-auto">
      <div className="text-center mb-12">
        <h2 className="text-3xl md:text-4xl font-bold mb-4">🏨 住宿資訊</h2>
        <p className="text-gray-600 dark:text-gray-400">東京東武黎凡特飯店 Tobu Levant Hotel Tokyo</p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-xl overflow-hidden border border-gray-100 dark:border-slate-700 flex flex-col lg:flex-row transition-all duration-300">
        <div className="p-8 md:p-12 lg:w-1/2 space-y-6">
          <div>
            <h3 className="text-3xl md:text-3xl font-extrabold text-primary mb-4">東京東武黎凡特飯店</h3>
            <div className="space-y-3">
              <p className="flex items-start gap-3 text-gray-600 dark:text-gray-300">
                <MapPin className="w-5 h-5 text-primary shrink-0 mt-1" />
                <span>東京都 墨田區錦糸 1-2-2 130-0013</span>
              </p>
              <p className="flex items-start gap-3 text-gray-600 dark:text-gray-300">
                <Train className="w-5 h-5 text-primary shrink-0 mt-1" />
                <span>JR總武線「錦糸町」站步行 5 分鐘</span>
              </p>
              <p className="flex items-start gap-3 text-gray-600 dark:text-gray-300 text-base italic">
                <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-1" />
                <span>東武晴空塔線直通，方便前往日光、淺草</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {features.map((f, i) => (
              <span key={i} className="bg-gray-50 dark:bg-slate-700/50 px-3 py-2 rounded-xl text-base font-medium text-gray-700 dark:text-gray-200 flex items-center justify-center">
                {f}
              </span>
            ))}
          </div>

          <div className="pt-4">
            <a 
              href="https://tc.tobuhotel.co.jp/levant/" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-8 py-4 rounded-2xl font-bold transition-all shadow-lg shadow-primary/20"
            >
              <Globe className="w-5 h-5" /> 前往官方網站
            </a>
          </div>
        </div>

        <div className="lg:w-1/2 min-h-[400px] relative">
          <iframe 
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3241.8!2d139.8126!3d35.6966!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x60188ed0d1bfd3d1%3A0x3b9d96d0748f6b6d!2z5p2x5paH5YmN5Y6f6IiI5bqX!5e0!3m2!1szh-TW!2stw!4v1700000000000!5m2!1szh-TW!2stw" 
            className="absolute inset-0 w-full h-full border-0 opacity-100 transition-all"
            allowFullScreen 
            loading="lazy" 
            referrerPolicy="no-referrer-when-downgrade"
          ></iframe>
        </div>
      </div>
    </section>
  );
}
