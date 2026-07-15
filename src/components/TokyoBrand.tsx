import type { SVGProps } from "react";

type TokyoMarkProps = SVGProps<SVGSVGElement> & {
  decorative?: boolean;
};

/**
 * Lightweight, code-native Tokyo Tower mark. Keeping the brand as SVG makes
 * it crisp on retina phones and avoids another image request in the PWA shell.
 */
export function TokyoMark({ decorative = true, ...props }: TokyoMarkProps) {
  return (
    <svg
      viewBox="0 0 40 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={decorative || undefined}
      role={decorative ? undefined : "img"}
      {...props}
    >
      {!decorative && <title>東京旅程標誌</title>}
      <circle cx="29.5" cy="9.5" r="7.5" fill="currentColor" opacity="0.14" />
      <path d="M20 3.5 8 43.5M20 3.5l12 40M12 31h16M15 21h10M18 11h4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M5 43.5h30M13 43.5l7-9 7 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 7.5h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="20" cy="3.5" r="2.2" fill="currentColor" />
    </svg>
  );
}
