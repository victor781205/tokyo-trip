"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, Upload, X, Loader2, Check, RotateCcw, ScanLine } from "lucide-react";

export interface ReceiptItem {
  name: string;
  amount: number;
  category: string;
}

interface ReceiptScannerProps {
  onScanComplete: (items: ReceiptItem[]) => void;
  onClose: () => void;
}

const CATEGORIES = {
  food: { keywords: ["食", "料", "飲", "弁当", "パン", "コーヒー", "ラーメン", "寿司", "カレー", "デザート", "菓子", "茶", "牛乳", "水", "ジュース", "ビール", "酒", "肉", "魚", "野菜", "果物", "米", "麺", "豆腐", "牛丼", "定食", "丼", "サンドイッチ", "おにぎり", "サラダ", "スープ", "ケーキ", "アイス"] },
  transport: { keywords: ["運賃", "切符", "電車", "バス", "タクシー", "定期", "乗車券", "IC", "Suica", "PASMO", "JR", "私鉄", "地下鉄", "メトロ", "新幹線"] },
  shopping: { keywords: ["服", "靴", "バッグ", "アクセサリー", "化粧品", "雑貨", "本", "CD", "DVD", "家電", "PC", "スマホ", "タブレット", "お土産", "土産", "記念品", "ユニクロ", "GU", "しまむら", "無印", "MUJI"] },
  ticket: { keywords: ["入場", "観覧", "チケット", "切符", "入園", "美術館", "博物館", "遊園地", "テーマパーク", "温泉", "展望台"] },
  hotel: { keywords: ["宿泊", "ホテル", "旅館", "民宿", "チェックイン", "チェックアウト"] },
  other: { keywords: [] }
};

const classifyItem = (name: string): string => {
  const lowerName = name.toLowerCase();

  for (const [category, data] of Object.entries(CATEGORIES)) {
    if (data.keywords.some(keyword => lowerName.includes(keyword.toLowerCase()))) {
      return category;
    }
  }

  // 預設分類
  if (lowerName.match(/[\d]+円/)) return "other";
  return "other";
};

const parseReceiptText = (text: string): ReceiptItem[] => {
  const items: ReceiptItem[] = [];
  const lines = text.split("\n").map(line => line.trim()).filter(line => line.length > 0);

  // 日文發票常見格式：商品名稱 + 價格
  // 例如：おにぎり　¥120 或 ラーメン　500円
  const pricePatterns = [
    /(.+?)\s*[¥￥]\s*([\d,]+)/,  // 名稱 ¥金額
    /(.+?)\s*([\d,]+)\s*円/,     // 名稱 金額円
    /(.+?)\s+([\d,]+)$/,         // 名稱 金額
    /([\d,]+)\s*円\s*(.+)/,      // 金額円 名稱
    /[¥￥]\s*([\d,]+)\s*(.+)/,   // ¥金額 名稱
  ];

  for (const line of lines) {
    // 跳過不相關的行
    if (line.match(/^(合計|小計|税|消費税|内税|外税|お預かり|お釣り|おつり|クレジット|現金|カード|レシート|領収書|日付|店名|住所|電話|TEL|残額|残高|預かり|釣り)/)) {
      continue;
    }

    for (const pattern of pricePatterns) {
      const match = line.match(pattern);
      if (match) {
        const name = (match[1] || match[3] || "").trim();
        const amountStr = (match[2] || match[1] || "").replace(/,/g, "");
        const amount = parseInt(amountStr, 10);

        if (name && !isNaN(amount) && amount > 0 && amount < 1000000) {
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

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  // 啟動相機
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsCameraActive(true);
      }
    } catch (error) {
      console.error("相機啟動失敗:", error);
      alert("無法啟動相機，請檢查權限設定");
    }
  }, []);

  // 停止相機
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  // 拍照
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

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
  }, [stopCamera]);

  // 處理檔案上傳
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setCapturedImage(result);
      setPreviewUrl(result);
    };
    reader.readAsDataURL(file);
  }, []);

  // 執行 OCR 掃描
  const performOCR = useCallback(async () => {
    if (!capturedImage) return;

    setIsScanning(true);
    setScanProgress(0);

    try {
      const { default: Tesseract } = await import("tesseract.js");
      const result = await Tesseract.recognize(capturedImage, "jpn", {
        logger: (info) => {
          if (info.status === "recognizing text") {
            setScanProgress(Math.round(info.progress * 100));
          }
        }
      });

      const text = result.data.text;
      setOcrText(text);

      const items = parseReceiptText(text);
      setRecognizedItems(items);
      setShowConfirm(true);

    } catch (error) {
      console.error("OCR 錯誤:", error);
      alert("掃描失敗，請重新嘗試");
    } finally {
      setIsScanning(false);
    }
  }, [capturedImage]);

  // 確認新增項目
  const confirmAddItems = useCallback(() => {
    onScanComplete(recognizedItems);
    onClose();
  }, [recognizedItems, onScanComplete, onClose]);

  // 重新掃描
  const resetScanner = useCallback(() => {
    setCapturedImage(null);
    setPreviewUrl(null);
    setRecognizedItems([]);
    setShowConfirm(false);
    setOcrText("");
    setShowRawText(false);
    setScanProgress(0);
  }, []);

  // 清理相機資源
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // 編輯辨識項目
  const updateItem = useCallback((index: number, field: keyof ReceiptItem, value: string | number) => {
    setRecognizedItems(prev => {
      const newItems = [...prev];
      const item = { ...newItems[index] };
      if (field === "amount") {
        item.amount = Number(value);
      } else if (field === "name") {
        item.name = String(value);
      } else if (field === "category") {
        item.category = String(value);
      }
      newItems[index] = item;
      return newItems;
    });
  }, []);

  // 刪除項目
  const removeItem = useCallback((index: number) => {
    setRecognizedItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        {/* 標題列 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-black">掃描發票</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 主要內容區 */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* 相機預覽 / 圖片預覽 */}
          {previewUrl ? (
            <div className="relative mb-4">
              <img src={previewUrl} alt="發票預覽" className="w-full h-48 object-contain rounded-2xl bg-gray-50 dark:bg-slate-900" />
              <button
                onClick={resetScanner}
                className="absolute top-2 right-2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          ) : isCameraActive ? (
            <div className="relative mb-4">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-48 object-cover rounded-2xl bg-black"
              />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
                <button
                  onClick={capturePhoto}
                  className="w-16 h-16 bg-white rounded-full border-4 border-primary shadow-lg active:scale-95 transition-transform"
                >
                  <Camera className="w-8 h-8 text-primary mx-auto" />
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                onClick={startCamera}
                className="flex flex-col items-center justify-center gap-3 p-6 bg-gray-50 dark:bg-slate-900 rounded-2xl border-2 border-dashed border-gray-200 dark:border-slate-700 hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <Camera className="w-8 h-8 text-gray-400" />
                <span className="font-bold text-sm">拍照掃描</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-3 p-6 bg-gray-50 dark:bg-slate-900 rounded-2xl border-2 border-dashed border-gray-200 dark:border-slate-700 hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <Upload className="w-8 h-8 text-gray-400" />
                <span className="font-bold text-sm">上傳圖片</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          )}

          {/* 掃描按鈕 */}
          {capturedImage && !showConfirm && (
            <button
              onClick={performOCR}
              disabled={isScanning}
              className="w-full py-3 bg-primary text-white rounded-2xl font-bold shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all"
            >
              {isScanning ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>辨識中... {scanProgress}%</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <ScanLine className="w-5 h-5" />
                  <span>開始掃描辨識</span>
                </div>
              )}
            </button>
          )}

          {/* 掃描進度條 */}
          {isScanning && (
            <div className="mt-3">
              <div className="w-full h-2 bg-gray-100 dark:bg-slate-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${scanProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* 原始 OCR 文字 */}
          {ocrText && (
            <div className="mt-4">
              <button
                onClick={() => setShowRawText(!showRawText)}
                className="text-sm text-gray-500 hover:text-primary transition-colors"
              >
                {showRawText ? "隱藏原始文字" : "顯示原始辨識文字"}
              </button>
              {showRawText && (
                <pre className="mt-2 p-3 bg-gray-50 dark:bg-slate-900 rounded-xl text-xs font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {ocrText}
                </pre>
              )}
            </div>
          )}

          {/* 辨識結果確認 */}
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
                        className="w-12 text-center text-xl bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700"
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
                        className="flex-1 min-w-0 px-3 py-2 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 text-sm"
                      />

                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 text-sm">¥</span>
                        <input
                          type="number"
                          value={item.amount}
                          onChange={(e) => updateItem(index, "amount", e.target.value)}
                          className="w-20 px-2 py-2 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 text-sm font-bold"
                        />
                      </div>

                      <button
                        onClick={() => removeItem(index)}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 確認按鈕 */}
              <div className="flex gap-3 mt-4">
                <button
                  onClick={resetScanner}
                  className="flex-1 py-3 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-2xl font-bold active:scale-95 transition-all"
                >
                  重新掃描
                </button>
                <button
                  onClick={confirmAddItems}
                  disabled={recognizedItems.length === 0}
                  className="flex-1 py-3 bg-primary text-white rounded-2xl font-bold shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all"
                >
                  <div className="flex items-center justify-center gap-2">
                    <Check className="w-5 h-5" />
                    <span>確認新增 ({recognizedItems.length} 項)</span>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 底部提示 */}
        <div className="p-4 border-t border-gray-100 dark:border-slate-700">
          <p className="text-xs text-gray-400 text-center">
            支援日文發票自動辨識，請確保圖片清晰
          </p>
        </div>
      </div>
    </div>
  );
}