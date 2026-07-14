"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Loader2, MapPin, Navigation, Plus, Search, Trash2, Utensils, Map, List, Clock, Footprints, Filter, Edit3, Heart, CalendarPlus, CheckCircle2, X } from "lucide-react";
import { useTripState, type Activity, type CustomFood } from "@/hooks/useTripState";
import { useDialog } from "@/context/DialogContext";
import { activitySyncIdFromSource } from "@/lib/activity-identity";
import { DEFAULT_ITINERARY } from "@/lib/default-itinerary";
import {
    GoogleMapsLoadError,
    loadGoogleMaps,
    subscribeToGoogleMapsAuthFailure,
} from "@/lib/google-maps-loader";
import { looksLikeGoogleMapsUrl } from "@/lib/validations";

// ── 飯店座標（錦糸町 東武黎凡特飯店）──
const HOTEL_COORDS = { lat: 35.6968, lng: 139.8144 };

// ── 餐廳資料擴充：加入座標 ──
type FoodItem = {
    name: string;
    loc: string;
    desc: string;
    lat: number;
    lng: number;
    officialUrl?: string;
};

function foodStatusKey(item: Pick<FoodItem, "name" | "loc">) {
    return `recommended:${encodeURIComponent(item.name.trim())}:${encodeURIComponent(item.loc.trim())}`;
}

function customFoodStatusKey(food: Pick<CustomFood, "id" | "syncId">) {
    const identity = food.syncId || String(food.id);
    return `custom:${encodeURIComponent(identity)}`;
}

function legacyCustomFoodStatusKey(id: number) {
    return `custom:${id}`;
}

function foodSourceId(statusKey: string) {
    return `food:${statusKey}`;
}

function scheduleDayLabel(dayKey: string) {
    return `D${dayKey.replace(/^day/, "")}`;
}

function isScheduledFoodActivity(activity: Activity, item: FoodItem, statusKey: string) {
    if (activity.sourceId) return activity.sourceId === foodSourceId(statusKey);
    // Backward compatibility for meals scheduled before sourceId existed.
    // All fields must match so a same-name shop or a hand-written activity is not removed.
    return activity.name === `用餐：${item.name}`
        && activity.tag === "美食"
        && activity.desc === `${item.loc} · ${item.desc}`;
}

function matchesFoodSearch(item: FoodItem, query: string) {
    const normalized = query.trim().toLocaleLowerCase("zh-TW");
    if (!normalized) return true;
    return `${item.name} ${item.loc} ${item.desc}`.toLocaleLowerCase("zh-TW").includes(normalized);
}

const FOOD_CATEGORIES = [
    { id: "ramen", label: "拉麵", icon: "🍜" },
    { id: "sushi", label: "壽司", icon: "🍣" },
    { id: "yakiniku", label: "燒肉/和牛", icon: "🥩" },
    { id: "cafe", label: "甜點/咖啡", icon: "🍰" },
    { id: "local", label: "居酒屋/在地", icon: "🍺" },
    { id: "global", label: "洋食/其他", icon: "🍱" },
];

export const DISTRICT_FILTERS = [
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
    { id: "丸之內", label: "丸之內", icon: "🏢" },
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

export const RECOMMENDED_FOODS: Record<string, FoodItem[]> = {
    ramen: [
        { name: "一蘭 渋谷店", loc: "澀谷", desc: "可依喜好調整湯頭、辣度與麵條硬度的豚骨拉麵。", lat: 35.661076, lng: 139.700928 },
        { name: "AFURI 原宿", loc: "原宿", desc: "以柚子鹽拉麵聞名，位於原宿站附近。", lat: 35.672951, lng: 139.703796 },
        { name: "風雲児", loc: "新宿", desc: "位於代代木的魚介雞白湯沾麵店。", lat: 35.686668, lng: 139.696564, officialUrl: "https://www.fu-unji.com/" },
        { name: "真鯛らーめん 麺魚 錦糸町本店", loc: "錦糸町", desc: "以真鯛熬製湯頭的錦糸町拉麵店。", lat: 35.694263, lng: 139.81192, officialUrl: "https://www.mengyo.net/" },
        { name: "六厘舎 東京駅東京ラーメンストリート店", loc: "東京車站", desc: "位於東京站拉麵街的濃厚魚介沾麵店。", lat: 35.6812, lng: 139.7671 },
        { name: "銀座 篝 本店", loc: "銀座", desc: "銀座的雞白湯拉麵店。", lat: 35.670967, lng: 139.761063 },
        { name: "入鹿TOKYO 六本木", loc: "六本木", desc: "位於六本木的複合湯頭拉麵店。", lat: 35.664528, lng: 139.731506 },
        { name: "麺屋武蔵 新宿総本店", loc: "新宿", desc: "位於西新宿的拉麵與沾麵店。", lat: 35.695362, lng: 139.698593, officialUrl: "https://menya634.co.jp/" },
        { name: "らーめん 鴨to葱 御徒町本店", loc: "上野", desc: "以鴨、蔥與水熬製湯頭，位於御徒町。", lat: 35.708527, lng: 139.775162, officialUrl: "https://www.kamotonegi.com/shoprisuto/" },
        { name: "SOBA HOUSE 金色不如帰 新宿御苑本店", loc: "新宿", desc: "位於新宿御苑附近，以蛤蜊風味湯頭聞名。", lat: 35.688667, lng: 139.708267, officialUrl: "https://sobahousekonjikihototogisu.com/access/" },
    ],
    sushi: [
        { name: "寿司大", loc: "豐洲", desc: "位於豐洲市場內的江戶前壽司店；候位時間可能很長。", lat: 35.643154, lng: 139.780136 },
        { name: "梅丘寿司の美登利 渋谷店", loc: "澀谷", desc: "高 CP 值江戶前壽司；平日 15:00–17:00 暫停營業。", lat: 35.6583453, lng: 139.6967988, officialUrl: "https://www.sushinomidori.co.jp/shops/shibuya/" },
        { name: "回転寿司 根室花まる 銀座店", loc: "銀座", desc: "位於 Tokyu Plaza Ginza 10F 的北海道迴轉壽司。", lat: 35.672646, lng: 139.762756 },
        { name: "スシロー 浅草六区店", loc: "淺草", desc: "位於淺草 ROX・3G 3F 的迴轉壽司連鎖店。", lat: 35.713928, lng: 139.793396, officialUrl: "https://www.akindo-sushiro.co.jp/shop/detail.php?id=2413" },
        { name: "まんてん鮨 丸の内店", loc: "丸之內", desc: "位於丸之內 Brick Square B1 的套餐壽司店；建議預約。", lat: 35.678783, lng: 139.763062, officialUrl: "https://www.manten-sushi.com/" },
        { name: "銀座 久兵衛 銀座本店", loc: "銀座", desc: "銀座 8 丁目的江戶前壽司老店；建議預約。", lat: 35.668453, lng: 139.761292, officialUrl: "https://www.kyubey.jp/shoplist/ginza/" },
        { name: "沼津港 新宿本店", loc: "新宿", desc: "位於新宿的迴轉壽司店。", lat: 35.690369, lng: 139.703186 },
        { name: "くら寿司 グローバル旗艦店 押上（スカイツリー前）駅前2F", loc: "押上", desc: "押上站前 2F 的大型迴轉壽司店；11:00–23:00。", lat: 35.710796, lng: 139.814041, officialUrl: "https://shop.kurasushi.co.jp/detail/595" },
        { name: "すしざんまい 錦糸町店", loc: "錦糸町", desc: "現點現握壽司；11:00–翌日 05:00（L.O. 04:30），並非迴轉壽司。", lat: 35.6948712, lng: 139.8148557, officialUrl: "https://www.kiyomura.co.jp/store/detail/13" },
        { name: "うに虎本店", loc: "築地", desc: "築地場外市場的海膽與海鮮料理店。", lat: 35.665462, lng: 139.769989, officialUrl: "https://beyondtsukiji-hd.co.jp/shop/" },
    ],
    yakiniku: [
        { name: "游玄亭 新宿", loc: "新宿", desc: "敘敘苑旗下高級燒肉店，位於歌舞伎町。", lat: 35.695175, lng: 139.703186, officialUrl: "https://www.jojoen.co.jp/shop/yugentei/shinjuku/" },
        { name: "六歌仙 本店", loc: "新宿", desc: "西新宿的和牛燒肉與套餐餐廳；熱門時段建議預約。", lat: 35.689869, lng: 139.698532, officialUrl: "https://rokkasen.co.jp/jp/shop_honten/" },
        { name: "牛かつもと村 渋谷店", loc: "澀谷", desc: "炸牛排搭配石盤自行加熱至喜好熟度。", lat: 35.660675, lng: 139.698196, officialUrl: "https://www.gyukatsu-motomura.com/store/Shibuya" },
        { name: "焼肉の万世 秋葉原店", loc: "秋葉原", desc: "黑毛和牛燒肉；位於秋葉原トゥモロービル 6F。", lat: 35.6973025, lng: 139.7714744, officialUrl: "https://akiba.or.jp/store/s237" },
        { name: "焼肉ライク 錦糸町北口店", loc: "錦糸町", desc: "適合一人用餐的快速燒肉；10:00–23:00。", lat: 35.697952, lng: 139.814774, officialUrl: "https://yakiniku-like.com/access-kinshicho-kitaguchi.html" },
        { name: "USHIGORO S. GINZA", loc: "銀座", desc: "全包廂和牛燒肉套餐；位於銀座 7 丁目。", lat: 35.669228, lng: 139.762131, officialUrl: "https://sangue.co.jp/en/brand/ushigoro-s" },
        { name: "神戸鉄板焼 白秋", loc: "澀谷", desc: "位於櫻丘町的神戶牛鐵板燒店；建議預約。", lat: 35.656292, lng: 139.701096, officialUrl: "https://hakushu.foodre.jp/" },
        { name: "和牛焼肉 土古里 新宿NOWAビル店", loc: "新宿", desc: "新宿站旁的和牛燒肉店，提供多種部位與套餐。", lat: 35.690495, lng: 139.701477, officialUrl: "https://yakiniku-tokori-shinjuku-nowa.com/information/" },
        { name: "人形町今半 上野広小路店", loc: "上野", desc: "黑毛和牛壽喜燒百年老店；建議預約。", lat: 35.707469, lng: 139.772691, officialUrl: "https://restaurant.imahan.com/ueno/" },
    ],
    cafe: [
        { name: "HARBS ルミネエスト新宿店", loc: "新宿", desc: "位於 Lumine EST 新宿 B2，以水果千層蛋糕聞名。", lat: 35.691784, lng: 139.700775, officialUrl: "https://www.harbs.co.jp/shop_kanto/" },
        { name: "Blue Bottle Coffee 渋谷カフェ", loc: "澀谷", desc: "位於神南 Kitaya Park；08:00–20:00。", lat: 35.6641252, lng: 139.6994862, officialUrl: "https://store.bluebottlecoffee.jp/pages/shibuya" },
        { name: "スターバックス リザーブ® ロースタリー 東京", loc: "中目黑", desc: "位於目黑川旁的 Starbucks Reserve Roastery。", lat: 35.649384, lng: 139.692474, officialUrl: "https://www.starbucks.co.jp/reserve/roastery/" },
        { name: "淺草 梅園", loc: "淺草", desc: "安政元年創立，招牌粟善哉是傳統甜點代表。", lat: 35.7118, lng: 139.7960 },
        { name: "bills 銀座", loc: "銀座", desc: "位於 Okura House 12F，提供早午餐與鬆餅。", lat: 35.673229, lng: 139.766586 },
        { name: "キル フェ ボン グランメゾン銀座", loc: "銀座", desc: "銀座 2 丁目的季節水果塔專門店。", lat: 35.673958, lng: 139.767105, officialUrl: "https://www.quil-fait-bon.com/shop/?tsp=1" },
        { name: "祇園辻利 東京スカイツリータウン・ソラマチ店", loc: "押上", desc: "位於 Tokyo Solamachi 6F 的宇治茶與抹茶甜點店；導航請依館內樓層指標。", lat: 35.7100, lng: 139.8107, officialUrl: "https://www.giontsujiri.co.jp/store/skytree/" },
        { name: "銀座ウエスト 銀座本店", loc: "銀座", desc: "銀座 7 丁目的傳統喫茶與洋菓子店。", lat: 35.670364, lng: 139.760773 },
        { name: "カフェ・ド・ランブル", loc: "銀座", desc: "銀座 8 丁目的咖啡專門店。", lat: 35.667957, lng: 139.762299 },
        { name: "喫茶YOU", loc: "銀座", desc: "歌舞伎座附近的喫茶店，以蛋包飯聞名。", lat: 35.669518, lng: 139.768631, officialUrl: "https://kissa-you.com/about.htm" },
    ],
    local: [
        { name: "牛たん炭焼 利久 東京ソラマチ店", loc: "押上", desc: "位於東京 Solamachi 的仙台牛舌餐廳。", lat: 35.710083, lng: 139.808609, officialUrl: "https://www.rikyu-gyutan.co.jp/location.html" },
        { name: "上野 大統領", loc: "上野", desc: "最道地的立飲居酒屋，內臟煮與串燒名店。", lat: 35.7108, lng: 139.7742 },
        { name: "大黒家天麩羅 本店", loc: "淺草", desc: "淺草天婦羅老店，以深色醬汁天丼聞名。", lat: 35.712776, lng: 139.795532, officialUrl: "https://www.tempura.co.jp/" },
        { name: "伊豆榮 本店", loc: "上野", desc: "上野的不忍池附近鰻魚料理老店。", lat: 35.709732, lng: 139.772751, officialUrl: "https://izuei.co.jp/" },
        { name: "鳥貴族 錦糸町駅前店", loc: "錦糸町", desc: "燒鳥連鎖店；平日 17:00–翌日 04:00、週末 15:00–翌日 04:00。", lat: 35.696186, lng: 139.813171, officialUrl: "https://map.torikizoku.co.jp/detail/494/" },
        { name: "三定", loc: "淺草", desc: "雷門旁的天婦羅店；週四休，11:00–20:30（L.O. 20:00）。", lat: 35.710972, lng: 139.796707, officialUrl: "https://asakusa.gr.jp/jp/?p=413" },
        { name: "磯丸水産 渋谷宇田川町店", loc: "澀谷", desc: "可自行燒烤海鮮的 24 小時居酒屋。", lat: 35.660839, lng: 139.697845, officialUrl: "https://isomaru.jp/1393/" },
        { name: "鳥錦 錦糸町総本店", loc: "錦糸町", desc: "飯店周邊的燒鳥與雞料理店；16:00–23:30。", lat: 35.6988782, lng: 139.8134977, officialUrl: "https://torikin-kinshityo.owst.jp/" },
        { name: "銀座梅林", loc: "銀座", desc: "銀座炸豬排老店，也販售豬排三明治。", lat: 35.669609, lng: 139.762741 },
    ],
    global: [
        { name: "煉瓦亭", loc: "銀座", desc: "銀座的傳統洋食老店，提供炸豬排與蛋料理。", lat: 35.672733, lng: 139.76593 },
        { name: "Shake Shack 外苑いちょう並木店", loc: "表參道", desc: "外苑銀杏大道旁的漢堡店；11:00–20:30 L.O.。", lat: 35.673153, lng: 139.719757, officialUrl: "https://shakeshack.jp/locations/gaien/" },
        { name: "LUKE’S LOBSTER 表参道キャットストリート店", loc: "表參道", desc: "龍蝦三明治專門店；平日 11:00–20:00、週末 10:00–20:00。", lat: 35.665437, lng: 139.70449, officialUrl: "https://baycrews.jp/store/detail/1517" },
        { name: "THE APOLLO", loc: "銀座", desc: "位於 Tokyu Plaza Ginza 11F 的希臘料理餐廳。", lat: 35.672646, lng: 139.762756, officialUrl: "https://theapollo.jp/contact/" },
        { name: "T’sたんたん グランスタ東京店", loc: "東京車站", desc: "2026/8/1 起移至 B1 改札外、Gransta 地下北口右側；10:00–22:00。導航點為東京站中心，請依站內指標前往。", lat: 35.681252, lng: 139.767242, officialUrl: "https://www.jr-cross.co.jp/info/items/07538f5adfaa1defa1800963b679ccf86c140841.pdf" },
        { name: "神田たまごけん 秋葉原店", loc: "秋葉原", desc: "現做蛋包飯專門店，提供多種醬汁。", lat: 35.701206, lng: 139.770981, officialUrl: "https://tamagoken.com/shop/akihabara/" },
        { name: "MERCER BRUNCH GINZA TERRACE", loc: "銀座", desc: "位於 ONE GINZA 4F 的早午餐餐廳。", lat: 35.67437, lng: 139.768539, officialUrl: "https://www.mercer-brunch-ginza.com/" },
        { name: "Burger Mania 恵比寿店", loc: "惠比壽", desc: "惠比壽的手工漢堡店。", lat: 35.646034, lng: 139.713226 },
        { name: "日本料理 龍吟", loc: "日比谷", desc: "位於 Tokyo Midtown Hibiya 7F 的日本料理餐廳。", lat: 35.674088, lng: 139.759552, officialUrl: "https://www.hibiya.tokyo-midtown.com/jp/restaurants/70100/" },
        { name: "権八 西麻布", loc: "六本木", desc: "西麻布的和食居酒屋，設有蕎麥麵與爐端料理。", lat: 35.66045, lng: 139.723404, officialUrl: "https://gonpachi.jp/nishi-azabu/" },
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

/** 以 DOM API 建立標記 chip，避免 innerHTML 字串拼接 */
function createStyledMarkerChip(
    label: string,
    styles: {
        background: string;
        color?: string;
        border?: string;
        padding?: string;
        borderRadius?: string;
        fontSize?: string;
        fontWeight?: string;
    },
): HTMLDivElement {
    const wrapper = document.createElement("div");
    const chip = document.createElement("div");
    chip.textContent = label;
    chip.style.background = styles.background;
    chip.style.color = styles.color ?? "#111";
    chip.style.padding = styles.padding ?? "4px 8px";
    chip.style.borderRadius = styles.borderRadius ?? "10px";
    chip.style.fontSize = styles.fontSize ?? "12px";
    chip.style.fontWeight = styles.fontWeight ?? "700";
    chip.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
    chip.style.whiteSpace = "nowrap";
    chip.style.cursor = "pointer";
    if (styles.border) chip.style.border = styles.border;
    wrapper.appendChild(chip);
    return wrapper;
}

/** 以 DOM API 建立 InfoWindow 內容，文字一律 textContent */
function createInfoWindowNode(opts: {
    title: string;
    lines: string[];
    compact?: boolean;
}): HTMLDivElement {
    const root = document.createElement("div");
    root.style.padding = opts.compact ? "8px" : "10px";
    root.style.fontFamily = "sans-serif";
    if (!opts.compact) root.style.maxWidth = "260px";

    const h3 = document.createElement("h3");
    h3.style.margin = opts.compact ? "0 0 4px" : "0 0 6px";
    h3.style.fontSize = opts.compact ? "16px" : "15px";
    h3.textContent = opts.title;
    root.appendChild(h3);

    opts.lines.forEach((line, idx) => {
        const p = document.createElement("p");
        const isLast = idx === opts.lines.length - 1;
        p.style.margin = isLast ? "0" : "0 0 4px";
        p.style.fontSize = idx === 0 && !opts.compact ? "13px" : "12px";
        if (!(idx === 0 && !opts.compact)) {
            p.style.color = "#666";
        }
        if (isLast && !opts.compact && opts.lines.length > 1) {
            p.style.color = "#888";
            p.style.fontStyle = "italic";
        }
        p.textContent = line;
        root.appendChild(p);
    });

    return root;
}

export function Food() {
    const {
        isLoaded,
        customFoods,
        updateCustomFoods,
        itinerary = {},
        updateItinerary,
        foodStatuses = {},
        updateFoodStatuses,
    } = useTripState();
    const { confirm, alert: showAlert } = useDialog();
    const [initialFocus] = useState(() => {
        if (typeof window === "undefined") return null;
        try {
            const raw = sessionStorage.getItem("tokyo-trip-food-focus");
            return raw ? JSON.parse(raw) as { district?: string; q?: string } : null;
        } catch {
            return null;
        }
    });
    const [activeCat, setActiveCat] = useState("ramen");
    const [activeDistrict, setActiveDistrict] = useState(
        () => initialFocus?.district && initialFocus.district !== "all" ? initialFocus.district : "all",
    );
    // 行程帶入的 q 是來源活動名稱（僅供提示），不應當成餐廳搜尋字串，
    // 否則「晴空塔」等活動會把附近餐廳全部過濾掉。
    const [searchQuery, setSearchQuery] = useState("");
    const [focusHint, setFocusHint] = useState<string | null>(() => {
        if (initialFocus?.district && initialFocus.district !== "all") {
            return initialFocus.q
                ? `已篩選「${initialFocus.district}」· 對應行程：${initialFocus.q}`
                : `已篩選「${initialFocus.district}」附近`;
        }
        return initialFocus?.q ? `從行程「${initialFocus.q}」跳轉 · 可自行選區域` : null;
    });

    // 從行程「找附近美食」帶入的區域篩選
    useEffect(() => {
        if (initialFocus) {
            sessionStorage.removeItem("tokyo-trip-food-focus");
        }
    }, [initialFocus]);
    const [url, setUrl] = useState("");
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [formData, setFormData] = useState({
        emoji: "🍣", name: "", location: "", hours: "", desc: "", mapLink: "", image: "", lat: undefined as number | undefined, lng: undefined as number | undefined,
    });
    const [isCustomType, setIsCustomType] = useState(false);
    const [customEmoji, setCustomEmoji] = useState("🍔");
    const [customLabel, setCustomLabel] = useState("");
    const [editingId, setEditingId] = useState<number | null>(null);
    const [scheduleTarget, setScheduleTarget] = useState<{ item: FoodItem; statusKey: string; legacyStatusKey?: string } | null>(null);
    const [scheduleDay, setScheduleDay] = useState("day1");
    const [scheduleTime, setScheduleTime] = useState("12:00");
    const scheduleSelectRef = useRef<HTMLSelectElement>(null);
    const scheduleDialogRef = useRef<HTMLDivElement>(null);
    const scheduleTriggerRef = useRef<HTMLElement | null>(null);

    // ── 地圖相關狀態 ──
    const [showMap, setShowMap] = useState(false);
    const [mapStatus, setMapStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
    const [mapError, setMapError] = useState("Google Maps 暫時無法載入。");
    const [mapRetryKey, setMapRetryKey] = useState(0);
    const mapLoaded = mapStatus === "ready";
    const [selectedMarker, setSelectedMarker] = useState<FoodItem | null>(null);
    const mapRef = useRef<HTMLDivElement>(null);
    const googleMapRef = useRef<google.maps.Map | null>(null);
    const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
    const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

    const itinerarySource = useMemo(
        () => Object.keys(itinerary).length > 0 ? itinerary : DEFAULT_ITINERARY,
        [itinerary],
    );

    const getPlannedFoodDays = useCallback((item: FoodItem, statusKey: string) => (
        Object.entries(itinerarySource)
            .filter(([, day]) => day.activities.some(
                (activity) => isScheduledFoodActivity(activity, item, statusKey),
            ))
            .map(([dayKey]) => dayKey)
            .sort((left, right) => left.localeCompare(right, "en", { numeric: true }))
    ), [itinerarySource]);

    useEffect(() => {
        if (!scheduleTarget) return;
        const trigger = scheduleTriggerRef.current;
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        scheduleSelectRef.current?.focus();
        const handleDialogKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                setScheduleTarget(null);
                return;
            }
            if (event.key !== "Tab" || !scheduleDialogRef.current) return;
            const focusable = Array.from(scheduleDialogRef.current.querySelectorAll<HTMLElement>(
                'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
            )).filter((element) => !element.hasAttribute("hidden"));
            if (focusable.length === 0) {
                event.preventDefault();
                scheduleDialogRef.current.focus();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener("keydown", handleDialogKeyDown);
        return () => {
            document.body.style.overflow = originalOverflow;
            document.removeEventListener("keydown", handleDialogKeyDown);
            trigger?.focus();
            scheduleTriggerRef.current = null;
        };
    }, [scheduleTarget]);

    const setFoodStatus = (key: string, status: "wishlist" | "visited", legacyKey?: string) => {
        updateFoodStatuses?.((prev) => {
            const next = { ...prev };
            const current = next[key] ?? (legacyKey ? next[legacyKey] : undefined);
            if (current === status) delete next[key];
            else next[key] = status;
            if (legacyKey && legacyKey !== key) delete next[legacyKey];
            return next;
        });
    };

    const openScheduleDialog = (item: FoodItem, statusKey: string, trigger: HTMLElement, legacyStatusKey?: string) => {
        scheduleTriggerRef.current = trigger;
        const existingDay = getPlannedFoodDays(item, statusKey)[0];
        setScheduleDay(existingDay ?? "day1");
        setScheduleTime("12:00");
        setScheduleTarget({ item, statusKey, legacyStatusKey });
    };

    const addFoodToItinerary = () => {
        if (!scheduleTarget || !updateItinerary) return;
        const { item, statusKey, legacyStatusKey } = scheduleTarget;
        updateItinerary((prev) => {
            const source = Object.keys(prev).length > 0 ? prev : DEFAULT_ITINERARY;
            const sourceId = foodSourceId(statusKey);
            const withoutExisting = Object.fromEntries(
                Object.entries(source).map(([dayKey, day]) => [
                    dayKey,
                    {
                        ...day,
                        activities: day.activities.filter((activity) => !isScheduledFoodActivity(activity, item, statusKey)),
                    },
                ]),
            );
            const targetDay = withoutExisting[scheduleDay];
            if (!targetDay) return source;
            const activities = [
                ...targetDay.activities,
                {
                    time: scheduleTime,
                    name: `用餐：${item.name}`,
                    desc: `${item.loc} · ${item.desc}`,
                    tag: "美食",
                    sourceId,
                    syncId: activitySyncIdFromSource(sourceId),
                },
            ].sort((a, b) => a.time.localeCompare(b.time, "zh-TW", { numeric: true }));
            return {
                ...withoutExisting,
                [scheduleDay]: { ...targetDay, activities },
            };
        });
        updateFoodStatuses?.((prev) => {
            const current = prev[statusKey] ?? (legacyStatusKey ? prev[legacyStatusKey] : undefined);
            if (current !== "wishlist" && (!legacyStatusKey || !(legacyStatusKey in prev))) return prev;
            const next = { ...prev };
            if (current === "wishlist") delete next[statusKey];
            if (legacyStatusKey) delete next[legacyStatusKey];
            return next;
        });
        setScheduleTarget(null);
    };

    const removeFoodFromItinerary = () => {
        if (!scheduleTarget || !updateItinerary) return;
        const { item, statusKey } = scheduleTarget;
        updateItinerary((prev) => Object.fromEntries(
            Object.entries(prev).map(([dayKey, day]) => [
                dayKey,
                { ...day, activities: day.activities.filter((activity) => !isScheduledFoodActivity(activity, item, statusKey)) },
            ]),
        ));
        setScheduleTarget(null);
    };

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
        const filtered = allItems.filter((item) => (
            (activeDistrict === "all" || item.loc === activeDistrict)
            && matchesFoodSearch(item, searchQuery)
        ));

        filtered.forEach((item, index) => {
            const catInfo = FOOD_CATEGORIES.find(c => c.id === activeCat);
            const emoji = catInfo?.icon || "🍽️";

            const markerEl = createStyledMarkerChip(
                `${emoji} ${index + 1}`,
                {
                    background: "white",
                    color: "#111",
                    border: "2px solid #e74c3c",
                    padding: "4px 8px",
                    borderRadius: "10px",
                    fontSize: "12px",
                    fontWeight: "700",
                },
            );

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
                    infoWindowRef.current.setContent(
                        createInfoWindowNode({
                            title: `${emoji} ${item.name}`,
                            lines: [
                                `📍 ${item.loc} · 🚃 ${time} (${dist.toFixed(1)}km)`,
                                item.desc,
                            ],
                        }),
                    );
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
    }, [activeCat, activeDistrict, searchQuery]);

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
            content: createStyledMarkerChip("🏨 飯店", {
                background: "#e74c3c",
                color: "white",
                padding: "6px 10px",
                borderRadius: "12px",
                fontSize: "14px",
                fontWeight: "900",
            }),
        });
        hotelMarker.addListener("click", () => {
            infoWindow.setContent(
                createInfoWindowNode({
                    title: "🏨 東武黎凡特飯店",
                    lines: ["錦糸町 — 行程起點"],
                    compact: true,
                }),
            );
            infoWindow.open(map, hotelMarker);
        });

        google.maps.event.addListenerOnce(map, "idle", () => {
            updateMapMarkers(map);
        });
    }, [updateMapMarkers]);

    // ── 切換顯示地圖時載入 API ──
    useEffect(() => {
        if (!showMap) return;
        let cancelled = false;

        const unsubscribeAuthFailure = subscribeToGoogleMapsAuthFailure(() => {
            if (cancelled) return;
            setMapError("Google Maps 驗證失敗，請改用外部地圖查看餐廳。");
            setMapStatus("error");
        });

        void loadGoogleMaps(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)
            .then(() => {
                if (!cancelled) setMapStatus("ready");
            })
            .catch((error: unknown) => {
                if (cancelled) return;
                setMapError(
                    error instanceof GoogleMapsLoadError
                        ? error.message
                        : "Google Maps 暫時無法載入，請重試或改用外部地圖。",
                );
                setMapStatus("error");
            });

        return () => {
            cancelled = true;
            unsubscribeAuthFailure();
        };
    }, [showMap, mapRetryKey]);

    // ── API 載入後初始化地圖 ──
    useEffect(() => {
        if (showMap && mapLoaded && mapRef.current) {
            let cancelled = false;
            queueMicrotask(() => {
                if (cancelled || !mapRef.current) return;
                try {
                    if (!googleMapRef.current) {
                        initMap();
                    } else {
                        updateMapMarkers();
                    }
                } catch (error) {
                    console.error("Failed to initialize food map", error);
                    googleMapRef.current = null;
                    markersRef.current = [];
                    setMapError("Google Maps 初始化失敗，請重試或改用外部地圖。");
                    setMapStatus("error");
                }
            });
            return () => {
                cancelled = true;
            };
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

    const analyzeSeqRef = useRef(0);

    const analyzeUrl = async (inputUrl: string) => {
        const trimmed = inputUrl.trim();
        if (!looksLikeGoogleMapsUrl(trimmed)) return;

        const seq = ++analyzeSeqRef.current;
        setIsAnalyzing(true);
        try {
            const res = await fetch(`/api/map-info?url=${encodeURIComponent(trimmed)}`);
            // 若使用者在等待期間又貼了新網址，忽略這次過期回應
            if (seq !== analyzeSeqRef.current) return;

            const data = await res.json().catch(() => null) as {
                name?: string;
                emoji?: string;
                category?: string;
                location?: string;
                hours?: string;
                finalUrl?: string;
                lat?: number;
                lng?: number;
                error?: string;
            } | null;

            if (!res.ok) {
                if (res.status === 422) {
                    // 有座標/位置但沒店名：仍填入 mapLink，讓使用者只補店名
                    setFormData((prev) => ({
                        ...prev,
                        mapLink: trimmed,
                        location: data?.location || prev.location,
                        lat: data?.lat ?? prev.lat,
                        lng: data?.lng ?? prev.lng,
                    }));
                    throw new Error("無法從這個網址辨識店名，已保留地圖連結，請手動填寫店名。");
                }
                if (res.status === 429) {
                    throw new Error("解析太頻繁，請稍候再試。");
                }
                throw new Error(data?.error || `地圖資訊服務回應錯誤 (${res.status})`);
            }
            if (!data?.name) {
                throw new Error("無法從這個網址辨識店名");
            }

            const restaurantName = data.name;
            const isStandard = FOOD_CATEGORIES.some((cat) => cat.icon === data.emoji);
            if (data.emoji && !isStandard) {
                setIsCustomType(true);
                setCustomEmoji(data.emoji);
                setCustomLabel(data.category || "");
            } else {
                setIsCustomType(false);
            }
            setFormData((prev) => ({
                ...prev,
                name: restaurantName,
                mapLink: data.finalUrl || trimmed,
                emoji: data.emoji || prev.emoji,
                location: data.location || prev.location,
                hours: data.hours || prev.hours,
                desc: data.category ? `分類：${data.category}` : prev.desc,
                lat: data.lat ?? prev.lat,
                lng: data.lng ?? prev.lng,
            }));
        } catch (e) {
            if (seq !== analyzeSeqRef.current) return;
            console.error("Failed to analyze URL", e);
            const message =
                e instanceof Error && e.message
                    ? e.message
                    : "無法自動解析這個網址，請改為手動填寫名稱與其他欄位。";
            void showAlert({
                title: "分析失敗",
                message:
                    message.includes("手動") || message.includes("頻繁") || message.includes("錯誤")
                        ? message
                        : "無法自動解析這個網址，請改為手動填寫名稱與其他欄位。",
                accent: "danger",
                closeText: "知道了",
            });
        } finally {
            if (seq === analyzeSeqRef.current) setIsAnalyzing(false);
        }
    };

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        analyzeSeqRef.current += 1;
    }, []);

    const scheduleAnalyze = (val: string) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const trimmed = val.trim();
        if (!trimmed) return;
        // 支援 http(s) 與使用者常直接貼 maps.app.goo.gl/... 的情況
        if (trimmed.startsWith("http") || looksLikeGoogleMapsUrl(trimmed)) {
            debounceRef.current = setTimeout(() => {
                const normalized =
                    trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
                analyzeUrl(normalized);
            }, 600);
        }
    };

    const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setUrl(val);
        scheduleAnalyze(val);
    };

    const handleUrlPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        const pasted = e.clipboardData.getData("text");
        if (!pasted) return;
        // 讓 input 先吃到 paste 值後再觸發；此處用 next tick 讀取最新 value
        window.setTimeout(() => {
            const next = (e.target as HTMLInputElement).value || pasted;
            setUrl(next);
            scheduleAnalyze(next);
        }, 0);
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
        // 同步尚未完成前禁止寫入，避免本機空陣列 + 新項目在 LWW 下覆蓋雲端完整名單
        if (!isLoaded || !formData.name) return;
        if (editingId) {
            // 編輯模式：用 functional update 避免與 realtime 同步的 stale closure 互相覆蓋
            updateCustomFoods((prev) =>
                prev.map((f) => (f.id === editingId ? { ...f, ...formData, id: editingId, syncId: f.syncId } : f)),
            );
        } else {
            // 新增模式：offset 避免同毫秒連點造成 id 碰撞（與 BudgetTracker.tsx 做法一致）
            updateCustomFoods((prev) => [{ ...formData, id: Date.now() + prev.length }, ...prev]);
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

    const handleDelete = async (food: CustomFood) => {
        const id = food.id;
        const ok = await confirm({
            title: "刪除美食紀錄",
            message: "確定要刪除這筆美食嗎？",
            accent: "danger",
            confirmText: "刪除",
        });
        if (!ok) return;
        updateCustomFoods((prev) => prev.filter((f) => f.id !== id));
        updateFoodStatuses?.((prev) => {
            const key = customFoodStatusKey(food);
            const legacyKey = legacyCustomFoodStatusKey(id);
            if (!(key in prev) && !(legacyKey in prev)) return prev;
            const next = { ...prev };
            delete next[key];
            delete next[legacyKey];
            return next;
        });
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
    const filteredFoods = currentFoods.filter((item) => (
        (activeDistrict === "all" || item.loc === activeDistrict)
        && matchesFoodSearch(item, searchQuery)
    ));

    // ── 當前分類可用的區域 ──
    const availableDistricts = DISTRICT_FILTERS.filter(d => d.id === "all" || currentFoods.some(item => item.loc === d.id));
    const scheduledTargetDays = scheduleTarget
        ? getPlannedFoodDays(scheduleTarget.item, scheduleTarget.statusKey)
        : [];

    return (
        <section id="food" className="py-4 px-4 md:px-12 max-w-7xl mx-auto">
            <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-5 md:p-8 shadow-2xl border border-gray-100 dark:border-slate-700">

                {/* ── 標題與地圖切換 ── */}
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl md:text-3xl font-black flex items-center gap-2">
                        🍽️ 東京美食地圖
                    </h2>
                    <button
                        onClick={() => {
                            const nextShowMap = !showMap;
                            setShowMap(nextShowMap);
                            if (nextShowMap) setMapStatus("loading");
                        }}
                        className={`flex min-h-11 items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-sm transition-all active:scale-95 ${showMap
                            ? "bg-primary text-white shadow-lg shadow-primary/30"
                            : "bg-gray-50 dark:bg-slate-900 text-gray-500 border border-gray-100 dark:border-slate-700 hover:border-primary/30"
                            }`}
                    >
                        {showMap ? <List className="w-4 h-4" /> : <Map className="w-4 h-4" />}
                        {showMap ? "顯示列表" : "顯示地圖"}
                    </button>
                </div>

                {focusHint && (
                    <div className="mb-4 flex items-start gap-3 rounded-2xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 px-4 py-3">
                        <span className="text-lg shrink-0">🍜</span>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-orange-800 dark:text-orange-200">{focusHint}</p>
                            <p className="text-xs text-orange-800 dark:text-orange-200 mt-0.5">可改分類或區域繼續瀏覽</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setFocusHint(null)}
                            className="min-h-11 shrink-0 text-xs font-black text-orange-800 dark:text-orange-200 px-3 py-1 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/40"
                            aria-label="關閉提示"
                        >
                            關閉
                        </button>
                    </div>
                )}

                <div className="relative mb-4">
                    <label htmlFor="food-search" className="sr-only">搜尋目前分類的餐廳</label>
                    <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" aria-hidden="true" />
                    <input
                        id="food-search"
                        type="search"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder={`搜尋${FOOD_CATEGORIES.find((category) => category.id === activeCat)?.label ?? "餐廳"}、區域或特色`}
                        className="min-h-12 w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-12 pr-12 text-base font-bold text-gray-900 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    {searchQuery && (
                        <button type="button" onClick={() => setSearchQuery("")} aria-label="清除美食搜尋" className="absolute right-2 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* ── 餐廳分類 Tab ── */}
                <div className="relative mb-4">
                    <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-3 pr-10 scrollbar-hide">
                        {FOOD_CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => { setActiveCat(cat.id); setActiveDistrict("all"); }}
                                aria-label={cat.label}
                                aria-pressed={activeCat === cat.id}
                                className={`flex snap-start items-center gap-2 px-6 py-3 rounded-2xl font-black text-base transition-all shrink-0 ${activeCat === cat.id
                                    ? "bg-primary text-white shadow-lg shadow-primary/30 scale-105"
                                    : "bg-gray-50 dark:bg-slate-900 text-gray-700 dark:text-gray-200 border border-transparent hover:border-gray-200 dark:hover:border-slate-600"
                                    }`}
                            >
                                <span className="text-2xl">{cat.icon}</span> {cat.label}
                            </button>
                        ))}
                    </div>
                    <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white via-white/90 to-transparent dark:from-slate-800 dark:via-slate-800/90 md:hidden" />
                </div>

                {/* ── 區域篩選 ── */}
                <p className="mb-1 text-[11px] font-bold text-gray-600 dark:text-gray-300 md:hidden">左右滑動查看更多篩選</p>
                <div className="relative mb-6">
                    <div className="flex snap-x snap-mandatory gap-1.5 overflow-x-auto pb-2 pr-10 scrollbar-hide">
                    <div className="flex items-center gap-1 text-xs font-bold text-gray-600 dark:text-gray-300 shrink-0 px-2">
                        <Filter className="w-3.5 h-3.5" /> 篩選
                    </div>
                    {availableDistricts.map(d => (
                        <button
                            key={d.id}
                            onClick={() => setActiveDistrict(d.id)}
                            aria-label={d.label}
                            aria-pressed={activeDistrict === d.id}
                            className={`flex min-h-11 snap-start items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 ${activeDistrict === d.id
                                ? "bg-orange-700 text-white shadow-md shadow-orange-700/20"
                                : "bg-gray-50 dark:bg-slate-900 text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white border border-transparent hover:border-gray-200 dark:hover:border-slate-600"
                                }`}
                        >
                            <span>{d.icon}</span> {d.label}
                        </button>
                    ))}
                    </div>
                    <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white via-white/90 to-transparent dark:from-slate-800 dark:via-slate-800/90 md:hidden" />
                </div>

                {/* ── 互動地圖 ── */}
                {showMap && (
                    <div className="relative mb-8 rounded-3xl overflow-hidden border border-gray-100 dark:border-slate-700 shadow-lg animate-in fade-in slide-in-from-top-4 duration-500">
                        <div
                            ref={mapRef}
                            className="w-full h-[400px] md:h-[500px]"
                            style={{ background: "#e5e7eb" }}
                        />
                        {mapStatus === "loading" && (
                            <div className="absolute inset-0 flex items-center justify-center bg-gray-100/80 dark:bg-slate-900/80">
                                <div className="flex items-center gap-3 text-gray-500">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    <span className="font-bold">載入 Google Maps 中...</span>
                                </div>
                            </div>
                        )}
                        {mapStatus === "error" && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100/95 dark:bg-slate-900/95 px-6 text-center">
                                <p className="font-black text-gray-700 dark:text-gray-200 mb-2" role="alert">Google Maps 無法載入</p>
                                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 max-w-md">{mapError}</p>
                                <div className="flex flex-wrap items-center justify-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setMapStatus("loading");
                                            setMapRetryKey((value) => value + 1);
                                        }}
                                        className="min-h-11 px-4 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-sm font-black"
                                    >
                                        重新載入
                                    </button>
                                    <a
                                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("錦糸町 美食")}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="min-h-11 px-4 rounded-xl bg-primary text-white text-sm font-black inline-flex items-center"
                                    >
                                        開啟 Google Maps
                                    </a>
                                </div>
                            </div>
                        )}
                        {mapLoaded && (
                            <div className="bg-gray-50 dark:bg-slate-900 px-5 py-3 flex items-center justify-between text-xs font-bold text-gray-600 dark:text-gray-300">
                                <span>🏨 紅色標記 = 飯店（起點）· 數字標記 = 餐廳</span>
                                <span>📍 共 {filteredFoods.length} 家餐廳</span>
                            </div>
                        )}
                    </div>
                )}

                {/* ── 餐廳卡片網格 ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
                    {filteredFoods.map((item) => {
                        const dist = haversineDistance(HOTEL_COORDS.lat, HOTEL_COORDS.lng, item.lat, item.lng);
                        const time = estimateTransitTime(dist);
                        const statusKey = foodStatusKey(item);
                        const status = foodStatuses[statusKey];
                        const plannedDays = getPlannedFoodDays(item, statusKey);
                        const plannedDay = plannedDays[0];
                        const plannedDayLabels = plannedDays.map(scheduleDayLabel).join("、");
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
                                        <h3 title={item.name} className="font-black text-base text-gray-900 dark:text-white line-clamp-2 min-h-12 flex-1 pr-2">{item.name}</h3>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                        {status === "wishlist" && <span className="rounded-full bg-pink-100 dark:bg-pink-900/30 px-2 py-0.5 text-[11px] font-black text-pink-800 dark:text-pink-200">想吃</span>}
                                        {plannedDays.length === 1 && <span className="rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-[11px] font-black text-blue-800 dark:text-blue-200">已排 {plannedDayLabels}</span>}
                                        {plannedDays.length > 1 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">重複安排 {plannedDayLabels}</span>}
                                        {status === "visited" && <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-[11px] font-black text-emerald-800 dark:text-emerald-200">去過</span>}
                                    </div>
                                    <div className="text-sm font-bold text-primary flex items-center gap-1 mb-1">
                                        <MapPin className="w-2.5 h-2.5" /> {item.loc}
                                    </div>
                                    {/* ── 距離與時間 ── */}
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-600 dark:text-gray-300">
                                            <Footprints className="w-3 h-3" /> {dist.toFixed(1)}km
                                        </span>
                                        <span className="inline-flex items-center gap-1 text-xs font-bold text-orange-700 dark:text-orange-300">
                                            <Clock className="w-3 h-3" /> {time}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-tight line-clamp-2 italic mb-3">&ldquo;{item.desc}&rdquo;</p>

                                    {/* Hours are not fetched in real time; keep the state neutral. */}
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-xs font-bold px-2 py-1 bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-300 rounded-full">
                                            營業時間請以店家公告為準
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1.5 mb-3">
                                        <button
                                            type="button"
                                            aria-pressed={status === "wishlist"}
                                            aria-label={`將「${item.name}」標記為想吃`}
                                            onClick={() => setFoodStatus(statusKey, "wishlist")}
                                            className={`inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border px-2 text-xs font-black ${status === "wishlist" ? "border-pink-600 bg-pink-600 text-white" : "border-gray-200 bg-white text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200"}`}
                                        >
                                            <Heart className={`w-4 h-4 ${status === "wishlist" ? "fill-current" : ""}`} /> 想吃
                                        </button>
                                        <button
                                            type="button"
                                            aria-pressed={plannedDays.length > 0}
                                            aria-label={plannedDays.length > 1 ? `「${item.name}」目前重複排在 ${plannedDayLabels}；調整行程` : `將「${item.name}」排入行程`}
                                            onClick={(event) => openScheduleDialog(item, statusKey, event.currentTarget)}
                                            className={`inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border px-2 text-xs font-black ${plannedDay ? "border-blue-700 bg-blue-700 text-white" : "border-gray-200 bg-white text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200"}`}
                                        >
                                            <CalendarPlus className="w-4 h-4" /> {plannedDays.length > 1 ? `${plannedDays.length} 日重複` : plannedDay ? scheduleDayLabel(plannedDay) : "排入"}
                                        </button>
                                        <button
                                            type="button"
                                            aria-pressed={status === "visited"}
                                            aria-label={`將「${item.name}」標記為去過`}
                                            onClick={() => setFoodStatus(statusKey, "visited")}
                                            className={`inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border px-2 text-xs font-black ${status === "visited" ? "border-emerald-700 bg-emerald-700 text-white" : "border-gray-200 bg-white text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200"}`}
                                        >
                                            <CheckCircle2 className="w-4 h-4" /> 去過
                                        </button>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleNavigate(item.name, item.lat, item.lng)}
                                            className="flex-1 min-h-11 py-2 bg-white dark:bg-slate-800 text-primary border border-primary/10 rounded-xl text-sm font-black flex items-center justify-center gap-2 hover:bg-primary hover:text-white transition-all active:scale-95"
                                        >
                                            <Navigation className="w-3 h-3" /> 導航
                                        </button>
                                        <a
                                            href={item.officialUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.name} 東京`)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            aria-label={`${item.name}${item.officialUrl ? "官方資訊" : "店家資訊"}（另開新視窗）`}
                                            className="flex-1 min-h-11 py-2 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 hover:border-primary/40 hover:text-primary transition-colors"
                                        >
                                            <Map className="w-3 h-3" /> {item.officialUrl ? "官方資訊" : "店家資訊"}
                                        </a>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {filteredFoods.length === 0 && (
                        <div className="sm:col-span-2 lg:col-span-4 rounded-3xl border-2 border-dashed border-gray-200 dark:border-slate-700 px-6 py-12 text-center">
                            <p className="font-black text-gray-700 dark:text-gray-200">找不到符合條件的餐廳</p>
                            <button type="button" onClick={() => { setSearchQuery(""); setActiveDistrict("all"); }} className="mt-3 inline-flex min-h-11 items-center rounded-xl px-4 font-black text-primary underline underline-offset-4">清除搜尋與區域篩選</button>
                        </div>
                    )}
                </div>

                {/* ── 搜尋結果計數 ── */}
                {(activeDistrict !== "all" || searchQuery.trim()) && (
                    <div className="text-center mb-6">
                        <span className="text-sm font-bold text-gray-600 dark:text-gray-300">
                            顯示 <span className="text-primary">{filteredFoods.length}</span> / {currentFoods.length} 家餐廳
                            {filteredFoods.length === 0 && (
                                <button
                                    onClick={() => setActiveDistrict("all")}
                                    className="ml-3 inline-flex min-h-11 items-center px-2 text-primary underline underline-offset-2 hover:no-underline"
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
                    {!isLoaded && (
                        <div className="mb-6 flex items-center gap-2 text-sm font-bold text-gray-600 dark:text-slate-300 px-1">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            同步私藏名單中…
                        </div>
                    )}
                    <form id="custom-food-form" onSubmit={handleAdd} className={`bg-gray-50 dark:bg-slate-900 p-6 rounded-[2rem] space-y-6 mb-10 border transition-all ${editingId ? "border-primary/40 ring-2 ring-primary/10 shadow-lg shadow-primary/5" : "border-gray-100 dark:border-slate-800"}`}>
                        {editingId && (
                            <div className="flex items-center justify-between bg-primary/5 rounded-xl px-4 py-2.5">
                                <span className="text-sm font-black text-primary flex items-center gap-2">
                                    ✏️ 編輯模式 — 正在修改「{formData.name}」
                                </span>
                                <button type="button" onClick={resetForm} className="min-h-11 shrink-0 text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-red-700 transition-colors px-3 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10">
                                    取消編輯
                                </button>
                            </div>
                        )}
                        <div className="space-y-2">
                            <label htmlFor="food-map-url" className="text-xs font-black text-gray-600 dark:text-gray-300 uppercase tracking-widest block ml-1">自動解析（選擇性）</label>
                            <div className="relative group">
                                <input
                                    id="food-map-url"
                                    type="text"
                                    inputMode="url"
                                    autoComplete="off"
                                    spellCheck={false}
                                    placeholder="貼上 Google Map 分享網址自動解析店名與位置..."
                                    value={url}
                                    onChange={handleUrlChange}
                                    onPaste={handleUrlPaste}
                                    className="w-full p-4 pl-12 pr-12 rounded-2xl border-2 border-transparent bg-white dark:bg-slate-800 focus:border-primary outline-none transition-all text-sm font-bold"
                                />
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 dark:text-gray-300" />
                                {isAnalyzing && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs sm:text-sm font-black text-gray-600 dark:text-gray-300 uppercase tracking-widest block ml-1">餐廳類型 (選填/預設 🍣)</label>
                            <div className="flex flex-wrap gap-2">
                                {FOOD_CATEGORIES.map(cat => (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => {
                                            setIsCustomType(false);
                                            setFormData(prev => ({ ...prev, emoji: cat.icon, desc: `分類：${cat.label}` }));
                                        }}
                                        className={`flex min-h-11 items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-all ${!isCustomType && formData.emoji === cat.icon
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
                                    className={`flex min-h-11 items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-all ${isCustomType
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
                                    <label htmlFor="food-custom-emoji" className="text-xs font-black text-gray-600 dark:text-gray-300 block ml-1">圖示 Emoji</label>
                                    <input
                                        id="food-custom-emoji"
                                        type="text"
                                        placeholder="🍕"
                                        value={customEmoji}
                                        onChange={e => {
                                            setCustomEmoji(e.target.value);
                                            setFormData(prev => ({ ...prev, emoji: e.target.value }));
                                        }}
                                        className="w-full min-h-11 p-2.5 rounded-xl bg-gray-50 dark:bg-slate-900 text-sm font-black text-center outline-none border border-transparent focus:border-primary/30"
                                        maxLength={4}
                                    />
                                </div>
                                <div className="space-y-1 col-span-2">
                                    <label htmlFor="food-custom-label" className="text-xs font-black text-gray-600 dark:text-gray-300 block ml-1">類型名稱</label>
                                    <input
                                        id="food-custom-label"
                                        type="text"
                                        placeholder="例如：比薩"
                                        value={customLabel}
                                        onChange={e => {
                                            setCustomLabel(e.target.value);
                                            setFormData(prev => ({ ...prev, desc: `分類：${e.target.value}` }));
                                        }}
                                        className="w-full min-h-11 p-2.5 rounded-xl bg-gray-50 dark:bg-slate-900 text-sm font-black outline-none border border-transparent focus:border-primary/30"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <label htmlFor="food-name" className="text-xs font-black text-gray-600 dark:text-gray-300 uppercase tracking-widest block ml-1">店名</label>
                                <input
                                    id="food-name"
                                    type="text"
                                    placeholder="請輸入店名"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full p-3.5 rounded-xl bg-white dark:bg-slate-800 text-sm font-black outline-none border border-gray-100 dark:border-slate-700 focus:border-primary"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="food-location" className="text-xs font-black text-gray-600 dark:text-gray-300 uppercase tracking-widest block ml-1">區域/位置 (選填)</label>
                                <input
                                    id="food-location"
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
                            className={`w-full py-4 rounded-xl font-black text-base active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:pointer-events-none ${editingId
                                ? "bg-orange-500 text-white shadow-orange-500/20 hover:bg-orange-600"
                                : "bg-primary text-white shadow-primary/20"
                                }`}
                            disabled={isAnalyzing || !isLoaded}
                        >
                            {!isLoaded
                                ? <><Loader2 className="w-5 h-5 animate-spin" /> 同步中…</>
                                : editingId
                                    ? <><Search className="w-5 h-5" /> 更新美食資訊</>
                                    : <><Plus className="w-5 h-5" /> 加入我的私藏清單</>}
                        </button>
                    </form>

                    {isLoaded && customFoods.length === 0 && (
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
                            const statusKey = customFoodStatusKey(food);
                            const legacyStatusKey = legacyCustomFoodStatusKey(food.id);
                            const status = foodStatuses[statusKey] ?? foodStatuses[legacyStatusKey];
                            const scheduleItem: FoodItem = {
                                name: food.name,
                                loc: food.location || "東京",
                                desc: food.desc || "私藏美食",
                                lat: food.lat ?? HOTEL_COORDS.lat,
                                lng: food.lng ?? HOTEL_COORDS.lng,
                            };
                            const plannedDays = getPlannedFoodDays(scheduleItem, statusKey);
                            const plannedDay = plannedDays[0];
                            const plannedDayLabels = plannedDays.map(scheduleDayLabel).join("、");
                            return (
                                <div key={food.id} className={`bg-white dark:bg-slate-800 p-4 rounded-3xl shadow-sm border transition-all relative group animate-in fade-in zoom-in duration-300 flex flex-col justify-between ${isEditing
                                    ? "border-primary ring-2 ring-primary/20 shadow-lg shadow-primary/5"
                                    : "border-gray-100 dark:border-slate-700"
                                    }`}>
                                    <div>
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="text-3xl bg-gray-50 dark:bg-slate-900 w-12 h-12 flex items-center justify-center rounded-2xl">{food.emoji}</div>
                                            <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleEdit(food)}
                                                    className="w-11 h-11 inline-flex items-center justify-center rounded-xl text-gray-600 dark:text-gray-300 hover:text-primary hover:bg-primary/10 transition-colors"
                                                    aria-label={`編輯「${food.name}」`}
                                                    title="編輯"
                                                >
                                                    <Edit3 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-base font-black mb-1 line-clamp-2 min-h-12">{food.name}</p>
                                        <div className="flex flex-wrap gap-1.5 mb-2">
                                            {status === "wishlist" && <span className="rounded-full bg-pink-100 dark:bg-pink-900/30 px-2 py-0.5 text-[11px] font-black text-pink-800 dark:text-pink-200">想吃</span>}
                                            {plannedDays.length === 1 && <span className="rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-[11px] font-black text-blue-800 dark:text-blue-200">已排 {plannedDayLabels}</span>}
                                            {plannedDays.length > 1 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">重複安排 {plannedDayLabels}</span>}
                                            {status === "visited" && <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-[11px] font-black text-emerald-800 dark:text-emerald-200">去過</span>}
                                        </div>
                                        <div className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-1 mb-1">
                                            <MapPin className="w-3 h-3" /> {food.location || "未設定"}
                                        </div>
                                        {/* ── 距離與時間（有座標才顯示）── */}
                                        {hasCoords && dist != null && (
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-600 dark:text-gray-300">
                                                    <Footprints className="w-3 h-3" /> {dist.toFixed(1)}km
                                                </span>
                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-orange-700 dark:text-orange-300">
                                                    <Clock className="w-3 h-3" /> {time}
                                                </span>
                                            </div>
                                        )}
                                        {food.desc && (
                                            <p className="text-xs text-gray-600 dark:text-gray-300 leading-tight line-clamp-2 italic mb-3">{food.desc}</p>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-3 gap-1.5 mb-2">
                                        <button type="button" aria-pressed={status === "wishlist"} onClick={() => setFoodStatus(statusKey, "wishlist", legacyStatusKey)} className={`inline-flex min-h-11 items-center justify-center rounded-xl border text-xs font-black ${status === "wishlist" ? "border-pink-600 bg-pink-600 text-white" : "border-gray-200 bg-gray-50 text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-200"}`} aria-label={`標記「${food.name}」為想吃`}>
                                            <Heart className={`w-4 h-4 ${status === "wishlist" ? "fill-current" : ""}`} />
                                        </button>
                                        <button type="button" aria-pressed={plannedDays.length > 0} onClick={(event) => openScheduleDialog(scheduleItem, statusKey, event.currentTarget, legacyStatusKey)} className={`inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border text-xs font-black ${plannedDay ? "border-blue-700 bg-blue-700 text-white" : "border-gray-200 bg-gray-50 text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-200"}`} aria-label={plannedDays.length > 1 ? `「${food.name}」目前重複排在 ${plannedDayLabels}；調整行程` : `將「${food.name}」排入行程`}>
                                            <CalendarPlus className="w-4 h-4" /> {plannedDays.length > 1 ? `${plannedDays.length} 日重複` : plannedDay ? scheduleDayLabel(plannedDay) : "排入"}
                                        </button>
                                        <button type="button" aria-pressed={status === "visited"} onClick={() => setFoodStatus(statusKey, "visited", legacyStatusKey)} className={`inline-flex min-h-11 items-center justify-center rounded-xl border text-xs font-black ${status === "visited" ? "border-emerald-700 bg-emerald-700 text-white" : "border-gray-200 bg-gray-50 text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-200"}`} aria-label={`標記「${food.name}」為去過`}>
                                            <CheckCircle2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleNavigate(food.name, food.lat, food.lng)}
                                            className="flex-1 min-h-11 bg-gray-50 dark:bg-slate-900 p-2 rounded-xl text-sm font-black text-center text-gray-500 hover:text-primary transition-colors border border-gray-100 dark:border-slate-700 flex items-center justify-center gap-1 hover:bg-primary/5 hover:border-primary/20"
                                        >
                                            <Navigation className="w-3 h-3" /> {hasCoords ? "導航" : "GO"}
                                        </button>
                                        <button onClick={() => handleDelete(food)} aria-label={`刪除「${food.name}」`} className="w-11 h-11 shrink-0 bg-red-50 dark:bg-red-900/10 rounded-xl text-red-400 hover:text-red-500 flex items-center justify-center transition-colors"><Trash2 className="w-3 h-3" /></button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {scheduleTarget && (
                <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setScheduleTarget(null); }}>
                    <div
                        ref={scheduleDialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="food-schedule-title"
                        aria-describedby="food-schedule-description"
                        tabIndex={-1}
                        className="w-full max-w-lg rounded-t-[2rem] bg-white p-6 shadow-2xl outline-none dark:bg-slate-800 sm:rounded-[2rem]"
                    >
                        <div className="flex items-start justify-between gap-3 mb-5">
                            <div>
                                <p className="text-xs font-black uppercase tracking-widest text-primary">加入既有行程</p>
                                <h3 id="food-schedule-title" className="mt-1 text-xl font-black text-gray-900 dark:text-white">{scheduleTarget.item.name}</h3>
                                <p className="mt-1 text-sm font-bold text-gray-600 dark:text-gray-300">{scheduleTarget.item.loc}</p>
                            </div>
                            <button type="button" onClick={() => setScheduleTarget(null)} aria-label="關閉排入行程視窗" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-200">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="food-schedule-day" className="mb-1.5 block text-sm font-black text-gray-700 dark:text-gray-200">安排日期</label>
                                <select ref={scheduleSelectRef} id="food-schedule-day" value={scheduleDay} onChange={(event) => setScheduleDay(event.target.value)} className="min-h-12 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 font-bold dark:border-slate-700 dark:bg-slate-900">
                                    {Object.entries(itinerarySource).map(([dayKey, day], index) => (
                                        <option key={dayKey} value={dayKey}>Day {index + 1} · {day.date}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="food-schedule-time" className="mb-1.5 block text-sm font-black text-gray-700 dark:text-gray-200">用餐時間</label>
                                <input id="food-schedule-time" type="time" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} className="min-h-12 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 font-bold dark:border-slate-700 dark:bg-slate-900" required />
                            </div>
                        </div>
                        <p id="food-schedule-description" className="mt-4 text-xs font-bold leading-relaxed text-gray-600 dark:text-gray-300">儲存後會直接出現在行程頁，並同步到其他已連結裝置。</p>
                        {scheduledTargetDays.length > 1 && (
                            <p role="alert" className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold leading-relaxed text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
                                目前重複排在 {scheduledTargetDays.map(scheduleDayLabel).join("、")}；儲存會合併為單一安排。
                            </p>
                        )}
                        <div className="mt-5 grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => setScheduleTarget(null)} className="min-h-12 rounded-2xl border border-gray-200 font-black text-gray-700 dark:border-slate-700 dark:text-gray-200">取消</button>
                            <button type="button" onClick={addFoodToItinerary} className="min-h-12 rounded-2xl bg-primary font-black text-white shadow-lg shadow-primary/20">{scheduledTargetDays.length > 1 ? "合併為單一安排" : scheduledTargetDays.length === 1 ? "更新安排" : "排入行程"}</button>
                        </div>
                        {scheduledTargetDays.length > 0 && (
                            <button type="button" onClick={removeFoodFromItinerary} className="mt-3 min-h-11 w-full rounded-xl font-black text-red-700 underline underline-offset-4 dark:text-red-300">從行程移除</button>
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}
