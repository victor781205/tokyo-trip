"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, MapPin, Navigation, Plus, Search, Star, Trash2, Utensils, Map, List, Clock, Footprints, Filter, Edit3 } from "lucide-react";
import { useTripState } from "@/hooks/useTripState";

// ── 飯店座標（錦糸町 東武黎凡特飯店）──
const HOTEL_COORDS = { lat: 35.6968, lng: 139.8144 };

// ── 餐廳資料擴充：加入座標 ──
type FoodItem = {
    name: string;
    star: string;
    reviews: string;
    loc: string;
    desc: string;
    lat: number;
    lng: number;
};

const FOOD_CATEGORIES = [
    { id: "ramen", label: "拉麵", icon: "🍜" },
    { id: "sushi", label: "壽司", icon: "🍣" },
    { id: "yakiniku", label: "燒肉/和牛", icon: "🥩" },
    { id: "cafe", label: "甜點/咖啡", icon: "🍰" },
    { id: "local", label: "居酒屋/在地", icon: "🍺" },
    { id: "global", label: "洋食/其他", icon: "🍱" },
];

const DISTRICT_FILTERS = [
    { id: "all", label: "全部", icon: "📍" },
    { id: "錦糸町", label: "錦糸町", icon: "🏨" },
    { id: "淺草", label: "淺草", icon: "⛩️" },
    { id: "上野", label: "上野", icon: "🐼" },
    { id: "秋葉原", label: "秋葉原", icon: "🎮" },
    { id: "銀座", label: "銀座", icon: "💎" },
    { id: "新宿", label: "新宿", icon: "🛍️" },
    { id: "澀谷", label: "澀谷", icon: "🐕" },
    { id: "六本木", label: "六本木", icon: "🌃" },
    { id: "東京車站", label: "東京車站", icon: "🚉" },
    { id: "押上", label: "押上", icon: "🗼" },
    { id: "豐洲", label: "豐洲", icon: "🐟" },
    { id: "築地", label: "築地", icon: "🍣" },
    { id: "原宿", label: "原宿", icon: "🎀" },
    { id: "表參道", label: "表參道", icon: "🌳" },
    { id: "中目黑", label: "中目黑", icon: "☕" },
    { id: "惠比壽", label: "惠比壽", icon: "🍷" },
    { id: "日比谷", label: "日比谷", icon: "🏙️" },
    { id: "池袋", label: "池袋", icon: "🎪" },
];

const RECOMMENDED_FOODS: Record<string, FoodItem[]> = {
    ramen: [
        { name: "一蘭 澀谷店", star: "4.4", reviews: "5,100+", loc: "澀谷", desc: "全球最知名的豚骨拉麵，客製化口味必試。", lat: 35.6598, lng: 139.7006 },
        { name: "AFURI 原宿", star: "4.5", reviews: "5,400+", loc: "原宿", desc: "招牌柚子鹽拉麵，清爽不膩的高級口感。", lat: 35.6694, lng: 139.7051 },
        { name: "風雲兒", star: "4.3", reviews: "5,600+", loc: "新宿", desc: "東京最強沾麵之一，濃郁魚介豚骨湯頭。", lat: 35.6918, lng: 139.7042 },
        { name: "真鯛らーめん 面魚", star: "4.0", reviews: "2,800+", loc: "錦糸町", desc: "使用宇和島產真鯛熬製，極致鮮美的在地名店。", lat: 35.6962, lng: 139.8132 },
        { name: "六厘舍", star: "4.1", reviews: "5,200+", loc: "東京車站", desc: "拉麵街排隊王，超濃厚沾麵的代名詞。", lat: 35.6812, lng: 139.7671 },
        { name: "銀座 篝 (Kagari)", star: "4.2", reviews: "4,500+", loc: "銀座", desc: "米其林推薦，如濃湯般甘甜的雞白湯拉麵。", lat: 35.6717, lng: 139.7649 },
        { name: "入鹿 TOKYO", star: "4.0", reviews: "1,600+", loc: "六本木", desc: "多重湯頭揉合，精緻如法式料理的拉麵。", lat: 35.6628, lng: 139.7309 },
        { name: "麵屋武藏 新宿本店", star: "4.1", reviews: "3,700+", loc: "新宿", desc: "豪邁的叉燒塊與濃郁湯頭，飽足感十足。", lat: 35.6938, lng: 139.7026 },
        { name: "鴨 to 蔥", star: "4.5", reviews: "13,600+", loc: "上野", desc: "僅用鴨、蔥、水熬煮，純粹且深邃的美味。", lat: 35.7102, lng: 139.7750 },
        { name: "金色不如歸", star: "4.1", reviews: "2,600+", loc: "新宿", desc: "米其林一星，蛤蜊與松露香氣的完美結合。", lat: 35.6932, lng: 139.6989 },
    ],
    sushi: [
        { name: "壽司大 (Sushi Dai)", star: "4.5", reviews: "1,900+", loc: "豐洲", desc: "東京第一名店，清晨排隊也值得的終極鮮味。", lat: 35.6462, lng: 139.7786 },
        { name: "美登利壽司總本店", star: "4.2", reviews: "2,200+", loc: "澀谷", desc: "高 CP 值精品壽司，食材大方新鮮。總本店位於梅丘。", lat: 35.6628, lng: 139.6555 },
        { name: "根室花丸 銀座店", star: "4.1", reviews: "4,200+", loc: "銀座", desc: "來自北海道的迴轉壽司，鮮度與種類驚人。", lat: 35.6720, lng: 139.7662 },
        { name: "壽司郎 Asakusa", star: "3.9", reviews: "900+", loc: "淺草", desc: "平價迴轉壽司連鎖，種類豐富且環境舒適。", lat: 35.7115, lng: 139.7962 },
        { name: "まんてん鮨 (Manten)", star: "4.3", reviews: "1,500+", loc: "丸之內", desc: "高級 Omakase 的親民選擇，預約困難店。", lat: 35.6813, lng: 139.7671 },
        { name: "銀座 久兵衛", star: "4.4", reviews: "2,600+", loc: "銀座", desc: "江戶前壽司的殿堂，極致的職人服務。", lat: 35.6714, lng: 139.7658 },
        { name: "沼津港 新宿店", star: "3.8", reviews: "2,300+", loc: "新宿", desc: "新宿迴轉壽司，海膽種類豐富。", lat: 35.6904, lng: 139.7019 },
        { name: "くら寿司 押上店", star: "3.9", reviews: "800+", loc: "押上", desc: "全球最大規模旗艦店，好玩又好吃。", lat: 35.7100, lng: 139.8132 },
        { name: "すしざんまい 24時錦糸町店", star: "4.0", reviews: "500+", loc: "錦糸町", desc: "24 小時營業的知名迴轉壽司，深夜也能享用。", lat: 35.6965, lng: 139.8128 },
        { name: "うに虎 築地", star: "4.5", reviews: "1,400+", loc: "築地", desc: "招牌海膽專門店，新鮮海鮮丼飯的代名詞。", lat: 35.6654, lng: 139.7707 },
    ],
    yakiniku: [
        { name: "敘敘苑 遊玄亭", star: "4.4", reviews: "900+", loc: "新宿", desc: "燒肉界的奢華代表，服務與肉質無可挑剔。", lat: 35.6896, lng: 139.7005 },
        { name: "六歌仙 (Rokkasen)", star: "4.6", reviews: "3,200+", loc: "新宿", desc: "超人氣和牛吃到飽，遊客心中的 No.1。", lat: 35.6934, lng: 139.7032 },
        { name: "牛炸串本村 (Motomura)", star: "4.9", reviews: "3,000+", loc: "澀谷", desc: "排隊神店，三分熟炸牛排石板自烤。", lat: 35.6590, lng: 139.7034 },
        { name: "肉之萬世", star: "4.1", reviews: "200+", loc: "秋葉原", desc: "整棟都是肉料理，頂級黑毛和牛壽喜燒。", lat: 35.6984, lng: 139.7731 },
        { name: "燒肉 LIKE 錦糸町", star: "3.6", reviews: "300+", loc: "錦糸町", desc: "個人燒肉首選，快速、平價且肉質有水準。", lat: 35.6968, lng: 139.8135 },
        { name: "USHIGORO S.", star: "4.6", reviews: "500+", loc: "銀座", desc: "精品級全包廂服務，只提供最高等級 A5 和牛。", lat: 35.6731, lng: 139.7638 },
        { name: "薩摩牛 藏", star: "4.6", reviews: "300+", loc: "澀谷", desc: "來自鹿兒島的頂級和牛，環境具現代設計感。", lat: 35.6603, lng: 139.6982 },
        { name: "鐵板燒 白秋", star: "4.7", reviews: "900+", loc: "澀谷", desc: "溫馨的家族經營店，神戶牛鐵板燒極品。", lat: 35.6572, lng: 139.7029 },
        { name: "土古里 新宿", star: "3.8", reviews: "600+", loc: "新宿", desc: "山形牛一頭買，提供各種稀有部位。", lat: 35.6912, lng: 139.7034 },
        { name: "今半 壽喜燒", star: "4.5", reviews: "2,000+", loc: "上野", desc: "百年老店，關東風壽喜燒的最巔峰。", lat: 35.6824, lng: 139.7820 },
    ],
    cafe: [
        { name: "HARBS 新宿店", star: "4.2", reviews: "2,000+", loc: "新宿", desc: "招牌水果千層蛋糕，東京甜點必排行程。", lat: 35.6896, lng: 139.7004 },
        { name: "藍瓶咖啡 澀谷", star: "4.6", reviews: "1,600+", loc: "澀谷", desc: "公園景觀店，極簡設計與精品手沖咖啡。", lat: 35.6575, lng: 139.7018 },
        { name: "星巴克 臻選® 旗艦店", star: "4.5", reviews: "13,700+", loc: "中目黑", desc: "全球僅六間的旗艦店，建築由隈研吾大師設計。", lat: 35.6431, lng: 139.6995 },
        { name: "淺草 梅園", star: "4.0", reviews: "700+", loc: "淺草", desc: "安政元年創立，招牌粟善哉是傳統甜點代表。", lat: 35.7118, lng: 139.7960 },
        { name: "Bills 銀座", star: "4.1", reviews: "3,200+", loc: "銀座", desc: "世界第一早餐，絲滑香蕉熱鬆餅。", lat: 35.6715, lng: 139.7648 },
        { name: "Qu'il fait bon", star: "4.2", reviews: "1,800+", loc: "銀座", desc: "水果塔的天花板，嚴選當季最頂級果物。", lat: 35.6724, lng: 139.7632 },
        { name: "Tsujiri 辻利 晴空塔", star: "4.2", reviews: "700+", loc: "押上", desc: "抹茶控必訪，濃郁道地的京都宇治抹茶。", lat: 35.7100, lng: 139.8107 },
        { name: "Ginza West", star: "4.3", reviews: "1,300+", loc: "銀座", desc: "古典懷舊咖啡廳，體驗老派紳士的優雅下午茶。", lat: 35.6738, lng: 139.7624 },
        { name: "Café de L'Ambre", star: "4.3", reviews: "1,900+", loc: "銀座", desc: "只賣咖啡的老店，咖啡職人朝聖之地。", lat: 35.6718, lng: 139.7668 },
        { name: "喫茶 You", star: "4.0", reviews: "2,000+", loc: "銀座", desc: "網紅蛋包飯名店，極致絲滑的口感。", lat: 35.6730, lng: 139.7650 },
    ],
    local: [
        { name: "利久牛舌 晴空塔店", star: "4.3", reviews: "1,000+", loc: "押上", desc: "來自仙台的厚切牛舌，Q 彈多汁必吃。", lat: 35.7100, lng: 139.8107 },
        { name: "上野 大統領", star: "4.0", reviews: "1,700+", loc: "上野", desc: "最道地的立飲居酒屋，內臟煮與串燒名店。", lat: 35.7108, lng: 139.7742 },
        { name: "淺草 大黑家", star: "3.5", reviews: "3,400+", loc: "淺草", desc: "傳承百年的天婦羅，特製黑醬汁風味。", lat: 35.7120, lng: 139.7965 },
        { name: "伊豆榮 本店", star: "4.1", reviews: "3,100+", loc: "上野", desc: "創業 270 年的鰻魚飯老店，炭火慢烤備長炭。", lat: 35.7138, lng: 139.7748 },
        { name: "鳥貴族 錦糸町", star: "3.4", reviews: "300+", loc: "錦糸町", desc: "全品項均一價，高品質燒鳥居酒屋。", lat: 35.6966, lng: 139.8140 },
        { name: "三定 天婦羅", star: "3.5", reviews: "1,300+", loc: "淺草", desc: "日本最古老的天婦羅店，鄰近雷門。", lat: 35.7116, lng: 139.7958 },
        { name: "阿美橫丁 鐵火丼", star: "3.6", reviews: "300+", loc: "上野", desc: "最在地、最熱鬧的海鮮丼街頭小吃。", lat: 35.7105, lng: 139.7740 },
        { name: "磯丸水產 澀谷", star: "3.8", reviews: "600+", loc: "澀谷", desc: "24 小時營業，自己現烤活海鮮，氛圍極佳。", lat: 35.6590, lng: 139.6994 },
        { name: "とり錦 錦糸町", star: "4.1", reviews: "1,100+", loc: "錦糸町", desc: "飯店周邊評價高的備長炭燒鳥店，完全個室。", lat: 35.6960, lng: 139.8138 },
        { name: "銀座 梅林", star: "4.4", reviews: "1,400+", loc: "銀座", desc: "炸豬排鼻祖店，招牌豬排三明治必買。", lat: 35.6728, lng: 139.7640 },
    ],
    global: [
        { name: "銀座 煉瓦亭", star: "3.7", reviews: "1,900+", loc: "銀座", desc: "日本洋食起源，炸豬排與蛋包飯的始祖。", lat: 35.6722, lng: 139.7645 },
        { name: "Shake Shack 外苑", star: "4.1", reviews: "3,400+", loc: "表參道", desc: "銀杏大道下的最美漢堡店。", lat: 35.6685, lng: 139.7132 },
        { name: "Luke's Lobster", star: "4.1", reviews: "2,900+", loc: "表參道", desc: "滿載龍蝦肉的美味三明治，街拍神店。", lat: 35.6660, lng: 139.7108 },
        { name: "The Apollo", star: "4.0", reviews: "2,000+", loc: "銀座", desc: "精品地中海料理，位於銀座 Novo 大樓頂層。", lat: 35.6718, lng: 139.7636 },
        { name: "T's TanTan", star: "4.6", reviews: "2,900+", loc: "東京車站", desc: "超人氣純素擔擔麵，口感連肉食者都驚艷。", lat: 35.6812, lng: 139.7671 },
        { name: "神田たまごけん", star: "4.5", reviews: "2,900+", loc: "秋葉原", desc: "現做鬆軟滑蛋包飯，多種特製醬汁。", lat: 35.6980, lng: 139.7725 },
        { name: "Mercer Brunch", star: "3.8", reviews: "1,300+", loc: "銀座", desc: "時尚早午餐代表，招牌法式吐司精緻美味。", lat: 35.6726, lng: 139.7652 },
        { name: "Burger Mania", star: "4.2", reviews: "1,000+", loc: "惠比壽", desc: "東京人氣手工漢堡名店，口味獨特。", lat: 35.6467, lng: 139.7101 },
        { name: "龍吟", star: "4.0", reviews: "500+", loc: "日比谷", desc: "米其林級日本料理，創新與傳統的完美結合。", lat: 35.6763, lng: 139.7589 },
        { name: "権八 西麻布", star: "4.3", reviews: "8,100+", loc: "六本木", desc: "《追殺比爾》場景靈感店，體驗日本盛宴氛圍。", lat: 35.6592, lng: 139.7288 },
    ]
};

// ── 計算兩點間距離（Haversine 公式，單位：公里）──
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── 估算電車時間（簡化版：平均 30km/h 含等車步行）──
function estimateTransitTime(km: number): string {
    if (km < 1) return "步行 5~10 分";
    const min = Math.round(km / 0.5 + 5); // 簡化估算
    if (min < 15) return "電車 ~10 分";
    if (min < 25) return "電車 ~15 分";
    if (min < 35) return "電車 ~20 分";
    if (min < 50) return "電車 ~30 分";
    return "電車 ~40 分";
}

export function Food() {
    const { customFoods, updateCustomFoods } = useTripState();
    const [activeCat, setActiveCat] = useState("ramen");
    const [activeDistrict, setActiveDistrict] = useState("all");
    const [url, setUrl] = useState("");
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [formData, setFormData] = useState({
        emoji: "🍣", name: "", location: "", hours: "", desc: "", mapLink: "", image: "", lat: undefined as number | undefined, lng: undefined as number | undefined,
    });
    const [isCustomType, setIsCustomType] = useState(false);
    const [customEmoji, setCustomEmoji] = useState("🍔");
    const [customLabel, setCustomLabel] = useState("");
    const [editingId, setEditingId] = useState<number | null>(null);

    // ── 地圖相關狀態 ──
    const [showMap, setShowMap] = useState(false);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [selectedMarker, setSelectedMarker] = useState<FoodItem | null>(null);
    const mapRef = useRef<HTMLDivElement>(null);
    const googleMapRef = useRef<google.maps.Map | null>(null);
    const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
    const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

    // ── 載入 Google Maps API ──

    // (loadGoogleMaps 已內聯至 useEffect 中，避免 effect 中呼叫含 setState 的函式)

    // ── 更新地圖標記 ──
    const updateMapMarkers = useCallback((map?: google.maps.Map) => {
        const gMap = map || googleMapRef.current;
        if (!gMap || !window.google?.maps) return;

        // 清除舊標記
        markersRef.current.forEach(m => { m.map = null; });
        markersRef.current = [];

        const allItems = RECOMMENDED_FOODS[activeCat] || [];
        const filtered = activeDistrict === "all"
            ? allItems
            : allItems.filter(item => item.loc === activeDistrict);

        filtered.forEach((item, index) => {
            const catInfo = FOOD_CATEGORIES.find(c => c.id === activeCat);
            const emoji = catInfo?.icon || "🍽️";

            const markerEl = document.createElement("div");
            markerEl.innerHTML = `<div style="background:white;padding:4px 8px;border-radius:10px;font-size:12px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,0.2);white-space:nowrap;cursor:pointer;border:2px solid #e74c3c;">${emoji} ${index + 1}</div>`;

            const marker = new google.maps.marker.AdvancedMarkerElement({
                position: { lat: item.lat, lng: item.lng },
                map: gMap,
                title: item.name,
                content: markerEl,
            });

            const dist = haversineDistance(HOTEL_COORDS.lat, HOTEL_COORDS.lng, item.lat, item.lng);
            const time = estimateTransitTime(dist);

            marker.addListener("click", () => {
                setSelectedMarker(item);
                if (infoWindowRef.current) {
                    infoWindowRef.current.setContent(`
                        <div style="padding:10px;font-family:sans-serif;max-width:260px;">
                            <h3 style="margin:0 0 6px;font-size:15px;">${emoji} ${item.name}</h3>
                            <p style="margin:0 0 4px;font-size:13px;">⭐ ${item.star} · ${item.reviews} 則評價</p>
                            <p style="margin:0 0 4px;font-size:12px;color:#666;">📍 ${item.loc} · 🚃 ${time} (${dist.toFixed(1)}km)</p>
                            <p style="margin:0;font-size:12px;color:#888;font-style:italic;">${item.desc}</p>
                        </div>
                    `);
                    infoWindowRef.current.open(gMap, marker);
                }
            });

            markersRef.current.push(marker);
        });

        // 調整視窗範圍
        if (filtered.length > 0) {
            const bounds = new google.maps.LatLngBounds();
            bounds.extend(HOTEL_COORDS);
            filtered.forEach(item => bounds.extend({ lat: item.lat, lng: item.lng }));
            gMap.fitBounds(bounds, 60);
        }
    }, [activeCat, activeDistrict]);

    // ── 初始化地圖 ──
    const initMap = useCallback(() => {
        if (!mapRef.current || !window.google?.maps) return;

        const map = new google.maps.Map(mapRef.current, {
            center: HOTEL_COORDS,
            zoom: 12,
            mapId: "tokyo-food-map",
            disableDefaultUI: false,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
        });
        googleMapRef.current = map;

        const infoWindow = new google.maps.InfoWindow();
        infoWindowRef.current = infoWindow;

        // 飯店標記
        const hotelMarker = new google.maps.marker.AdvancedMarkerElement({
            position: HOTEL_COORDS,
            map,
            title: "🏨 飯店（錦糸町）",
            content: (() => {
                const div = document.createElement("div");
                div.innerHTML = `<div style="background:#e74c3c;color:white;padding:6px 10px;border-radius:12px;font-size:14px;font-weight:900;box-shadow:0 4px 12px rgba(0,0,0,0.3);white-space:nowrap;">🏨 飯店</div>`;
                return div;
            })(),
        });
        hotelMarker.addListener("click", () => {
            infoWindow.setContent(`
                <div style="padding:8px;font-family:sans-serif;">
                    <h3 style="margin:0 0 4px;font-size:16px;">🏨 東武黎凡特飯店</h3>
                    <p style="margin:0;font-size:13px;color:#666;">錦糸町 — 行程起點</p>
                </div>
            `);
            infoWindow.open(map, hotelMarker);
        });

        google.maps.event.addListenerOnce(map, "idle", () => {
            updateMapMarkers(map);
        });
    }, [updateMapMarkers]);

    // ── 切換顯示地圖時載入 API ──
    useEffect(() => {
        if (!showMap) return;

        // 若地圖已存在，直接標記為已載入（由 script.onload 處理）
        if (window.google?.maps) {
            return;
        }
        if (document.getElementById("google-maps-script")) return;

        const script = document.createElement("script");
        script.id = "google-maps-script";
        script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&v=weekly&libraries=marker`;
        script.async = true;
        script.defer = true;
        script.onload = () => setMapLoaded(true);
        document.head.appendChild(script);
    }, [showMap]);

    // ── 當 window.google.maps 可用時標記為已載入（用單獨 effect 同步外部狀態）──
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (window.google?.maps && !mapLoaded) {
            setMapLoaded(true);
        }
    }, [mapLoaded]);
    /* eslint-enable react-hooks/set-state-in-effect */

    // ── API 載入後初始化地圖 ──
    useEffect(() => {
        if (showMap && mapLoaded && mapRef.current) {
            if (!googleMapRef.current) {
                initMap();
            } else {
                updateMapMarkers();
            }
        }
        // 清除舊地圖實例，避免 toggle 後引用已脫離 DOM 的地圖
        if (!showMap && googleMapRef.current) {
            googleMapRef.current = null;
            markersRef.current = [];
        }
    }, [showMap, mapLoaded, initMap, updateMapMarkers]);

    // ── 分類或篩選變更時更新標記 ──
    useEffect(() => {
        if (googleMapRef.current && showMap && mapLoaded) {
            updateMapMarkers();
        }
    }, [activeCat, activeDistrict, updateMapMarkers, showMap, mapLoaded]);

    // ── 分類切換時重置區域篩選 ──
    // (已移至 onClick 事件中處理，避免 effect 中 setState 警告)
    // 相關代碼在下方 onClick={() => { setActiveCat(cat.id); setActiveDistrict("all"); }}

    const analyzeUrl = async (inputUrl: string) => {
        if (!inputUrl.includes("google.com/maps") && !inputUrl.includes("maps.app.goo.gl")) return;
        setIsAnalyzing(true);
        try {
            const res = await fetch(`/api/map-info?url=${encodeURIComponent(inputUrl)}`);
            const data = await res.json();
            if (data.name) {
                const isStandard = FOOD_CATEGORIES.some(cat => cat.icon === data.emoji);
                if (data.emoji && !isStandard) {
                    setIsCustomType(true);
                    setCustomEmoji(data.emoji);
                    setCustomLabel(data.category || "");
                } else {
                    setIsCustomType(false);
                }
                setFormData(prev => ({
                    ...prev, name: data.name, mapLink: inputUrl,
                    emoji: data.emoji || prev.emoji, location: data.location || prev.location,
                    hours: data.hours || prev.hours, desc: data.category ? `分類：${data.category}` : prev.desc,
                    lat: data.lat ?? prev.lat, lng: data.lng ?? prev.lng,
                }));
            }
        } catch (e) {
            console.error("Failed to analyze URL", e);
        } finally { setIsAnalyzing(false); }
    };

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setUrl(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (val.startsWith("http")) {
            debounceRef.current = setTimeout(() => analyzeUrl(val), 600);
        }
    };

    const resetForm = () => {
        setFormData({ emoji: "🍣", name: "", location: "", hours: "", desc: "", mapLink: "", image: "", lat: undefined, lng: undefined });
        setUrl("");
        setIsCustomType(false);
        setCustomEmoji("🍔");
        setCustomLabel("");
        setEditingId(null);
    };

    const handleAdd = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name) return;
        if (editingId) {
            // 編輯模式：更新現有項目
            updateCustomFoods(customFoods.map(f => f.id === editingId ? { ...formData, id: editingId } : f));
        } else {
            // 新增模式
            updateCustomFoods([{ ...formData, id: Date.now() }, ...customFoods]);
        }
        resetForm();
    };

    const handleEdit = (food: typeof customFoods[0]) => {
        setEditingId(food.id);
        setFormData({
            emoji: food.emoji, name: food.name, location: food.location,
            hours: food.hours, desc: food.desc, mapLink: food.mapLink, image: food.image,
            lat: food.lat, lng: food.lng,
        });
        setUrl(food.mapLink);
        setIsCustomType(!FOOD_CATEGORIES.some(cat => cat.icon === food.emoji));
        if (!FOOD_CATEGORIES.some(cat => cat.icon === food.emoji)) {
            setCustomEmoji(food.emoji);
        }
        // 滾動到表單
        const formEl = document.querySelector("#custom-food-form");
        if (formEl) {
            window.scrollTo({ top: formEl.getBoundingClientRect().top + window.scrollY - 100, behavior: "smooth" });
        }
    };

    const handleDelete = (id: number) => {
        if (!confirm("確定要刪除這筆美食嗎？")) return;
        updateCustomFoods(customFoods.filter(f => f.id !== id));
        // 若刪除的正是正在編輯的項目，重置表單
        if (editingId === id) resetForm();
    };

    const handleNavigate = (shopName: string, destLat?: number, destLng?: number) => {
        if (destLat != null && destLng != null) {
            // 有座標：使用精確的飯店→餐廳導航
            const url = `https://www.google.com/maps/dir/?api=1&origin=${HOTEL_COORDS.lat},${HOTEL_COORDS.lng}&destination=${destLat},${destLng}&travelmode=transit`;
            window.open(url, "_blank");
        } else {
            // 無座標：使用店名搜尋導航
            const url = `https://www.google.com/maps/dir/?api=1&origin=${HOTEL_COORDS.lat},${HOTEL_COORDS.lng}&destination=${encodeURIComponent(shopName + " Tokyo")}&travelmode=transit`;
            window.open(url, "_blank");
        }
    };

    // ── 篩選後的餐廳列表 ──
    const currentFoods = RECOMMENDED_FOODS[activeCat] || [];
    const filteredFoods = activeDistrict === "all"
        ? currentFoods
        : currentFoods.filter(item => item.loc === activeDistrict);

    // ── 當前分類可用的區域 ──
    const availableDistricts = DISTRICT_FILTERS.filter(d => d.id === "all" || currentFoods.some(item => item.loc === d.id));

    return (
        <section id="food" className="py-4 px-4 md:px-12 max-w-7xl mx-auto">
            <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-5 md:p-8 shadow-2xl border border-gray-100 dark:border-slate-700">

                {/* ── 標題與地圖切換 ── */}
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl md:text-3xl font-black flex items-center gap-2">
                        🍽️ 東京美食地圖
                    </h2>
                    <button
                        onClick={() => setShowMap(!showMap)}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-sm transition-all active:scale-95 ${showMap
                            ? "bg-primary text-white shadow-lg shadow-primary/30"
                            : "bg-gray-50 dark:bg-slate-900 text-gray-500 border border-gray-100 dark:border-slate-700 hover:border-primary/30"
                            }`}
                    >
                        {showMap ? <List className="w-4 h-4" /> : <Map className="w-4 h-4" />}
                        {showMap ? "顯示列表" : "顯示地圖"}
                    </button>
                </div>

                {/* ── 餐廳分類 Tab ── */}
                <div className="flex gap-2 overflow-x-auto pb-3 no-scrollbar mb-4">
                    {FOOD_CATEGORIES.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => { setActiveCat(cat.id); setActiveDistrict("all"); }}
                            aria-label={cat.label}
                            aria-pressed={activeCat === cat.id}
                            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-base transition-all shrink-0 ${activeCat === cat.id
                                ? "bg-primary text-white shadow-lg shadow-primary/30 scale-105"
                                : "bg-gray-50 dark:bg-slate-900 text-gray-500 border border-transparent hover:border-gray-200 dark:hover:border-slate-600"
                                }`}
                        >
                            <span className="text-2xl">{cat.icon}</span> {cat.label}
                        </button>
                    ))}
                </div>

                {/* ── 區域篩選 ── */}
                <div className="flex gap-1.5 overflow-x-auto pb-2 no-scrollbar mb-6">
                    <div className="flex items-center gap-1 text-xs font-bold text-gray-400 shrink-0 px-2">
                        <Filter className="w-3.5 h-3.5" /> 篩選：
                    </div>
                    {availableDistricts.map(d => (
                        <button
                            key={d.id}
                            onClick={() => setActiveDistrict(d.id)}
                            aria-label={d.label}
                            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 ${activeDistrict === d.id
                                ? "bg-orange-500 text-white shadow-md shadow-orange-500/20"
                                : "bg-gray-50 dark:bg-slate-900 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 border border-transparent hover:border-gray-200 dark:hover:border-slate-600"
                                }`}
                        >
                            <span>{d.icon}</span> {d.label}
                        </button>
                    ))}
                </div>

                {/* ── 互動地圖 ── */}
                {showMap && (
                    <div className="relative mb-8 rounded-3xl overflow-hidden border border-gray-100 dark:border-slate-700 shadow-lg animate-in fade-in slide-in-from-top-4 duration-500">
                        <div
                            ref={mapRef}
                            className="w-full h-[400px] md:h-[500px]"
                            style={{ background: "#e5e7eb" }}
                        />
                        {!mapLoaded && (
                            <div className="absolute inset-0 flex items-center justify-center bg-gray-100/80 dark:bg-slate-900/80">
                                <div className="flex items-center gap-3 text-gray-500">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    <span className="font-bold">載入 Google Maps 中...</span>
                                </div>
                            </div>
                        )}
                        {mapLoaded && (
                            <div className="bg-gray-50 dark:bg-slate-900 px-5 py-3 flex items-center justify-between text-xs font-bold text-gray-400">
                                <span>🏨 紅色標記 = 飯店（起點）· 數字標記 = 餐廳</span>
                                <span>📍 共 {filteredFoods.length} 家餐廳</span>
                            </div>
                        )}
                    </div>
                )}

                {/* ── 餐廳卡片網格 ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-10">
                    {filteredFoods.map((item) => {
                        const dist = haversineDistance(HOTEL_COORDS.lat, HOTEL_COORDS.lng, item.lat, item.lng);
                        const time = estimateTransitTime(dist);
                        return (
                            <div
                                key={item.name}
                                className={`bg-gray-50 dark:bg-slate-900 p-4 rounded-2xl border transition-all group relative flex flex-col justify-between ${selectedMarker?.name === item.name
                                    ? "border-primary shadow-lg shadow-primary/10 ring-2 ring-primary/20"
                                    : "border-transparent hover:border-primary/20"
                                    }`}
                            >
                                <div>
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="font-black text-base text-gray-900 dark:text-white truncate flex-1 pr-2">{item.name}</h4>
                                        <div className="flex items-center gap-1 bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded-lg shadow-sm shrink-0">
                                            <Star className="w-2 h-2 text-yellow-500 fill-yellow-500" />
                                            <span className="text-sm font-black">{item.star}</span>
                                        </div>
                                    </div>
                                    <div className="text-sm font-bold text-primary flex items-center gap-1 mb-1">
                                        <MapPin className="w-2.5 h-2.5" /> {item.loc}
                                        <span className="text-gray-400 opacity-50 ml-1">({item.reviews})</span>
                                    </div>
                                    {/* ── 距離與時間 ── */}
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-400">
                                            <Footprints className="w-3 h-3" /> {dist.toFixed(1)}km
                                        </span>
                                        <span className="inline-flex items-center gap-1 text-xs font-bold text-orange-500">
                                            <Clock className="w-3 h-3" /> {time}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-400 leading-tight line-clamp-2 italic mb-3">&ldquo;{item.desc}&rdquo;</p>

                                    {/* Open Status + Action Buttons */}
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-xs font-bold px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                                            🟢 營業中
                                        </span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleNavigate(item.name, item.lat, item.lng)}
                                            className="flex-1 py-2 bg-white dark:bg-slate-800 text-primary border border-primary/10 rounded-xl text-sm font-black flex items-center justify-center gap-2 hover:bg-primary hover:text-white transition-all active:scale-95"
                                        >
                                            <Navigation className="w-3 h-3" /> 導航
                                        </button>
                                        <button
                                            className="flex-1 py-2 bg-primary/10 text-primary border border-primary/10 rounded-xl text-sm font-black flex items-center justify-center gap-2 hover:bg-primary hover:text-white transition-all active:scale-95"
                                        >
                                            📅 預約
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* ── 搜尋結果計數 ── */}
                {activeDistrict !== "all" && (
                    <div className="text-center mb-6">
                        <span className="text-sm font-bold text-gray-400">
                            顯示 <span className="text-primary">{filteredFoods.length}</span> / {currentFoods.length} 家餐廳
                            {filteredFoods.length === 0 && (
                                <button
                                    onClick={() => setActiveDistrict("all")}
                                    className="ml-3 text-primary underline underline-offset-2 hover:no-underline"
                                >
                                    顯示全部
                                </button>
                            )}
                        </span>
                    </div>
                )}

                {/* ── 私藏美食表單 ── */}
                <div className="border-t border-gray-100 dark:border-slate-700 pt-8 mt-4">
                    <h3 className="text-xl font-black mb-6 flex items-center gap-2 px-1">
                        <Utensils className="text-primary w-5 h-5" /> 我的私藏美食清單
                    </h3>
                    <form id="custom-food-form" onSubmit={handleAdd} className={`bg-gray-50 dark:bg-slate-900 p-6 rounded-[2rem] space-y-6 mb-10 border transition-all ${editingId ? "border-primary/40 ring-2 ring-primary/10 shadow-lg shadow-primary/5" : "border-gray-100 dark:border-slate-800"}`}>
                        {editingId && (
                            <div className="flex items-center justify-between bg-primary/5 rounded-xl px-4 py-2.5">
                                <span className="text-sm font-black text-primary flex items-center gap-2">
                                    ✏️ 編輯模式 — 正在修改「{formData.name}」
                                </span>
                                <button type="button" onClick={resetForm} className="text-xs font-bold text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10">
                                    取消編輯
                                </button>
                            </div>
                        )}
                        <div className="space-y-2">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest block ml-1">自動解析（選擇性）</label>
                            <div className="relative group">
                                <input
                                    type="text" placeholder="貼上 Google Map 分享網址自動解析店名與位置..." value={url} onChange={handleUrlChange}
                                    className="w-full p-4 pl-12 pr-12 rounded-2xl border-2 border-transparent bg-white dark:bg-slate-800 focus:border-primary outline-none transition-all text-sm font-bold"
                                />
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                {isAnalyzing && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs sm:text-sm font-black text-gray-400 uppercase tracking-widest block ml-1">餐廳類型 (選填/預設 🍣)</label>
                            <div className="flex flex-wrap gap-2">
                                {FOOD_CATEGORIES.map(cat => (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => {
                                            setIsCustomType(false);
                                            setFormData(prev => ({ ...prev, emoji: cat.icon, desc: `分類：${cat.label}` }));
                                        }}
                                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-all ${!isCustomType && formData.emoji === cat.icon
                                            ? "bg-primary text-white shadow-md shadow-primary/20 scale-105"
                                            : "bg-white dark:bg-slate-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-100 dark:border-slate-800"
                                            }`}
                                    >
                                        <span className="text-lg">{cat.icon}</span>
                                        <span>{cat.label}</span>
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsCustomType(true);
                                        setFormData(prev => ({ ...prev, emoji: customEmoji, desc: customLabel ? `分類：${customLabel}` : "" }));
                                    }}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-all ${isCustomType
                                        ? "bg-primary text-white shadow-md shadow-primary/20 scale-105"
                                        : "bg-white dark:bg-slate-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-100 dark:border-slate-800"
                                        }`}
                                >
                                    <span className="text-lg">✨</span>
                                    <span>自定義</span>
                                </button>
                            </div>
                        </div>

                        {isCustomType && (
                            <div className="grid grid-cols-3 gap-2 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-gray-100 dark:border-slate-700 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="space-y-1 col-span-1">
                                    <label className="text-xs font-black text-gray-400 block ml-1">圖示 Emoji</label>
                                    <input
                                        type="text"
                                        placeholder="🍕"
                                        value={customEmoji}
                                        onChange={e => {
                                            setCustomEmoji(e.target.value);
                                            setFormData(prev => ({ ...prev, emoji: e.target.value }));
                                        }}
                                        className="w-full p-2.5 rounded-xl bg-gray-50 dark:bg-slate-900 text-sm font-black text-center outline-none border border-transparent focus:border-primary/30"
                                        maxLength={4}
                                    />
                                </div>
                                <div className="space-y-1 col-span-2">
                                    <label className="text-xs font-black text-gray-400 block ml-1">類型名稱</label>
                                    <input
                                        type="text"
                                        placeholder="例如：比薩"
                                        value={customLabel}
                                        onChange={e => {
                                            setCustomLabel(e.target.value);
                                            setFormData(prev => ({ ...prev, desc: `分類：${e.target.value}` }));
                                        }}
                                        className="w-full p-2.5 rounded-xl bg-gray-50 dark:bg-slate-900 text-sm font-black outline-none border border-transparent focus:border-primary/30"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest block ml-1">店名</label>
                                <input
                                    type="text"
                                    placeholder="請輸入店名"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full p-3.5 rounded-xl bg-white dark:bg-slate-800 text-sm font-black outline-none border border-gray-100 dark:border-slate-700 focus:border-primary"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest block ml-1">區域/位置 (選填)</label>
                                <input
                                    type="text"
                                    placeholder="例如：澀谷 / 錦糸町"
                                    value={formData.location}
                                    onChange={e => setFormData({ ...formData, location: e.target.value })}
                                    className="w-full p-3.5 rounded-xl bg-white dark:bg-slate-800 text-sm font-black outline-none border border-gray-100 dark:border-slate-700 focus:border-primary"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            className={`w-full py-4 rounded-xl font-black text-base active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg ${editingId
                                ? "bg-orange-500 text-white shadow-orange-500/20 hover:bg-orange-600"
                                : "bg-primary text-white shadow-primary/20"
                                }`}
                            disabled={isAnalyzing}
                        >
                            {editingId ? <><Search className="w-5 h-5" /> 更新美食資訊</> : <><Plus className="w-5 h-5" /> 加入我的私藏清單</>}
                        </button>
                    </form>

                    {customFoods.length === 0 && (
                        <div className="text-center py-12 text-gray-300 dark:text-slate-600">
                            <div className="text-5xl mb-3">🍽️</div>
                            <p className="font-bold text-sm">還沒有私藏美食</p>
                            <p className="text-xs mt-1">貼上 Google Map 網址或手動新增吧！</p>
                        </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {customFoods.map((food) => {
                            const hasCoords = food.lat != null && food.lng != null;
                            const dist = hasCoords ? haversineDistance(HOTEL_COORDS.lat, HOTEL_COORDS.lng, food.lat!, food.lng!) : null;
                            const time = dist != null ? estimateTransitTime(dist) : null;
                            const isEditing = editingId === food.id;
                            return (
                                <div key={food.id} className={`bg-white dark:bg-slate-800 p-4 rounded-3xl shadow-sm border transition-all relative group animate-in fade-in zoom-in duration-300 flex flex-col justify-between ${isEditing
                                    ? "border-primary ring-2 ring-primary/20 shadow-lg shadow-primary/5"
                                    : "border-gray-100 dark:border-slate-700"
                                    }`}>
                                    <div>
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="text-3xl bg-gray-50 dark:bg-slate-900 w-12 h-12 flex items-center justify-center rounded-2xl">{food.emoji}</div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleEdit(food)}
                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors"
                                                    title="編輯"
                                                >
                                                    <Edit3 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                        <h4 className="text-base font-black mb-1 truncate">{food.name}</h4>
                                        <div className="text-sm text-gray-400 flex items-center gap-1 mb-1">
                                            <MapPin className="w-3 h-3" /> {food.location || "未設定"}
                                        </div>
                                        {/* ── 距離與時間（有座標才顯示）── */}
                                        {hasCoords && dist != null && (
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-400">
                                                    <Footprints className="w-3 h-3" /> {dist.toFixed(1)}km
                                                </span>
                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-orange-500">
                                                    <Clock className="w-3 h-3" /> {time}
                                                </span>
                                            </div>
                                        )}
                                        {food.desc && (
                                            <p className="text-xs text-gray-400 leading-tight line-clamp-1 italic mb-3">{food.desc}</p>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleNavigate(food.name, food.lat, food.lng)}
                                            className="flex-1 bg-gray-50 dark:bg-slate-900 p-2 rounded-xl text-sm font-black text-center text-gray-500 hover:text-primary transition-colors border border-gray-100 dark:border-slate-700 flex items-center justify-center gap-1 hover:bg-primary/5 hover:border-primary/20"
                                        >
                                            <Navigation className="w-3 h-3" /> {hasCoords ? "導航" : "GO"}
                                        </button>
                                        <button onClick={() => handleDelete(food.id)} className="bg-red-50 dark:bg-red-900/10 p-2 rounded-xl text-red-400 hover:text-red-500 flex items-center justify-center transition-colors"><Trash2 className="w-3 h-3" /></button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </section>
    );
}
