"use client";

/* ----------------------------------------------------------------------------
   Catalog icons.

   The server names an icon per product, bill, gig and task so the catalog data
   owns its own presentation hint. Only the glyphs the catalogues actually use
   are imported here — a dynamic `import * as Phosphor` would pull the whole
   9,000-glyph library into the client bundle to render twenty of them.

   Adding a product with a new `icon` string means adding it here too; the
   fallback keeps a missing entry from crashing a page over a decoration.
   -------------------------------------------------------------------------- */
import {
  AirplaneTilt,
  ArrowDown,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bank,
  Barbell,
  Bicycle,
  Briefcase,
  Camera,
  Car,
  CaretDown,
  CaretRight,
  ChartPieSlice,
  Check,
  CheckCircle,
  Clock,
  ClockCountdown,
  Coffee,
  Coins,
  Copy,
  Couch,
  CreditCard,
  Crown,
  CurrencyInr,
  Desktop,
  DeviceMobile,
  DotsThree,
  DownloadSimple,
  Drop,
  Fire,
  ForkKnife,
  FunnelSimple,
  Gift,
  GraduationCap,
  Handshake,
  Headphones,
  HouseLine,
  Info,
  Keyboard,
  Laptop,
  Lightning,
  LockKey,
  MagnifyingGlass,
  Medal,
  Minus,
  Notebook,
  Package,
  PaintBrush,
  PiggyBank,
  Plus,
  QrCode,
  Receipt,
  Rocket,
  ShareNetwork,
  ShieldCheck,
  ShoppingCart,
  SpeakerHigh,
  SpeakerSlash,
  Sparkle,
  Storefront,
  Television,
  Timer,
  TrendUp,
  Trophy,
  TShirt,
  Warning,
  WarningCircle,
  Wallet,
  Watch,
  WifiHigh,
  Wrench,
  XCircle,
} from "@phosphor-icons/react";

const ICONS = {
  AirplaneTilt,
  ArrowDown,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bank,
  Barbell,
  Bicycle,
  Briefcase,
  Camera,
  Car,
  CaretDown,
  CaretRight,
  ChartPieSlice,
  Check,
  CheckCircle,
  Clock,
  ClockCountdown,
  Coffee,
  Coins,
  Copy,
  Couch,
  CreditCard,
  Crown,
  CurrencyInr,
  Desktop,
  DeviceMobile,
  DotsThree,
  DownloadSimple,
  Drop,
  Fire,
  ForkKnife,
  FunnelSimple,
  Gift,
  GraduationCap,
  Handshake,
  Headphones,
  HouseLine,
  Info,
  Keyboard,
  Laptop,
  Lightning,
  LockKey,
  MagnifyingGlass,
  Medal,
  Minus,
  Notebook,
  Package,
  PaintBrush,
  PiggyBank,
  Plus,
  QrCode,
  Receipt,
  Rocket,
  ShareNetwork,
  ShieldCheck,
  ShoppingCart,
  SpeakerHigh,
  SpeakerSlash,
  Sparkle,
  Storefront,
  Television,
  Timer,
  TrendUp,
  Trophy,
  TShirt,
  Warning,
  WarningCircle,
  Wallet,
  Watch,
  WifiHigh,
  Wrench,
  XCircle,
};

/* One stroke weight for the whole app. Mixing 1.5 and 2.0 across cards is the
   fastest way to make an icon set look assembled rather than designed. */
export const ICON_WEIGHT = "regular";

export function CatalogIcon({ name, size = 20, weight = ICON_WEIGHT, className }) {
  const Glyph = ICONS[name] ?? Receipt;
  return <Glyph size={size} weight={weight} className={className} />;
}

/* Small shared mapping so a ledger row and its receipt never disagree about
   what a `transfer` or a `career` entry looks like. */
const TYPE_ICONS = {
  income: "Bank",
  reward: "Gift",
  expense: "ShoppingCart",
  transfer: "PiggyBank",
  investment: "TrendUp",
  career: "Medal",
};

export const iconForTransaction = (transaction) =>
  transaction?.icon ?? TYPE_ICONS[transaction?.type] ?? "Receipt";

const ACCENT_CLASSES = {
  steel: "bg-surface text-steel",
  ink: "bg-surface text-ink",
  primary: "bg-[color-mix(in_srgb,var(--primary)_14%,white)] text-primary",
  link: "bg-[color-mix(in_srgb,var(--link-blue)_14%,white)] text-link",
  success: "bg-tint-mint text-success",
  mint: "bg-tint-mint text-success",
  sky: "bg-tint-sky text-navy-mid",
  "brand-orange": "bg-[color-mix(in_srgb,var(--brand-orange)_14%,white)] text-[var(--brand-orange)]",
  peach: "bg-[color-mix(in_srgb,var(--brand-orange)_12%,white)] text-[var(--brand-orange-deep)]",
  surface: "bg-surface text-charcoal",
};

export const accentClass = (accent) => ACCENT_CLASSES[accent] ?? ACCENT_CLASSES.steel;

/* Rarity is the one place a colour carries gameplay meaning, so it gets a pill
   rather than an inline tint. */
export const RARITY_PILL = {
  common: "border-hairline text-steel",
  rare: "border-[color-mix(in_srgb,var(--link-blue)_35%,white)] text-link",
  epic: "border-[color-mix(in_srgb,var(--primary)_35%,white)] text-primary",
  legendary: "border-[color-mix(in_srgb,var(--brand-orange)_40%,white)] text-[var(--brand-orange)]",
};
