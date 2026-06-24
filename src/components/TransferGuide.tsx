import { Bus, Train, Zap, MapPin, DollarSign, Clock, Info } from "lucide-react";

export function TransferGuide() {
  const guides = [
    {
      title: "機場直達利木津巴士",
      subtitle: "最省心、免搬行李",
      icon: <Bus className="text-orange-600 dark:text-orange-400 w-6 h-6" />,
      borderColor: "border-orange-500",
      bgColor: "bg-orange-100 dark:bg-orange-500/20",
      method: "在成田機場第二航廈巴士售票處購買往「淺草、錦糸町、東陽町地區」車票，或搭乘「Skytree Shuttle」。",
      cost: "成人約 3,100 日圓 / 兒童 1,550 日圓 (Skytree Shuttle 僅 2,000 日圓)",
      duration: "約 80 ~ 90 分鐘",
      features: ["直達飯店門口免搬行李", "保證有座位", "適合帶小孩或大型行李"],
      note: "班次相對較少，且可能遇到公路塞車。"
    },
    {
      title: "JR 總武線快速列車",
      subtitle: "高 CP 值、免轉乘鐵路",
      icon: <Train className="text-blue-600 dark:text-blue-400 w-6 h-6" />,
      borderColor: "border-blue-500",
      bgColor: "bg-blue-100 dark:bg-blue-500/20",
      method: "B1 JR 改札口搭乘「JR 成田線快速／直通總武線快速」(往久里濱或逗子) 直達「錦糸町站」。",
      cost: "約 1,410 日圓 (可刷 IC 卡)",
      duration: "約 75 ~ 80 分鐘",
      features: ["一車直達免轉乘", "價格划算", "錦糸町北口步行 3-5 分鐘"],
      note: "一般通勤電車無行李架，一小時約一班直達車。"
    },
    {
      title: "京成 Access 特快 + 地鐵",
      subtitle: "班次多、速度快",
      icon: <Zap className="text-green-600 dark:text-green-400 w-6 h-6" />,
      borderColor: "border-green-500",
      bgColor: "bg-green-100 dark:bg-green-500/20",
      method: "搭乘「京成 Access 特快」往西馬込或羽田至「押上站」，轉乘「地鐵半藏門線」1 站至「錦糸町」。",
      cost: "全程約 1,380 日圓",
      duration: "約 65 ~ 70 分鐘 (含轉乘)",
      features: ["班次多且車程短", "押上站內轉乘單純", "性價比極高"],
      note: "需要在押上站轉乘一次。"
    },
    {
      title: "Skyliner + JR 線轉乘",
      subtitle: "速度最快、舒適度高",
      icon: <Train className="text-purple-600 dark:text-purple-400 w-6 h-6" />,
      borderColor: "border-purple-500",
      bgColor: "bg-purple-100 dark:bg-purple-500/20",
      method: "搭乘「Skyliner」至「日暮里」，換山手線至「秋葉原」，再換中央總武線至「錦糸町」。",
      cost: "約 2,800 日圓以上",
      duration: "總車程約 65 分鐘",
      features: ["全車對號座、極速", "專屬行李置放架", "座位寬敞舒適"],
      note: "需轉乘兩次，攜帶重型行李較為勞累。"
    }
  ];

  return (
    <section id="transfer" className="py-20 px-6 bg-gray-50 dark:bg-slate-900/50 transition-colors duration-300">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">🚆 成田機場 ⇄ 錦糸町 交通指南</h2>
          <p className="text-gray-600 dark:text-gray-400">根據您的預算與行李量選擇最適合的交通方式</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {guides.map((guide, idx) => (
            <div 
              key={idx} 
              className={`bg-white dark:bg-slate-800 rounded-3xl p-6 md:p-8 shadow-xl border-l-8 ${guide.borderColor} hover:shadow-2xl transition-all duration-300 flex flex-col`}
            >
              <div className="flex items-center gap-4 mb-6">
                <div className={`${guide.bgColor} w-14 h-14 rounded-2xl flex items-center justify-center shrink-0`}>
                  {guide.icon}
                </div>
                <div>
                  <h3 className="text-2xl md:text-2xl font-bold text-gray-900 dark:text-white">{guide.title}</h3>
                  <p className="text-base font-bold text-primary opacity-80">{guide.subtitle}</p>
                </div>
              </div>

              <div className="space-y-4 flex-1">
                <div className="flex gap-3">
                  <MapPin className="w-5 h-5 text-gray-400 shrink-0 mt-1" />
                  <div>
                    <span className="text-sm font-bold text-gray-400 uppercase tracking-wider block mb-1">乘車方式</span>
                    <p className="text-base text-gray-600 dark:text-gray-300 leading-relaxed">{guide.method}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 dark:bg-slate-700/50 p-3 rounded-2xl">
                    <div className="flex items-center gap-1 text-sm font-bold text-gray-400 mb-1">
                      <DollarSign className="w-3 h-3" /> 車資
                    </div>
                    <p className="text-base font-bold">{guide.cost}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-slate-700/50 p-3 rounded-2xl">
                    <div className="flex items-center gap-1 text-sm font-bold text-gray-400 mb-1">
                      <Clock className="w-3 h-3" /> 車程
                    </div>
                    <p className="text-base font-bold">{guide.duration}</p>
                  </div>
                </div>

                <div>
                  <span className="text-sm font-bold text-gray-400 uppercase tracking-wider block mb-2">特點</span>
                  <div className="flex flex-wrap gap-2">
                    {guide.features.map((f, i) => (
                      <span key={i} className="text-sm bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded-lg font-medium text-gray-700 dark:text-gray-200">
                        ✓ {f}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-100 dark:border-slate-700 flex items-start gap-2">
                <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="text-sm text-gray-500 dark:text-gray-400 italic leading-relaxed">
                  {guide.note}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
