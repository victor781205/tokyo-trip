import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";

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
  it("只讓最上層對話框處理 Escape，並在最後關閉時解除捲動鎖定", () => {
    render(<NestedDialogs />);

    fireEvent.click(screen.getByRole("button", { name: "開啟外層" }));
    fireEvent.click(screen.getByRole("button", { name: "開啟內層" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });
});
