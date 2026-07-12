/**
 * 航空公司機場站位預設資訊（hardcode）
 * 用於補足 live API 未回傳的出發端航廈資訊。
 * 例：AviationStack 在航班「尚未排定/已過期」時不會回 NRT 端航廈，
 * 但旅客需知 JX805 從 NRT 第 2 航廈登機。
 *
 * key 規則：`${airlineIcao}_${stationIata}`，例如 "JX_NRT"。
 */

export type StationInfo = {
  /** IATA 機場代碼，例如 "NRT" */
  iata: string;
  /** 機場中文名稱，例如 "成田國際機場" */
  nameZh: string;
  /** 預設航廈字串（可為中文或數字），例如 "2" 或 "第 2 航廈" */
  defaultTerminal: string;
  /** 是否為星宇航空固定使用航廈（true=旅客公告應走此航廈） */
  isStarluxTerminal: boolean;
};

const STATIONS: Record<string, StationInfo> = {
  // 星宇航空東京成田站位：固定第 2 航廈
  JX_NRT: {
    iata: "NRT",
    nameZh: "成田國際機場",
    defaultTerminal: "2",
    isStarluxTerminal: true,
  },
  // 星宇航空桃園站位：固定第 1 航廈
  JX_TPE: {
    iata: "TPE",
    nameZh: "桃園國際機場",
    defaultTerminal: "1",
    isStarluxTerminal: true,
  },
};

/**
 * 取得指定航空 + 機場站位預設資訊。
 * @param airlineIcao 航空公司 ICAO 代碼，如 "JX"
 * @param stationIata 機場 IATA 代碼，如 "NRT"
 */
export function getStationInfo(
  airlineIcao: string,
  stationIata: string
): StationInfo | null {
  if (!airlineIcao || !stationIata) return null;
  const key = `${airlineIcao.toUpperCase()}_${stationIata.toUpperCase()}`;
  return STATIONS[key] ?? null;
}
