/* ----------------------------------------------------------------------------
   Recurring expenses.

  These are optional recurring-expense templates. They are kept separate from
  account creation so a new user can begin with an empty bill list.

  The starter total is deliberately close to an Intern's salary for any future
  flow that offers the templates as a choice.
   -------------------------------------------------------------------------- */

const rupees = (value) => Math.round(value * 100);

export const BILL_CATEGORIES = {
  housing: { label: "Housing", tint: "tint-sky" },
  food: { label: "Food", tint: "tint-mint" },
  utilities: { label: "Utilities", tint: "surface" },
  subscriptions: { label: "Subscriptions", tint: "surface" },
  debt: { label: "Debt", tint: "peach" },
  transport: { label: "Transport", tint: "surface" },
};

export const STARTER_BILLS = [
  {
    key: "rent",
    name: "House rent",
    category: "housing",
    icon: "HouseLine",
    amount: rupees(14_000),
    note: "Due on the 1st of every simulated month.",
  },
  {
    key: "groceries",
    name: "Groceries",
    category: "food",
    icon: "ShoppingCart",
    amount: rupees(7_500),
    note: "The baseline food budget for one person.",
  },
  {
    key: "electricity",
    name: "Electricity",
    category: "utilities",
    icon: "Lightning",
    amount: rupees(2_100),
    note: "Metered on the simulated cycle.",
  },
  {
    key: "broadband",
    name: "Broadband & mobile",
    category: "utilities",
    icon: "WifiHigh",
    amount: rupees(1_599),
    note: "Autopay on. Cancel any time.",
    autopay: true,
  },
  {
    key: "streaming",
    name: "Streaming subscriptions",
    category: "subscriptions",
    icon: "Television",
    amount: rupees(899),
    note: "Three services you keep meaning to drop.",
    autopay: true,
  },
  {
    key: "student-loan",
    name: "Student loan EMI",
    category: "debt",
    icon: "Receipt",
    amount: rupees(3_500),
    note: "Missing this hurts the most. Pay it first.",
  },
];

export const STARTER_BILL_TOTAL = STARTER_BILLS.reduce(
  (sum, bill) => sum + bill.amount,
  0,
);

// Overdue bills are charged a late fee on top of the amount, in whole percent.
export const LATE_FEE_PCT = 4;

// Bills further behind than this stop accruing late fees (being poor in a
// simulation should be recoverable, not a debt spiral).
export const MAX_OVERDUE_CYCLES = 3;
