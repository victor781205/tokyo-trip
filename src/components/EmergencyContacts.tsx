"use client";

import { Phone, Shield, Stethoscope, Building2, Globe, MapPin, AlertTriangle, Heart } from "lucide-react";

const CONTACTS = [
  { icon: Shield, label: "日本報警", number: "110", sub: "警察 (Police)", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { icon: Stethoscope, label: "救護車・消防", number: "119", sub: "急救 (Ambulance / Fire)", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  { icon: Building2, label: "駐日台北代表處", number: "+81-3-3280-7811", sub: "東京事務所 (Taipei Representative Office)", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
  { icon: Globe, label: "JNTO 旅遊熱線", number: "050-3816-2787", sub: "24小時多語言觀光諮詢", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  { icon: Heart, label: "旅遊保障熱線", number: "03-3592-1266", sub: "旅遊糾紛・消費爭議", color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400" },
  { icon: MapPin, label: "台灣桃園機場", number: "+886-3-398-3728", sub: "出發地機場聯繫", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
];

const HOSPITALS = [
  { name: "東京警察病院", area: "東京都文京区", phone: "+81-3-3811-1181" },
  { name: "聖路加國際病院", area: "東京都中央区", phone: "+81-3-3541-5151" },
  { name: "亀田総合病院", area: "千葉県", phone: "+81-4-7092-2211" },
];

export function EmergencyContacts() {
  const handleCall = (number: string) => {
    window.location.href = `tel:${number.replace(/[^+\d]/g, "")}`;
  };

  return (
    <section id="emergency" className="py-20 px-4 md:px-6 lg:px-8 max-w-5xl mx-auto transition-colors duration-300">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-block bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest mb-4">Emergency Info</div>
        <h2 className="text-3xl md:text-5xl font-black mb-4">🚨 緊急聯絡資訊</h2>
        <p className="text-gray-600 dark:text-gray-400">日本旅遊必備的緊急電話與求助管道</p>
      </div>

      {/* Warning Banner */}
      <div className="mb-10 p-5 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-start gap-4">
        <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <h4 className="font-black text-amber-800 dark:text-amber-300 mb-1">重要提醒</h4>
          <p className="text-sm text-amber-700 dark:text-amber-400">在海外撥打緊急電話時，請先加上國碼。日本境內直撥即可。若需報警但語言不通，可要求「通訳（翻譯）」服務。</p>
        </div>
      </div>

      {/* Contact Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-12">
        {CONTACTS.map((contact) => {
          const Icon = contact.icon;
          return (
            <button
              key={contact.number}
              onClick={() => handleCall(contact.number)}
              className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-lg border border-gray-100 dark:border-slate-700 hover:shadow-xl hover:scale-[1.02] transition-all active:scale-[0.98] text-left group"
            >
              <div className="flex items-start gap-4 mb-4">
                <div className={`p-3 rounded-2xl ${contact.color} group-hover:scale-110 transition-transform`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-lg text-gray-900 dark:text-white">{contact.label}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{contact.sub}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-gray-50 dark:bg-slate-900 rounded-2xl p-4">
                <Phone className="w-5 h-5 text-primary shrink-0" />
                <span className="font-mono font-black text-xl text-primary">{contact.number}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Hospital Section */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 shadow-xl border border-gray-100 dark:border-slate-700">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded-2xl">
            <Stethoscope className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h3 className="text-xl font-black text-gray-900 dark:text-white">推薦醫院</h3>
            <p className="text-sm text-gray-500">可接受外國遊客的醫療機構</p>
          </div>
        </div>
        <div className="space-y-4">
          {HOSPITALS.map((hospital) => (
            <div key={hospital.name} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gray-50 dark:bg-slate-900 rounded-2xl">
              <div>
                <h4 className="font-black text-gray-900 dark:text-white">{hospital.name}</h4>
                <p className="text-sm text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3" />{hospital.area}</p>
              </div>
              <button
                onClick={() => handleCall(hospital.phone)}
                className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl font-black text-sm active:scale-95 transition-transform"
              >
                <Phone className="w-4 h-4" />
                {hospital.phone}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
