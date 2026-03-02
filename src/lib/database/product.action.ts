import { getDatabase } from "./config";

// ── Types ───────────────────────────────────────────────────────────────────

export type ProductCategory =
  | "lending"
  | "insurance"
  | "investment"
  | "estate"
  | "tax"
  | "retirement"
  | "protection";

export type UrgencyLevel = "low" | "medium" | "high";

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  shortDescription: string;
  fullDescription: string;
  talkingPoint: string;
  eligibilityHints: string[];
  urgencyLevel: UrgencyLevel;
  canadianContext: string;
  isActive: boolean;
}

// ── DB row type ──────────────────────────────────────────────────────────────

interface DbProduct {
  id: string;
  name: string;
  category: string;
  short_description: string;
  full_description: string;
  talking_point: string;
  eligibility_hints: string; // JSON array
  urgency_level: string;
  canadian_context: string;
  is_active: number;
}

function rowToProduct(r: DbProduct): Product {
  return {
    id: r.id,
    name: r.name,
    category: r.category as ProductCategory,
    shortDescription: r.short_description,
    fullDescription: r.full_description,
    talkingPoint: r.talking_point,
    eligibilityHints: JSON.parse(r.eligibility_hints ?? "[]"),
    urgencyLevel: r.urgency_level as UrgencyLevel,
    canadianContext: r.canadian_context,
    isActive: r.is_active === 1,
  };
}

// ── Queries ──────────────────────────────────────────────────────────────────

export async function getActiveProducts(): Promise<Product[]> {
  const db = await getDatabase();
  const rows = await db.select<DbProduct[]>(
    "SELECT * FROM products WHERE is_active = 1 ORDER BY category, name"
  );
  return rows.map(rowToProduct);
}

export async function getAllProducts(): Promise<Product[]> {
  const db = await getDatabase();
  const rows = await db.select<DbProduct[]>(
    "SELECT * FROM products ORDER BY category, name"
  );
  return rows.map(rowToProduct);
}
