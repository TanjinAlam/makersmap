"use client";

import { useState } from "react";

// A project's logo, read from its website. If the image can't load (a site that
// redirects its icon, or a dead file), fall back to the letter tile so nothing
// shows as a broken image.
export function ProductLogo({ src, label, color, size }: { src: string; label: string; color?: string; size: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="product-icon" style={{ background: color, width: size, height: size }}>
        {(label[0] || "?").toLowerCase()}
        <span className="product-icon-dot" />
      </span>
    );
  }
  return <img className="product-icon product-logo" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} loading="lazy" onError={() => setFailed(true)} />;
}
