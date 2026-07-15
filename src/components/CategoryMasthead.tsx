"use client";

import {
  CalendarRange,
  CheckCircle2,
  CloudOff,
  CloudUpload,
  Loader2,
  Luggage,
  MapPinned,
  Plane,
  Sparkles,
  UtensilsCrossed,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { useTrip } from "@/context/TripContext";

export type CategoryTab =
  | "flights"
  | "tripprep"
  | "transport"
  | "itinerary"
  | "food"
  | "assistant"
  | "tools";

type MastheadConfig = {
  index: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  glyph: string;
  icon: LucideIcon;
  highlights: string[];
};

const MASTHEADS: Record<CategoryTab, MastheadConfig> = {
  flights: {
    index: "01",
    eyebrow: "FLIGHT BOARD",
    title: "航班與機場",
    subtitle: "從桃園到成田，航廈、機型與即時狀態一次掌握。",
    glyph: "空",
    icon: Plane,
    highlights: ["TPE → NRT", "JX800 · JX805", "STARLUX"],
  },
  tripprep: {
    index: "02",
    eyebrow: "TRIP READINESS",
    title: "行前準備",
    subtitle: "天氣、預約、離線備案與行李，出發前一頁確認。",
    glyph: "備",
    icon: Luggage,
    highlights: ["天氣", "預約", "離線", "行李"],
  },
  transport: {
    index: "03",
    eyebrow: "STAY & MOVE",
    title: "住宿與交通",
    subtitle: "以錦糸町為基地，把機場接駁與每日移動化繁為簡。",
    glyph: "旅",
    icon: MapPinned,
    highlights: ["錦糸町", "NRT 接駁", "即時路線"],
  },
  itinerary: {
    index: "04",
    eyebrow: "DAY BY DAY",
    title: "六日行程",
    subtitle: "每一天的節奏、移動與備註，都在同一條時間線上。",
    glyph: "程",
    icon: CalendarRange,
    highlights: ["6 DAYS", "時間線", "導航", "統計"],
  },
  food: {
    index: "05",
    eyebrow: "TOKYO TASTE",
    title: "東京美食",
    subtitle: "依料理與區域探索，把想吃的店直接排進旅程。",
    glyph: "食",
    icon: UtensilsCrossed,
    highlights: ["拉麵", "壽司", "咖啡", "願望清單"],
  },
  assistant: {
    index: "06",
    eyebrow: "TRAVEL CONCIERGE",
    title: "旅遊助手",
    subtitle: "緊急求助、日語溝通與旅途提醒，隨時都找得到。",
    glyph: "助",
    icon: Sparkles,
    highlights: ["110 / 119", "實用日語", "離線支援"],
  },
  tools: {
    index: "07",
    eyebrow: "MONEY DESK",
    title: "旅費管理",
    subtitle: "日圓、台幣、共同分帳與發票辨識，花費清楚不掃興。",
    glyph: "費",
    icon: WalletCards,
    highlights: ["JPY / TWD", "共同分帳", "發票辨識"],
  },
};

export function CategoryMasthead({ tab }: { tab: CategoryTab }) {
  const config = MASTHEADS[tab];
  const Icon = config.icon;
  const { syncStatus, saveStatus, pendingSliceCount, storageError } = useTrip();

  const syncPresentation = (() => {
    if (storageError || syncStatus === "error" || saveStatus === "error") {
      return { Icon: CloudOff, label: "同步需處理", className: "is-error" };
    }
    if (syncStatus === "offline") {
      return { Icon: CloudOff, label: "離線模式", className: "is-offline" };
    }
    if (syncStatus === "connecting" || saveStatus === "saving") {
      return { Icon: Loader2, label: "同步中", className: "is-loading" };
    }
    if (saveStatus === "pending" || pendingSliceCount > 0) {
      return {
        Icon: CloudUpload,
        label: pendingSliceCount > 0 ? `待同步 ${pendingSliceCount}` : "等待同步",
        className: "is-pending",
      };
    }
    return { Icon: CheckCircle2, label: "已同步", className: "is-synced" };
  })();
  const SyncIcon = syncPresentation.Icon;

  return (
    <header className="category-masthead" data-tone={tab}>
      <div className="category-masthead__grid" aria-hidden="true" />
      <div className="category-masthead__glyph" aria-hidden="true">{config.glyph}</div>

      <div className="category-masthead__topline">
        <span className="font-metric">{config.index} / 07</span>
        <span>東京自由行 · 2026</span>
      </div>

      <div className="category-masthead__body">
        <div className="category-masthead__icon" aria-hidden="true">
          <Icon />
        </div>
        <div className="min-w-0">
          <p className="category-masthead__eyebrow">{config.eyebrow}</p>
          <h1>{config.title}</h1>
          <p className="category-masthead__subtitle">{config.subtitle}</p>
        </div>
      </div>

      <div className="category-masthead__footer">
        <div className="category-masthead__highlights" aria-label="本頁重點">
          {config.highlights.map((highlight) => (
            <span key={highlight}>{highlight}</span>
          ))}
        </div>
        <div
          className={`category-sync-status ${syncPresentation.className}`}
          role="status"
          aria-live="polite"
        >
          <SyncIcon className={syncPresentation.className === "is-loading" ? "motion-safe:animate-spin" : ""} />
          {syncPresentation.label}
        </div>
      </div>

      <div className="category-masthead__rail" aria-hidden="true">
        {Array.from({ length: 7 }, (_, index) => (
          <span key={index} className={index + 1 === Number(config.index) ? "is-active" : ""} />
        ))}
      </div>
    </header>
  );
}
