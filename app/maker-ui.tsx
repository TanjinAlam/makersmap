import type { Maker } from "./profile";
import { ProductLogo } from "./product-logo";

export function Avatar({ maker, size = 44 }: { maker: Pick<Maker, "avatar" | "color" | "initials">; size?: number }) {
  return maker.avatar ? (
    <img className="avatar" src={maker.avatar} alt="" width={size} height={size} draggable={false} style={{ width: size, height: size }} />
  ) : (
    <span className="avatar initials" style={{ width: size, height: size, background: maker.color }}>
      {maker.initials}
    </span>
  );
}

export function ProductIcon({ maker, size = 36, name, color, logo }: { maker: Pick<Maker, "project" | "color">; size?: number; name?: string; color?: string; logo?: string }) {
  const label = name ?? maker.project;
  if (logo) return <ProductLogo src={logo} label={label} color={color ?? maker.color} size={size} />;
  return (
    <span className="product-icon" style={{ background: color ?? maker.color, width: size, height: size }}>
      {(label[0] || "?").toLowerCase()}
      <span className="product-icon-dot" />
    </span>
  );
}
