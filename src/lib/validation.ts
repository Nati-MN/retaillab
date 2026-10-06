import { z } from "zod";

/** Shared zod building blocks for server-side validation of form input. */

export const optionalNumber = (opts: { min?: number; max?: number; int?: boolean } = {}) =>
  z.preprocess(
    (v) => (v === undefined || v === null || v === "" ? undefined : typeof v === "string" ? Number(v.replace(",", ".")) : v),
    (() => {
      let n = z.number({ invalid_type_error: "Enter a number" }).finite();
      if (opts.int) n = n.int("Enter a whole number");
      if (opts.min !== undefined) n = n.min(opts.min, `Must be at least ${opts.min}`);
      if (opts.max !== undefined) n = n.max(opts.max, `Must be at most ${opts.max}`);
      return n.optional();
    })(),
  );

export const requiredNumber = (opts: { min?: number; max?: number; int?: boolean } = {}) =>
  z.preprocess(
    (v) => (typeof v === "string" && v !== "" ? Number(v.replace(",", ".")) : v),
    (() => {
      let n = z.number({ required_error: "Required", invalid_type_error: "Enter a number" }).finite();
      if (opts.int) n = n.int("Enter a whole number");
      if (opts.min !== undefined) n = n.min(opts.min, `Must be at least ${opts.min}`);
      if (opts.max !== undefined) n = n.max(opts.max, `Must be at most ${opts.max}`);
      return n;
    })(),
  );

export const monthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const idSchema = z.string().min(1).max(40).regex(/^[a-z0-9]+$/i);
export const text = (max: number, min = 1) => z.string().trim().min(min, min > 0 ? "Required" : undefined).max(max, `At most ${max} characters`);

export const storeSchema = z.object({
  name: text(80),
  code: text(12).regex(/^[A-Za-z0-9_-]+$/, "Letters, digits, - and _ only"),
  address: text(200),
  city: text(80),
  latitude: optionalNumber({ min: -90, max: 90 }),
  longitude: optionalNumber({ min: -180, max: 180 }),
  openingDate: isoDateSchema.optional(),
  areaSqm: optionalNumber({ min: 1, max: 100_000 }),
  employees: optionalNumber({ min: 0, max: 10_000, int: true }),
  parkingSpaces: optionalNumber({ min: 0, max: 100_000, int: true }),
  type: z.enum(["SUPERMARKET", "CONVENIENCE", "DISCOUNT", "SPECIALTY"]),
  opensAt: timeSchema.optional(),
  closesAt: timeSchema.optional(),
  openDaysPerWeek: optionalNumber({ min: 1, max: 7, int: true }),
});
export type StoreInput = z.infer<typeof storeSchema>;

export const monthlyDataSchema = z.object({
  month: monthKeySchema,
  revenue: requiredNumber({ min: 0, max: 1e10 }),
  transactions: optionalNumber({ min: 0, max: 1e8, int: true }),
  customers: optionalNumber({ min: 0, max: 1e8, int: true }),
  grossMarginPct: optionalNumber({ min: -100, max: 100 }),
  openDays: optionalNumber({ min: 0, max: 31, int: true }),
});
export type MonthlyDataInput = z.infer<typeof monthlyDataSchema>;

export const organizationSchema = z.object({
  name: text(100),
  industry: text(80),
  country: text(80),
  currency: z.enum(["EUR", "CHF", "USD", "GBP"]),
});

export const registerSchema = z.object({
  name: text(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  password: z.string().min(10, "Use at least 10 characters").max(200),
});
