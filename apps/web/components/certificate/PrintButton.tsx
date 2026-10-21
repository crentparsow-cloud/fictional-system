"use client";

/** Print or save as PDF through the browser. Nothing leaves the device. */
export function PrintButton() {
  return (
    <button type="button" className="btn secondary" onClick={() => window.print()}>
      Print or save as PDF
    </button>
  );
}
