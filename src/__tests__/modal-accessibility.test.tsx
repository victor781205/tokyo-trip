import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";

function SingleDialog({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const dialogRef = useModalAccessibility(open, () => setOpen(false));

  return (
    <>
      <button onClick={() => setOpen(true)}>開啟對話框</button>
      <section data-testid="existing-state" aria-hidden="false" inert />
      {open && (
        <div ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1}>
          <button>對話框操作</button>
        </div>
      )}
    </>
  );
}

function NestedDialogs() {
  const [outerOpen, setOuterOpen] = useState(false);
  const [innerOpen, setInnerOpen] = useState(false);
  const outerRef = useModalAccessibility(outerOpen, () => setOuterOpen(false));
  const innerRef = useModalAccessibility(innerOpen, () => setInnerOpen(false));

  return (
    <>
      <button onClick={() => setOuterOpen(true)}>開啟外層</button>
      {outerOpen && (
        <div ref={outerRef} role="dialog" tabIndex={-1}>
          <button onClick={() => setInnerOpen(true)}>開啟內層</button>
        </div>
      )}
      {innerOpen && (
        <div ref={innerRef} role="alertdialog" tabIndex={-1}>
          <button>內層操作</button>
        </div>
      )}
    </>
  );
}

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("useModalAccessibility", () => {
  it("開啟一般 modal 時隔離背景，關閉後精確還原既有狀態", () => {
    document.body.style.overflow = "clip";
    render(<SingleDialog />);

    const trigger = screen.getByRole("button", { name: "開啟對話框" });
    const existingState = screen.getByTestId("existing-state");
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog");
    expect(dialog).not.toHaveAttribute("inert");
    expect(dialog).not.toHaveAttribute("aria-hidden");
    expect(trigger).toHaveAttribute("inert");
    expect(trigger).toHaveAttribute("aria-hidden", "true");
    expect(existingState).toHaveAttribute("inert");
    expect(existingState).toHaveAttribute("aria-hidden", "true");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).not.toHaveAttribute("inert");
    expect(trigger).not.toHaveAttribute("aria-hidden");
    expect(existingState).toHaveAttribute("inert");
    expect(existingState).toHaveAttribute("aria-hidden", "false");
    expect(document.body.style.overflow).toBe("clip");
  });

  it("nested modal 只讓最上層處理 Escape，並讓下層 modal 暫時 inert", () => {
    render(<NestedDialogs />);

    const outerTrigger = screen.getByRole("button", { name: "開啟外層" });
    fireEvent.click(outerTrigger);
    const outerDialog = screen.getByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "開啟內層" }));
    const innerDialog = screen.getByRole("alertdialog");

    expect(outerDialog).toHaveAttribute("inert");
    expect(outerDialog).toHaveAttribute("aria-hidden", "true");
    expect(innerDialog).not.toHaveAttribute("inert");
    expect(innerDialog).not.toHaveAttribute("aria-hidden");

    let ancestor: HTMLElement | null = innerDialog;
    while (ancestor) {
      expect(ancestor).not.toHaveAttribute("inert");
      if (ancestor === document.body) break;
      ancestor = ancestor.parentElement;
    }
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(outerDialog).not.toHaveAttribute("inert");
    expect(outerDialog).not.toHaveAttribute("aria-hidden");
    expect(outerTrigger).toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(outerTrigger).not.toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("");
  });

  it("modal 直接 unmount 時仍還原背景屬性與 body overflow", () => {
    const preservedSibling = document.createElement("aside");
    preservedSibling.setAttribute("aria-hidden", "false");
    preservedSibling.setAttribute("inert", "persisted");
    document.body.appendChild(preservedSibling);
    document.body.style.overflow = "scroll";

    const { unmount } = render(<SingleDialog initiallyOpen />);
    expect(preservedSibling).toHaveAttribute("aria-hidden", "true");
    expect(preservedSibling).toHaveAttribute("inert", "");
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(preservedSibling).toHaveAttribute("aria-hidden", "false");
    expect(preservedSibling).toHaveAttribute("inert", "persisted");
    expect(document.body.style.overflow).toBe("scroll");

    preservedSibling.remove();
  });
});
