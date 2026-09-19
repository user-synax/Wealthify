/* ----------------------------------------------------------------------------
   Store catalog.

   This is the price authority. The client sends a `sku`, never a price, so a
   tampered request can only ever buy a real product at the server's price
   (PRD section 9). Prices are integer paise.

   `effects.rewardBonusPct` feeds back into income: owned gear raises the
   reward on gigs, which is how a store purchase changes gameplay rather than
   just draining the wallet. `addsBill` is the other half of the consequence:
   a vehicle or a gaming rig creates a recurring upkeep the simulator will
   keep charging for, so a big purchase is a decision and not a one-off.
   -------------------------------------------------------------------------- */

const rupees = (value) => Math.round(value * 100);

export const PRODUCT_CATEGORIES = [
  { id: "all", label: "Everything" },
  { id: "essentials", label: "Essentials" },
  { id: "food", label: "Food & home" },
  { id: "tech", label: "Tech" },
  { id: "transport", label: "Transport" },
  { id: "lifestyle", label: "Lifestyle" },
  { id: "luxury", label: "Luxury" },
];

export const RARITIES = {
  common: { label: "Common", accent: "steel" },
  rare: { label: "Rare", accent: "link" },
  epic: { label: "Epic", accent: "primary" },
  legendary: { label: "Legendary", accent: "brand-orange" },
};

export const PRODUCTS = [
  // --- Essentials -----------------------------------------------------------
  {
    sku: "grocery-run",
    name: "Grocery run",
    category: "essentials",
    price: rupees(1_850),
    icon: "ShoppingCart",
    rarity: "common",
    blurb: "A full week of staples from the neighbourhood store.",
    daily: true,
  },
  {
    sku: "cookware-set",
    name: "Cookware set",
    category: "essentials",
    price: rupees(3_400),
    icon: "ForkKnife",
    rarity: "common",
    blurb: "Non-stick pans and a pressure cooker. Cutting delivery orders.",
    effects: { rewardBonusPct: 1 },
  },
  {
    sku: "water-purifier",
    name: "Water purifier",
    category: "essentials",
    price: rupees(8_900),
    icon: "Drop",
    rarity: "common",
    blurb: "Replaces the monthly bottled-water bill.",
    addsBill: null,
  },

  // --- Food & home ----------------------------------------------------------
  {
    sku: "restaurant-dinner",
    name: "Restaurant dinner",
    category: "food",
    price: rupees(2_600),
    icon: "ForkKnife",
    rarity: "common",
    blurb: "Table for two. Worth it, occasionally.",
    daily: true,
  },
  {
    sku: "coffee-machine",
    name: "Espresso machine",
    category: "food",
    price: rupees(6_500),
    icon: "Coffee",
    rarity: "rare",
    blurb: "Pays for itself in about four months of cafe runs.",
    effects: { rewardBonusPct: 2 },
  },
  {
    sku: "food-hamper",
    name: "Monthly food hamper",
    category: "food",
    price: rupees(4_200),
    icon: "Package",
    rarity: "common",
    blurb: "Bulk staples, one delivery, less per-unit cost.",
    effects: { rewardBonusPct: 2 },
  },

  // --- Tech -----------------------------------------------------------------
  {
    sku: "mech-keyboard",
    name: "Mechanical keyboard",
    category: "tech",
    price: rupees(7_500),
    icon: "Keyboard",
    rarity: "common",
    blurb: "Types faster. Freelance briefs come back quicker.",
    effects: { rewardBonusPct: 3 },
  },
  {
    sku: "anc-headphones",
    name: "Noise-cancelling headphones",
    category: "tech",
    price: rupees(18_000),
    icon: "Headphones",
    rarity: "rare",
    blurb: "Deep-work hours without the canteen noise.",
    effects: { rewardBonusPct: 4 },
  },
  {
    sku: "smartphone",
    name: "Smartphone",
    category: "tech",
    price: rupees(45_000),
    icon: "DeviceMobile",
    rarity: "rare",
    blurb: "Gigs arrive on time instead of after the deadline.",
    effects: { rewardBonusPct: 5 },
  },
  {
    sku: "laptop",
    name: "Developer laptop",
    category: "tech",
    price: rupees(72_000),
    icon: "Laptop",
    rarity: "epic",
    blurb: "Serious rig for serious freelance rates.",
    effects: { rewardBonusPct: 8 },
  },
  {
    sku: "gaming-pc",
    name: "Gaming PC",
    category: "tech",
    price: rupees(95_000),
    icon: "Desktop",
    rarity: "epic",
    blurb: "Streaming income, at the cost of a monthly cloud bill.",
    effects: { rewardBonusPct: 10 },
    addsBill: {
      key: "cloud-gaming",
      name: "Cloud gaming subscriptions",
      category: "subscriptions",
      amount: rupees(1_800),
      icon: "Television",
    },
  },

  // --- Transport ------------------------------------------------------------
  {
    sku: "bicycle",
    name: "Commuter bicycle",
    category: "transport",
    price: rupees(12_000),
    icon: "Bicycle",
    rarity: "common",
    blurb: "Delivery runs stop eating into your transport budget.",
    effects: { rewardBonusPct: 3 },
  },
  {
    sku: "scooter",
    name: "Electric scooter",
    category: "transport",
    price: rupees(85_000),
    icon: "Scooter",
    rarity: "epic",
    blurb: "Doubles how many delivery runs fit in an evening.",
    effects: { rewardBonusPct: 7 },
    addsBill: {
      key: "vehicle-upkeep",
      name: "Vehicle upkeep",
      category: "transport",
      amount: rupees(1_800),
      icon: "Wrench",
    },
  },
  {
    sku: "used-hatchback",
    name: "Used hatchback",
    category: "transport",
    price: rupees(320_000),
    icon: "Car",
    rarity: "epic",
    blurb: "Freedom, plus a service bill every cycle.",
    effects: { rewardBonusPct: 9 },
    addsBill: {
      key: "vehicle-upkeep",
      name: "Vehicle upkeep",
      category: "transport",
      amount: rupees(4_800),
      icon: "Wrench",
    },
  },
  {
    sku: "sports-car",
    name: "Sports car",
    category: "luxury",
    price: rupees(3_200_000),
    icon: "Car",
    rarity: "legendary",
    blurb: "Insurance, tyres and fuel, every single month.",
    effects: { rewardBonusPct: 12 },
    addsBill: {
      key: "luxury-upkeep",
      name: "Luxury car upkeep",
      category: "transport",
      amount: rupees(22_000),
      icon: "Wrench",
    },
  },

  // --- Lifestyle ------------------------------------------------------------
  {
    sku: "gym-annual",
    name: "Annual gym membership",
    category: "lifestyle",
    price: rupees(14_000),
    icon: "Barbell",
    rarity: "common",
    blurb: "The kind of purchase that raises every other number.",
    effects: { rewardBonusPct: 4 },
  },
  {
    sku: "streaming-annual",
    name: "Streaming bundle (annual)",
    category: "lifestyle",
    price: rupees(3_000),
    icon: "Television",
    rarity: "common",
    blurb: "One payment instead of twelve monthly ones.",
    effects: { rewardBonusPct: 1 },
  },
  {
    sku: "camera-kit",
    name: "Camera kit",
    category: "lifestyle",
    price: rupees(68_000),
    icon: "Camera",
    rarity: "epic",
    blurb: "Unlocks the higher-paid creative gigs.",
    effects: { rewardBonusPct: 8 },
  },
  {
    sku: "wardrobe",
    name: "Designer wardrobe",
    category: "lifestyle",
    price: rupees(26_000),
    icon: "TShirt",
    rarity: "rare",
    blurb: "Clients take the meeting more seriously.",
    effects: { rewardBonusPct: 4 },
  },
  {
    sku: "sectional-sofa",
    name: "Sectional sofa",
    category: "lifestyle",
    price: rupees(120_000),
    icon: "Couch",
    rarity: "epic",
    blurb: "The flat finally looks like somewhere you live.",
    effects: { rewardBonusPct: 2 },
  },

  // --- Luxury ---------------------------------------------------------------
  {
    sku: "vacation-goa",
    name: "Week in Goa",
    category: "luxury",
    price: rupees(210_000),
    icon: "AirplaneTilt",
    rarity: "epic",
    blurb: "A full reset. No reward bonus, just the memory.",
    effects: {},
  },
  {
    sku: "luxury-watch",
    name: "Swiss watch",
    category: "luxury",
    price: rupees(480_000),
    icon: "Watch",
    rarity: "legendary",
    blurb: "An asset that happens to tell the time.",
    effects: { rewardBonusPct: 3 },
  },
];

export const PRODUCTS_BY_SKU = new Map(PRODUCTS.map((p) => [p.sku, p]));

// Catalog rows the UI can render without leaking internals. New products are
// added automatically because the UI reads this list rather than hardcoding.
export function publicCatalog() {
  return PRODUCTS.map((p) => ({
    sku: p.sku,
    name: p.name,
    category: p.category,
    price: p.price,
    icon: p.icon,
    rarity: p.rarity,
    blurb: p.blurb,
    // Repeatable purchases are the only rows the UI offers a quantity stepper
    // for; a second sofa is not a product decision.
    daily: Boolean(p.daily),
    effects: p.effects ?? {},
    addsBill: p.addsBill
      ? { name: p.addsBill.name, amount: p.addsBill.amount, category: p.addsBill.category }
      : null,
  }));
}

/* Combined reward bonus from everything the user owns. Capped so a complete
   collection cannot multiply gig income without limit. */
export const MAX_REWARD_BONUS_PCT = 40;

export function rewardBonusPct(skus) {
  let total = 0;
  for (const sku of skus) {
    const product = PRODUCTS_BY_SKU.get(sku);
    total += product?.effects?.rewardBonusPct ?? 0;
  }
  return Math.min(total, MAX_REWARD_BONUS_PCT);
}
