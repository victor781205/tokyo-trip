"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import { Camera, Upload, X, Loader2, Check, RotateCcw, ScanLine } from "lucide-react";
import { useDialog } from "@/context/DialogContext";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";

export interface ReceiptItem {
  name: string;
  amount: number;
  category: string;
}

interface ReceiptScannerProps {
  onScanComplete: (items: ReceiptItem[]) => void;
  onClose: () => void;
}

const CATEGORIES: Record<string, { keywords: string[] }> = {
  food: {
    keywords: [
      "食", "料", "飲", "弁当", "パン", "コーヒー", "ラーメン", "寿司", "カレー", "デザート", "菓子", "茶", "牛乳", "水", "ジュース", "啤酒", "酒", "肉", "魚", "野菜", "果物", "米", "麺", "豆腐", "牛丼", "定食", "丼", "サンドイッチ", "おにぎり", "サラダ", "スープ", "ケーキ", "アイス", "おむすび", "コロッケ", "天ぷら", "とんかつ", "ハンバーガー",
      "セブン", "ローソン", "ファミマ", "ミニストップ", "サークルK", "サンクス",
      "おでん", "ナチュラル", "プラス", "デイリー",
      " Dining", " Cafe", " CAFE", " Restaurant", "食堂", "咖啡", "早餐", "午餐", "晚餐",
      "ライフ", "西友", " costco", " AEON",
      "惣菜", "鮮魚", "青果", "精肉", "乳製品", "冷凍", "パック",
    ]
  },
  transport: {
    keywords: [
      "运费", "切符", "電車", "巴士", "タクシー", "定期", "乗車券", "IC", "Suica", "PASMO", "JR", "私鉄", "地下鉄", "メトロ", "新幹線", "高速", "ETC", "停车", " Parking", "駐輪場", "モノレール", "フェリー", "民航", "航空",
    ]
  },
  shopping: {
    keywords: [
      "服", "靴", "バッグ", "アクセサリー", "化妆品", "雜貨", "本", "CD", "DVD", "家电", "PC", "スマホ", "タブレット", "お土産", "土産", "記念品", "ユニクロ", "GU", "しまむら", "無印", "MUJI", "良品計画", "ニトリ",
      "ダイソー", "キャンドゥ", "大創", "百均",
      "松本清", "サンドラッグ", "クスリのアオキ", "ウエルシア", "スギ", "的有效",
      "ヨドバシ", "ビックカメラ", "上新電機", " LABI", "ベスト電器",
      "しまむら", "UNIQLO", " GU ", "H&M", "ZARA", "GAP", "ABC-MART",
    ]
  },
  ticket: {
    keywords: [
      "入場", "観覧", "チケット", "切符", "入園", "美術館", "博物館", "遊園地", "テーマパーク", "温泉", "展望台", "水族館", " Disney", " USJ", " TDR", " Zoo",
      "体験", "ツアー", "旅行", "入場料", "見本市", "演唱會", " Concert",
    ]
  },
  hotel: {
    keywords: [
      "宿泊", "ホテル", "旅館", "民宿", "チェックイン", "チェックアウト", "宿費", "泊", "連泊",
    ]
  },
  other: { keywords: [] }
};

const classifyItem = (name: string): string => {
  const lowerName = name.toLowerCase();
  for (const [category, data] of Object.entries(CATEGORIES)) {
    if (data.keywords.some(keyword => lowerName.includes(keyword.toLowerCase()))) {
      return category;
    }
  }
  if (lowerName.match(/[\d]+円/)) return "other";
  return "other";
};

const parseReceiptText = (text: string): ReceiptItem[] => {
  const items: ReceiptItem[] = [];
  const lines = text.split("\n").map(line => line.trim()).filter(line => line.length > 0);

  const skipPatterns = /^(合計|小計|税|消費税|内税|外税|お預り|お釣り|おつり|クレジット|現金|カード|レシート|領収書|日付|店名第一家|電話|TEL|残額|残高|預り|釣り|取引|時間帯|会員|メンバー|super|customer|card|point|ポイント|還元|非課税|軽減税率|税率)$/i;

  const pricePatterns = [
    /(.+?)\s*[¥￥]\s*([\d,]+)(?!\d)/,
    /(.+?)\s*([\d,]+)\s*円(?![\d])/,
    /(?:^|\n)([¥￥])\s*([\d,]+)(?!\d)/,
    /(.+?)[\s　]+([\d,]+)\s*円/,
    /(?:^|\n)([\d,]+)\s*円\s*(.+)/,
  ];

  for (const line of lines) {
    if (skipPatterns.test(line.trim())) continue;

    for (const pattern of pricePatterns) {
      const match = line.match(pattern);
      if (match) {
        const val1 = (match[1] || "").replace(/[¥￥,円\s]/g, "");
        const val2 = (match[2] || "").replace(/[¥￥,円\s]/g, "");
        const p1 = parseInt(val1, 10);
        const p2 = parseInt(val2, 10);

        let name = "";
        let amount = 0;

        if (!isNaN(p2) && p2 > 0 && p2 < 1000000 && val1.length > 0) {
          name = (match[1] || "").trim();
          amount = p2;
        } else if (!isNaN(p1) && p1 > 0 && p1 < 1000000 && val2.length > 0) {
          name = (match[2] || "").trim();
          amount = p1;
        }

        if (name && name.length > 1 && amount > 0) {
          const category = classifyItem(name);
          items.push({ name, amount, category });
          break;
        }
      }
    }
  }

  return items;
};

export function ReceiptScanner({ onScanComplete, onClose }: ReceiptScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const { alert } = useDialog();
  const [scanProgress, setScanProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recognizedItems, setRecognizedItems] = useState<ReceiptItem[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [ocrText, setOcrText] = useState<string>("");
  const [showRawText, setShowRawText] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef(true);

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const dialogRef = useModalAccessibility(true, onClose);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (isMountedRef.current) {
      setIsVideoReady(false);
      setIsCameraActive(false);
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (isStartingCamera) return;
    setIsStartingCamera(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia is unavailable");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      if (!isMountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      setIsCameraActive(true);
    } catch (error) {
      if (!isMountedRef.current) return;
      console.error("相機啟動失敗:", error);
      void alert({
        title: "相機無法啟動",
        message: "無法啟動相機，請檢查瀏覽器權限設定是否已開啟鏡頭存取。也可以改用「上傳圖片」。",
        accent: "danger",
      });
    } finally {
      if (isMountedRef.current) setIsStartingCamera(false);
    }
  }, [alert, isStartingCamera]);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isVideoReady) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);
    const imageDataUrl = canvas.toDataURL("image/jpeg", 0.8);
    setCapturedImage(imageDataUrl);
    setPreviewUrl(imageDataUrl);
    stopCamera();
  }, [isVideoReady, stopCamera]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (!isMountedRef.current) return;
      const result = event.target?.result as string;
      setCapturedImage(result);
      setPreviewUrl(result);
    };
    reader.readAsDataURL(file);
  }, []);

  const performOCR = useCallback(async () => {
    if (!capturedImage) return;
    setIsScanning(true);
    setScanProgress(0);

    try {
      const { default: Tesseract } = await import("tesseract.js");
      const result = await Tesseract.recognize(capturedImage, "jpn+jpn_vert+eng", {
        logger: (info) => {
          if (info.status === "recognizing text") {
            if (isMountedRef.current) setScanProgress(Math.round(info.progress * 100));
          }
        }
      });

      if (!isMountedRef.current) return;
      const text = result.data.text;
      setOcrText(text);
      const items = parseReceiptText(text);
      setRecognizedItems(items);
      setShowConfirm(true);
    } catch (error) {
      if (!isMountedRef.current) return;
      console.error("OCR 錯誤:", error);
      void alert({
        title: "掃描失敗",
        message: "掃描失敗，請重新拍攝一張光線充足、對焦清楚的收據再嘗試。",
        accent: "danger",
      });
    } finally {
      if (isMountedRef.current) setIsScanning(false);
    }
  }, [capturedImage, alert]);

  const confirmAddItems = useCallback(() => {
    const validItems = recognizedItems.filter(
      (item) => item.name.trim() && Number.isFinite(item.amount) && item.amount > 0,
    );
    if (validItems.length === 0) return;
    onScanComplete(validItems);
    onClose();
  }, [recognizedItems, onScanComplete, onClose]);

  const resetScanner = useCallback(() => {
    setCapturedImage(null);
    setPreviewUrl(null);
    setRecognizedItems([]);
    setShowConfirm(false);
    setOcrText("");
    setShowRawText(false);
    setScanProgress(0);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isCameraActive || !videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    video.srcObject = stream;
    void video.play().catch(() => {
      if (isMountedRef.current) setIsVideoReady(false);
    });
    return () => {
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [isCameraActive]);

  const validRecognizedItems = recognizedItems.filter(
    (item) => item.name.trim() && Number.isFinite(item.amount) && item.amount > 0,
  );

  const updateItem = useCallback((index: number, field: keyof ReceiptItem, value: string | number) => {
    setRecognizedItems(prev => {
      const newItems = [...prev];
      const item = { ...newItems[index] };
      if (field === "amount") item.amount = Number(value);
      else if (field === "name") item.name = String(value);
      else if (field === "category") item.category = String(value);
      newItems[index] = item;
      return newItems;
    });
  }, []);

  const removeItem = useCallback((index: number) => {
    setRecognizedItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-scanner-title"
        tabIndex={-1}
        className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col outline-none"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-primary" />
            <h2 id="receipt-scanner-title" className="text-lg font-black">掃描發票</h2>
          </div>
          <button onClick={() => { stopCamera(); onClose(); }} data-autofocus className="w-11 h-11 inline-flex items-center justify-center hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors" aria-label="關閉發票掃描">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {previewUrl ? (
            <div className="relative w-full h-48 mb-4">
              <Image src={previewUrl} alt="發票預覽" fill className="object-contain rounded-2xl bg-gray-50 dark:bg-slate-900" />
              <button
                onClick={resetScanner}
                className="absolute top-2 right-2 w-11 h-11 inline-flex items-center justify-center bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
                aria-label="重新拍攝"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          ) : isCameraActive ? (
            <div className="relative mb-4">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                onLoadedMetadata={() => setIsVideoReady(true)}
                className="w-full h-48 object-cover rounded-2xl bg-black"
              />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
                <button
                  onClick={capturePhoto}
                  disabled={!isVideoReady}
                  aria-label="拍照"
                  className="w-20 h-20 bg-white rounded-full border-4 border-primary shadow-lg active:scale-95 transition-transform flex items-center justify-center disabled:opacity-50"
                >
                  <Camera className="w-9 h-9 text-primary" />
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                onClick={startCamera}
                disabled={isStartingCamera}
                className="flex flex-col items-center justify-center gap-3 p-6 bg-gray-50 dark:bg-slate-900 rounded-2xl border-2 border-dashed border-gray-200 dark:border-slate-700 hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-60"
              >
                {isStartingCamera ? <Loader2 className="w-8 h-8 text-primary animate-spin" /> : <Camera className="w-8 h-8 text-gray-400" />}
                <span className="font-bold text-sm">{isStartingCamera ? "正在開啟相機…" : "拍照掃描"}</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-3 p-6 bg-gray-50 dark:bg-slate-900 rounded-2xl border-2 border-dashed border-gray-200 dark:border-slate-700 hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <Upload className="w-8 h-8 text-gray-400" />
                <span className="font-bold text-sm">上傳圖片</span>
              </button>

              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            </div>
          )}

          {capturedImage && !showConfirm && (
            <button
              onClick={performOCR}
              disabled={isScanning}
              className="w-full py-3.5 bg-primary text-white rounded-2xl font-bold shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>辨識中... {scanProgress}%</span>
                </>
              ) : (
                <>
                  <ScanLine className="w-5 h-5" />
                  <span>開始掃描辨識</span>
                </>
              )}
            </button>
          )}

          {isScanning && (
            <div className="mt-3">
              <div className="w-full h-2 bg-gray-100 dark:bg-slate-900 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${scanProgress}%` }} />
              </div>
            </div>
          )}

          {ocrText && (
            <div className="mt-4">
              <button onClick={() => setShowRawText(!showRawText)} className="inline-flex min-h-11 items-center text-sm text-gray-500 hover:text-primary transition-colors">
                {showRawText ? "隱藏原始辨識文字" : "顯示原始辨識文字"}
              </button>
              {showRawText && (
                <pre className="mt-2 p-3 bg-gray-50 dark:bg-slate-900 rounded-xl text-xs font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {ocrText}
                </pre>
              )}
            </div>
          )}

          {showConfirm && (
            <div className="mt-4">
              <h3 className="font-bold text-base mb-3">辨識結果</h3>

              {recognizedItems.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  <p className="mb-2">未能辨識出商品項目</p>
                  <p className="text-sm">請確保發票圖片清晰，或手動新增項目</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recognizedItems.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-slate-900 rounded-xl">
                      <select
                        value={item.category}
                        onChange={(e) => updateItem(index, "category", e.target.value)}
                        className="w-12 min-h-11 text-center text-xl bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700"
                        aria-label="選擇分類"
                      >
                        <option value="food">🍜</option>
                        <option value="transport">🚆</option>
                        <option value="shopping">🛍️</option>
                        <option value="ticket">🎫</option>
                        <option value="hotel">🏨</option>
                        <option value="other">💡</option>
                      </select>

                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateItem(index, "name", e.target.value)}
                        className="flex-1 min-w-0 min-h-11 px-3 py-2 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 text-sm"
                        aria-label="商品名稱"
                      />

                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 text-sm">¥</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={item.amount}
                          onChange={(e) => updateItem(index, "amount", e.target.value)}
                          aria-invalid={!Number.isFinite(item.amount) || item.amount <= 0}
                          className="w-20 min-h-11 px-2 py-2 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 text-sm font-bold"
                          aria-label="金額"
                        />
                      </div>

                      <button onClick={() => removeItem(index)} className="w-11 h-11 shrink-0 inline-flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors rounded-xl" aria-label={`刪除「${item.name}」`}>
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3 mt-4">
                <button
                  onClick={resetScanner}
                  className="flex-1 py-3.5 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-2xl font-bold active:scale-95 transition-all"
                >
                  重新掃描
                </button>
                <button
                  onClick={confirmAddItems}
                  disabled={validRecognizedItems.length === 0}
                  className="flex-1 py-3.5 bg-primary text-white rounded-2xl font-bold shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Check className="w-5 h-5" />
                  <span>確認新增 ({validRecognizedItems.length} 項)</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-slate-700">
          <p className="text-xs text-gray-400 text-center">
            支援日文發票自動辨識（橫書・直書），請確保圖片清晰
          </p>
        </div>
      </div>
    </div>
  );
}
