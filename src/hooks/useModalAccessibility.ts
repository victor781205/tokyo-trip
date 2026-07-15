"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

type ModalStackEntry = {
  token: symbol;
  dialog: HTMLElement;
};

type IsolationSnapshot = {
  ariaHidden: string | null;
  inertAttribute: string | null;
  inertProperty: boolean | undefined;
};

const modalStack: ModalStackEntry[] = [];
const isolatedElements = new Map<HTMLElement, IsolationSnapshot>();
let originalBodyOverflow: string | null = null;

function restoreBackground() {
  isolatedElements.forEach((snapshot, element) => {
    if (snapshot.inertProperty !== undefined && "inert" in element) {
      element.inert = snapshot.inertProperty;
    }

    // Set the attributes after the property because the native property can
    // reflect to the inert attribute. This preserves even unusual old values.
    if (snapshot.inertAttribute === null) {
      element.removeAttribute("inert");
    } else {
      element.setAttribute("inert", snapshot.inertAttribute);
    }

    if (snapshot.ariaHidden === null) {
      element.removeAttribute("aria-hidden");
    } else {
      element.setAttribute("aria-hidden", snapshot.ariaHidden);
    }
  });
  isolatedElements.clear();
}

function isolateElement(element: HTMLElement) {
  if (!isolatedElements.has(element)) {
    isolatedElements.set(element, {
      ariaHidden: element.getAttribute("aria-hidden"),
      inertAttribute: element.getAttribute("inert"),
      inertProperty: "inert" in element ? element.inert : undefined,
    });
  }

  element.setAttribute("aria-hidden", "true");
  element.setAttribute("inert", "");
  if ("inert" in element) element.inert = true;
}

/**
 * Hide every branch outside the top-most dialog. Walking through siblings at
 * each level keeps the dialog and all of its ancestors operable, including
 * when a modal is nested in another modal instead of rendered in a portal.
 */
function isolateBackgroundForTopModal() {
  restoreBackground();

  const dialog = modalStack.at(-1)?.dialog;
  if (!dialog?.isConnected) return;

  let activeBranch: HTMLElement = dialog;
  while (activeBranch.parentElement) {
    const parent = activeBranch.parentElement;
    Array.from(parent.children).forEach((sibling) => {
      if (sibling !== activeBranch && sibling instanceof HTMLElement) {
        isolateElement(sibling);
      }
    });

    if (parent === document.body) break;
    activeBranch = parent;
  }
}

function addToModalStack(token: symbol, dialog: HTMLElement) {
  if (modalStack.length === 0) {
    originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }

  const existingIndex = modalStack.findIndex((entry) => entry.token === token);
  if (existingIndex !== -1) modalStack.splice(existingIndex, 1);
  modalStack.push({ token, dialog });
  isolateBackgroundForTopModal();
}

function removeFromModalStack(token: symbol) {
  const index = modalStack.findLastIndex((entry) => entry.token === token);
  if (index !== -1) modalStack.splice(index, 1);

  if (modalStack.length === 0) {
    restoreBackground();
    if (originalBodyOverflow !== null) {
      document.body.style.overflow = originalBodyOverflow;
      originalBodyOverflow = null;
    }
  } else {
    isolateBackgroundForTopModal();
  }
}

/** Esc、初始焦點、焦點還原、背景隔離與 Tab focus trap。 */
export function useModalAccessibility(
  isOpen: boolean,
  onClose: () => void,
) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const stackTokenRef = useRef(Symbol("modal"));

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const stackToken = stackTokenRef.current;
    const dialog = dialogRef.current;
    if (!dialog) return;

    addToModalStack(stackToken, dialog);
    const focusable = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null,
      );

    const frame = requestAnimationFrame(() => {
      const preferred = dialog.querySelector<HTMLElement>("[data-autofocus]");
      (preferred ?? focusable()[0] ?? dialog).focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (modalStack.at(-1)?.token !== stackToken) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      removeFromModalStack(stackToken);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen]);

  return dialogRef;
}
