/**
 * 機型資訊模組
 * - 提供 ICAO 機型代碼 / 廠商格式變體 → 中文/英文機型名稱與特色標籤的對照
 * - 提供 JX800 / JX805 預定機型（hardcode，做為 fallback 與回程的資料來源）
 * - 預定機型以星宇航空官網公布為準；欄位附上「以官方公布為準」標記
 */

export type AircraftInfo = {
  /** ICAO 機型代碼，例如 "A359" */
  icao: string;
  /** 中文機型名稱，例如 "Airbus A350-900" */
  modelZh: string;
  /** 英文機型名稱，例如 "Airbus A350-900" */
  modelEn: string;
  /** 機上服務特色標籤（給旅客的體驗資訊） */
  tags: string[];
};

const A350_900: AircraftInfo = {
  icao: "A359",
  modelZh: "Airbus A350-900",
  modelEn: "Airbus A350-900",
  tags: ["WiFi", "USB 充電", "個人螢幕", "寬體 306 席"],
};
const A350_1000: AircraftInfo = {
  icao: "A35K",
  modelZh: "Airbus A350-1000",
  modelEn: "Airbus A350-1000",
  tags: ["WiFi", "USB 充電", "個人螢幕", "寬體 350 席"],
};
const A330_300: AircraftInfo = {
  icao: "A333",
  modelZh: "Airbus A330-300",
  modelEn: "Airbus A330-300",
  tags: ["WiFi", "USB 充電", "個人螢幕", "寬體 277 席"],
};
const A330_900: AircraftInfo = {
  icao: "A339",
  modelZh: "Airbus A330-900neo",
  modelEn: "Airbus A330-900neo",
  tags: ["WiFi", "USB 充電", "個人螢幕", "寬體 297 席"],
};
const B777_300ER: AircraftInfo = {
  icao: "B77W",
  modelZh: "Boeing 777-300ER",
  modelEn: "Boeing 777-300ER",
  tags: ["WiFi", "USB 充電", "個人螢幕", "寬體"],
};
const B787_9: AircraftInfo = {
  icao: "B789",
  modelZh: "Boeing 787-9",
  modelEn: "Boeing 787-9",
  tags: ["WiFi", "USB 充電", "個人螢幕", "寬體"],
};

/**
 * ICAO 機型代碼對照表
 * 鍵除了標準 ICAO 代碼（A359 / A35K / A333 / A339 / B77W / B789）外，
 * 額外容納 TDX FIDS AcType 欄位常見的廠商格式變體
 * （例如 "A350-900"、"A350-100"、"A350-1000"、"A330-900neo"）。
 */
const AIRCRAFT_MAP: Record<string, AircraftInfo> = {
  // 標準 ICAO 4 字元代碼
  A359: A350_900,
  A35K: A350_1000,
  A333: A330_300,
  A339: A330_900,
  B77W: B777_300ER,
  B789: B787_9,
  // Airbus 廠商格式變體
  "A350-900": A350_900,
  "A350-1000": A350_1000,
  "A350-100": A350_1000, // TDX 偶見的縮寫
  "A330-300": A330_300,
  "A330-900": A330_900,
  "A330-900NEO": A330_900,
  // Boeing 廠商格式變體
  "777-300ER": B777_300ER,
  "777-300": B777_300ER,
  "787-9": B787_9,
  "787": B787_9,
};

/**
 * 取得機型資訊。FALLBACK：未命中時用 ICAO code 本身作為名稱。
 */
export function getAircraftInfo(icao: string | null | undefined): AircraftInfo | null {
  if (!icao) return null;
  const code = icao.trim().toUpperCase();
  if (!code) return null;
  const known = AIRCRAFT_MAP[code];
  if (known) return known;
  return {
    icao: code,
    modelZh: code,
    modelEn: code,
    tags: [],
  };
}

/**
 * 本次訂位的預定機型表。
 * JX800 / JX805 是旅客已確認的訂位資料，不讓第三方 FIDS 的錯誤或舊
 * AcType 靜默覆蓋；當日實際調度仍以航空公司公告為準。
 */
export const SCHEDULED_AIRCRAFT: Record<string, string> = {
  JX800: "A35K", // 本次去程 JX800（TPE→NRT）預定機型：A350-1000
  JX801: "A359",
  JX802: "A359",
  JX804: "A359",
  JX805: "A339", // 本次回程 JX805（NRT→TPE）預定機型：A330-900neo
  JX806: "A359",
};

/**
 * 取得航班預定機型資訊，找不到時回 null。
 */
export function getScheduledAircraft(flight: string): AircraftInfo | null {
  const key = flight.trim().toUpperCase();
  return getAircraftInfo(SCHEDULED_AIRCRAFT[key]);
}

/**
 * 解析後的機型資料，供 API 回傳給前端。
 * icao 來自 live API（如 TDX）或 hardcode（fallback）；modelZh/tags 由對照表衍生。
 * 注意：若 live 資料查到的值不在對照表中（罕見廠商代碼變體），
 * 仍會退回 hardcode 預定機型，避免顯示「A350-100」這種不利旅客識別的字串。
 */
export function resolveAircraft(
  liveIcao: string | null | undefined,
  flight: string
): { icao: string; modelZh: string; modelEn: string; tags: string[]; live: boolean } | null {
  const scheduled = getScheduledAircraft(flight);

  // 對已有訂位機型的航班，live feed 只有在型號一致時才可把標示升級為
  // LIVE；不同型號可能是 FIDS 舊資料，不能再次把 JX800/JX805 顯示錯。
  if (scheduled) {
    const liveCode = liveIcao?.trim().toUpperCase();
    return {
      ...scheduled,
      live: Boolean(liveCode && AIRCRAFT_MAP[liveCode]?.icao === scheduled.icao),
    };
  }

  // 沒有訂位基準的其他航班，才直接採用可識別的即時資料。
  if (liveIcao && liveIcao.trim()) {
    const code = liveIcao.trim().toUpperCase();
    const info = AIRCRAFT_MAP[code];
    if (info) {
      return { ...info, live: true };
    }
  }
  return null;
}
