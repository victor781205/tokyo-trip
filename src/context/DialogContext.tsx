"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";

/**
 * DialogProvider
 *
 * 一個取代原生 `window.confirm()` / `window.alert()` 的宣告式 + 命令式混合
 * 對話框系統。提供 `useDialog()` hook 回傳 `{ confirm, alert }` 兩個回傳
 * Promise 的方法，讓消费端可以在 async handler 內 `if (!(await confirm(...)))`
 * 完全沿用原本 `if (!confirm(...)) return;` 的寫法，體驗升級但呼叫點不動太多。
 *
 * 特性：
 *   - 同一時間只渲染一個對話框（先進先出 queue），避免多層堆疊
 *   - Esc 鍵 = 取消 / 關閉；點 backdrop = 取消 / 關閉
 *   - 開啟時鎖 body 滾動、自動聚焦預設按鈕
 *   - 支援 `prefers-reduced-motion`（動畫用 inline style，不依賴 animate 套件）
 *   - 完整 ARIA：role="alertdialog"、aria-modal、aria-labelledby/_describedby
 */

type DialogKind = "confirm" | "alert";

type Accent = "danger" | "primary";

interface DialogOptions {
  /** 對話框標題，預設「確認操作」/「通知」 */
  title?: string;
  /** 訊息內容（已支援純文字換行） */
  message: string;
  /** 主按鈕語意色：danger 紅 / primary 品牌紅，alert 預設 primary */
  accent?: Accent;
  /** confirm 的確認鈕文字，預設「確認」 */
  confirmText?: string;
  /** confirm 的取消鈕文字，預設「取消」 */
  cancelText?: string;
  /** alert 關閉鈕文字，預設「知道了」 */
  closeText?: string;
}

interface DialogState extends DialogOptions {
  id: number;
  kind: DialogKind;
  resolve: (value: boolean) => void;
}

interface DialogApi {
  confirm: (options: DialogOptions | string) => Promise<boolean>;
  alert: (options: DialogOptions | string) => Promise<void>;
}

const DialogContext = createContext<DialogApi | null>(null);

/** 便利類型：接受字串（視為 message）或完整 options */
function normalize(input: DialogOptions | string, defaults: DialogOptions): DialogOptions {
  return typeof input === "string" ? { ...defaults, message: input } : { ...defaults, ...input };
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<DialogState[]>([]);
  const idRef = useRef(0);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  const current = queue[0];

  const enqueue = useCallback((state: Omit<DialogState, "id">) => {
    const id = (idRef.current += 1);
    setQueue((prev) => [...prev, { ...state, id }]);
  }, []);

  const closeCurrent = useCallback((value: boolean) => {
    setQueue((prev) => {
      if (prev.length === 0) return prev;
      const [head, ...rest] = prev;
      // 解析上層 Promise 並丟掉 head
      head.resolve(value);
      return rest;
    });
  }, []);

  const confirm = useCallback(
    (input: DialogOptions | string) =>
      new Promise<boolean>((resolve) => {
        const options = normalize(input, {
          message: "",
          accent: "danger" as Accent,
          confirmText: "確認",
          cancelText: "取消",
        });
        enqueue({ kind: "confirm", resolve, ...options });
      }),
    [enqueue],
  );

  const alert = useCallback(
    (input: DialogOptions | string) =>
      new Promise<void>((resolve) => {
        const options = normalize(input, {
          message: "",
          accent: "primary" as Accent,
          closeText: "知道了",
        });
        enqueue({
          kind: "alert",
          // alert 關閉即可，解析值不帶意義
          resolve: () => resolve(),
          ...options,
        });
      }),
    [enqueue],
  );

  // alert 可用 Enter 關閉；Esc 與 focus trap 由共用 modal hook 處理。
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && current.kind === "alert") {
        e.preventDefault();
        closeCurrent(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, closeCurrent]);

  const api = useMemo<DialogApi>(() => ({ confirm, alert }), [confirm, alert]);

  return (
    <DialogContext.Provider value={api}>
      {children}
      {current ? (
        <DialogView
          state={current}
          onClose={closeCurrent}
          confirmBtnRef={confirmBtnRef}
        />
      ) : null}
    </DialogContext.Provider>
  );
}

function DialogView({
  state,
  onClose,
  confirmBtnRef,
}: {
  state: DialogState;
  onClose: (value: boolean) => void;
  confirmBtnRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const isConfirm = state.kind === "confirm";
  const accent: Accent = state.accent ?? (isConfirm ? "danger" : "primary");

  const titleId = `dialog-title-${state.id}`;
  const descId = `dialog-desc-${state.id}`;
  const closeFromKeyboard = useCallback(() => onClose(false), [onClose]);
  const dialogRef = useModalAccessibility(true, closeFromKeyboard);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
      onClick={() => onClose(false)}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden border border-white/10 bg-white dark:bg-slate-800"
        style={{
          animation: "dialog-pop 180ms cubic-bezier(.34,1.56,.64,1)",
        }}
      >
        {/* 標題列（漸層配色依 accent） */}
        <div
          className="p-6 text-white relative"
          style={{
            background:
              accent === "danger"
                ? "linear-gradient(135deg,#e74c3c,#c0392b)"
                : "linear-gradient(135deg,#e74c3c,#e67e22)",
          }}
        >
          <h3 id={titleId} className="text-2xl font-black">
            {state.title ?? (isConfirm ? "確認操作" : "通知")}
          </h3>
        </div>

        <div className="p-6 space-y-6">
          <p
            id={descId}
            className="text-gray-700 dark:text-gray-200 text-base leading-relaxed whitespace-pre-line"
          >
            {state.message}
          </p>

          <div className="flex gap-3">
            {isConfirm ? (
              <button
                type="button"
                onClick={() => onClose(false)}
                className="flex-1 py-3.5 rounded-2xl font-black text-gray-900 dark:text-white bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors active:scale-95"
              >
                {state.cancelText ?? "取消"}
              </button>
            ) : null}
            <button
              ref={confirmBtnRef}
              data-autofocus
              type="button"
              onClick={() => onClose(true)}
              className="flex-1 py-3.5 rounded-2xl font-black text-white shadow-lg transition-all active:scale-95"
              style={{
                background:
                  accent === "danger" ? "var(--color-primary-dark, #c0392b)" : "var(--color-primary, #e74c3c)",
                boxShadow:
                  accent === "danger"
                    ? "0 10px 25px -5px rgba(192,57,43,0.4)"
                    : "0 10px 25px -5px rgba(231,76,60,0.4)",
              }}
            >
              {isConfirm ? (state.confirmText ?? "確認") : (state.closeText ?? "知道了")}
            </button>
          </div>
        </div>
      </div>

      {/* inline keyframes（避免依賴 animate 套件；同時尊重 reduced-motion） */}
      <style>{`
        @keyframes dialog-pop {
          0%   { transform: translateY(8px) scale(0.96); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          [role="alertdialog"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error("useDialog 必須包在 <DialogProvider> 內使用");
  }
  return ctx;
}
