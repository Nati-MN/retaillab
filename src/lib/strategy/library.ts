import type { ScenarioKindKey, StrategyCategoryKey } from "./rules";

/**
 * Static strategy library. Entries describe things retailers commonly TEST —
 * none of them is a recommendation and none is a guaranteed improvement.
 * Benefits are worded as possibilities; costs name cost TYPES, never amounts.
 */

export const STRATEGY_CATEGORIES: StrategyCategoryKey[] = [
  "PRICING", "ASSORTMENT", "STORE_LAYOUT", "OPENING_HOURS", "STAFFING", "MARKETING", "CUSTOMER_RETENTION",
  "CHECKOUT", "INVENTORY", "FOOD_WASTE", "LOCAL_MARKETING", "CONVENIENCE", "SEASONAL", "MERCHANDISING",
];

export const CATEGORY_LABELS: Record<StrategyCategoryKey, string> = {
  PRICING: "Pricing",
  ASSORTMENT: "Assortment",
  STORE_LAYOUT: "Store Layout",
  OPENING_HOURS: "Opening Hours",
  STAFFING: "Staffing",
  MARKETING: "Marketing",
  CUSTOMER_RETENTION: "Customer Retention",
  CHECKOUT: "Checkout",
  INVENTORY: "Inventory",
  FOOD_WASTE: "Food Waste",
  LOCAL_MARKETING: "Local Marketing",
  CONVENIENCE: "Convenience",
  SEASONAL: "Seasonal",
  MERCHANDISING: "Merchandising",
};

export type LibrarySimulator =
  | { kind: Extract<ScenarioKindKey, "OPENING_HOURS" | "TRANSACTION_UPLIFT" | "COST_REDUCTION">; note: string }
  | { kind: "BREAK_EVEN"; note: string }
  | { kind: "REVENUE_OPPORTUNITY"; note: string };

export interface LibraryEntry {
  key: string;
  title: string;
  category: StrategyCategoryKey;
  /** What it is. */
  what: string;
  /** Why retailers test it. */
  whyTested: string;
  dataRequired: string[];
  possibleCosts: string[];
  /** Worded as possibilities. */
  possibleBenefits: string[];
  risks: string[];
  metrics: string[];
  simulator: LibrarySimulator;
  /** Starting points for a user-authored hypothesis. The user must adapt them. */
  hypothesisTemplate: string;
  testTemplate: string;
}

export const STRATEGY_LIBRARY: LibraryEntry[] = [
  {
    key: "expand-lunch-assortment",
    title: "Expand the lunch assortment",
    category: "CONVENIENCE",
    what: "Add or widen ready-to-eat lunch options (sandwiches, salads, warm dishes, drinks) for a limited test period.",
    whyTested: "Stores near workplaces or schools sometimes see a smaller share of midday transactions than comparable stores. A lunch offer is one way to test whether unmet midday demand exists.",
    dataRequired: ["Hourly transactions (11:00–14:00 share)", "Ready-to-eat category revenue and margin", "Waste value for fresh categories", "Nearby workplaces or schools, with a source"],
    possibleCosts: ["Fixtures or a chilled unit", "Additional preparation or replenishment labor", "Waste from unsold fresh products", "Supplier minimum orders"],
    possibleBenefits: ["May attract additional midday transactions", "Could raise ready-to-eat revenue (check the category's recorded margin before assuming it is profitable)", "May increase visit frequency of nearby workers"],
    risks: ["Fresh products that do not sell become waste", "Lunch customers may buy little else, lowering the average basket", "Nearby food outlets may already cover the demand", "Peak-time queues can deter other shoppers"],
    metrics: ["Transactions 11:00–14:00", "Ready-to-eat revenue", "Average basket", "Waste value", "Gross margin", "Labor hours"],
    simulator: { kind: "TRANSACTION_UPLIFT", note: "Additional lunchtime transactions × lunch basket × margin, against fixture and running costs." },
    hypothesisTemplate: "A broader ready-to-eat lunch offering could potentially attract additional midday customers at this store.",
    testTemplate: "Add a limited set of lunch products for six weeks. Compare 11:00–14:00 transactions, ready-to-eat revenue and waste with the six weeks before and with a control store.",
  },
  {
    key: "change-opening-hours",
    title: "Change opening hours",
    category: "OPENING_HOURS",
    what: "Open earlier, close later, or shorten hours on selected days for a defined test period.",
    whyTested: "A busy first or last opening hour may indicate demand outside current hours; a quiet one may not cover its labor cost. Only a test shows whether customers come in addition or merely shift their visit.",
    dataRequired: ["Hourly transactions", "Hourly employee cost and staffing rules", "Average basket and gross margin", "Legal opening-hour limits for the location"],
    possibleCosts: ["Additional labor hours", "Energy, security and cleaning", "Shift premiums", "Communication of the new hours"],
    possibleBenefits: ["May capture transactions that currently go elsewhere", "Could spread peak load across more hours", "A shorter schedule could lower labor cost if little revenue is lost"],
    risks: ["Customers may shift existing visits rather than add new ones", "Labor cost is certain, additional revenue is not", "Staff availability and satisfaction", "Regulatory restrictions"],
    metrics: ["Transactions in the changed hour", "Transactions in adjacent hours", "Total daily transactions", "Labor cost", "Average basket"],
    simulator: { kind: "OPENING_HOURS", note: "Labor cost of the extra hours against the gross profit of the customers you assume would come, with break-even customers." },
    hypothesisTemplate: "Demand may continue beyond the current closing time; one additional opening hour could potentially capture some of it.",
    testTemplate: "Extend opening by one hour on all open days for six weeks. Track transactions in the added hour and in the two hours before, and compare total daily transactions with a control store.",
  },
  {
    key: "cross-selling",
    title: "Cross-selling placements",
    category: "MERCHANDISING",
    what: "Place complementary products next to each other (pasta and sauce, cheese and wine, salad and dressing) or at secondary placements.",
    whyTested: "A lower average basket than comparable stores can have many causes. Cross-selling placements are a low-cost way to test whether customers add an item when it is in view.",
    dataRequired: ["Average basket and items per transaction", "Category revenue", "Gross margin by category", "Which products are bought together (if basket data exists)"],
    possibleCosts: ["Secondary display fixtures", "Staff time for re-merchandising", "Signage"],
    possibleBenefits: ["May increase items per transaction", "Could raise the average basket without additional traffic", "May shift mix towards higher-margin products"],
    risks: ["Sales may only move from the home shelf to the secondary placement", "Cluttered aisles", "Effect may fade once the novelty passes"],
    metrics: ["Average basket", "Items per transaction", "Revenue of the paired categories", "Gross margin"],
    simulator: { kind: "REVENUE_OPPORTUNITY", note: "Basket change at unchanged traffic shows what a given basket increase would be worth." },
    hypothesisTemplate: "Placing complementary products together could potentially increase the number of items per transaction.",
    testTemplate: "Set up three cross-selling placements for six weeks. Compare average basket and revenue of the paired categories with the prior six weeks and with a control store.",
  },
  {
    key: "local-promotions",
    title: "Local promotions",
    category: "LOCAL_MARKETING",
    what: "Time-limited offers or coupons aimed at the store's immediate catchment (door drops, local posters, neighbourhood channels).",
    whyTested: "When a store's transactions decline — for instance after a competitor opens nearby — a local campaign is a way to test whether lapsed customers can be brought back.",
    dataRequired: ["Transactions per day over time", "Revenue vs the same months last year", "Known local events and competitor openings, with sources", "Coupon redemption counts"],
    possibleCosts: ["Printing and distribution", "Discount value given away", "Staff time for handling coupons"],
    possibleBenefits: ["May bring back some lapsed transactions", "Could make new residents aware of the store", "Coupon redemptions give a direct measure of response"],
    risks: ["Discounts may mostly go to customers who would have come anyway", "Effect may end when the promotion ends", "Margin dilution", "A decline can have causes a promotion does not address"],
    metrics: ["Transactions per day", "Coupon redemptions", "Average basket", "Gross margin", "Transactions four weeks after the campaign"],
    simulator: { kind: "TRANSACTION_UPLIFT", note: "Additional transactions per day against the monthly campaign cost." },
    hypothesisTemplate: "A local promotion could potentially win back some of the transactions this store lost.",
    testTemplate: "Run a four-week local coupon campaign. Count redemptions and compare transactions per day during and four weeks after the campaign with the four weeks before.",
  },
  {
    key: "markdown-routine",
    title: "Fixed markdown routine",
    category: "FOOD_WASTE",
    what: "A fixed daily time at which short-dated fresh products are marked down, instead of ad-hoc reductions or write-offs.",
    whyTested: "Waste is a cost line store teams can influence directly. A routine makes markdowns predictable and lets you measure whether write-offs fall.",
    dataRequired: ["Waste value by category", "Waste as % of revenue vs comparable stores", "Category gross margin", "Markdown revenue (if recorded)"],
    possibleCosts: ["Labels and label printer", "Staff time at the markdown hour", "Lower margin on marked-down items"],
    possibleBenefits: ["May reduce write-offs", "Could recover part of the cost of products that would otherwise be discarded", "May attract price-sensitive shoppers at a quiet hour"],
    risks: ["Customers may learn to wait for markdowns", "Margin dilution in fresh categories", "Staff time at a busy time of day", "Higher waste can be the price of a fresher assortment — and intentional"],
    metrics: ["Waste value", "Waste % of revenue", "Category gross margin", "Full-price sell-through", "Markdown revenue"],
    simulator: { kind: "COST_REDUCTION", note: "Share of the monthly waste cost avoided, net of handling cost." },
    hypothesisTemplate: "A fixed daily markdown routine for short-dated fresh products could potentially reduce write-offs.",
    testTemplate: "Introduce a fixed markdown time for selected fresh categories for six weeks. Compare waste value and category margin with the prior six weeks.",
  },
  {
    key: "bakery-positioning",
    title: "Bakery positioning",
    category: "STORE_LAYOUT",
    what: "Move the bakery, or a selection of bakery products, to a more visible position such as near the entrance or on the main aisle.",
    whyTested: "If bakery's revenue share is lower than in comparable stores while its recorded margin is above the store average, visibility is one possible reason among several.",
    dataRequired: ["Bakery revenue share vs comparable stores", "Bakery gross margin", "Bakery waste", "Store floor plan"],
    possibleCosts: ["Fixtures or a bake-off unit move", "Electrical or ventilation work", "Higher waste from larger displays", "Lost space for the displaced category"],
    possibleBenefits: ["May increase how often bakery is added to a basket", "Could improve the first impression of freshness", "May raise category margin contribution"],
    risks: ["The displaced category may lose sales", "More exposure of fresh products can raise waste", "Share differences may reflect local demand or a nearby bakery, not placement"],
    metrics: ["Bakery revenue", "Total revenue", "Transactions", "Basket size", "Bakery waste", "Gross margin"],
    simulator: { kind: "TRANSACTION_UPLIFT", note: "Share of daily transactions that add one bakery item, against the fixture cost." },
    hypothesisTemplate: "Giving bakery a more visible position could potentially increase how often it is added to a basket.",
    testTemplate: "Move selected bakery products near the entrance for six weeks. Compare bakery revenue and waste with the six weeks before and with a control store.",
  },
  {
    key: "improve-product-visibility",
    title: "Improve product visibility",
    category: "STORE_LAYOUT",
    what: "Give an under-indexed category better shelf position, more facings, clearer signage or an end-cap.",
    whyTested: "A category with a lower revenue share than in comparable stores may be under-exposed. It may equally reflect local demand — a test separates the two.",
    dataRequired: ["Category revenue share vs comparable stores", "Category margin", "Shelf space by category (if recorded)", "Stockout rate"],
    possibleCosts: ["Signage and shelf strips", "Staff time for re-merchandising", "Space taken from another category"],
    possibleBenefits: ["May increase category sales", "Could shift mix towards a higher-margin category", "May make the store easier to shop"],
    risks: ["The category that gives up space may lose sales", "No effect if demand, not visibility, is the constraint", "Short-lived novelty effect"],
    metrics: ["Category revenue", "Category share of revenue", "Total revenue", "Gross margin", "Revenue of the displaced category"],
    simulator: { kind: "TRANSACTION_UPLIFT", note: "Share of daily transactions that add one item from the category." },
    hypothesisTemplate: "Giving this category a more visible position could potentially increase how often it is purchased.",
    testTemplate: "Give the category an end-cap and eye-level facings for six weeks. Compare category revenue and the displaced category's revenue with the six weeks before.",
  },
  {
    key: "product-bundles",
    title: "Test product bundles",
    category: "PRICING",
    what: "Offer fixed bundles (meal deal, breakfast set, 'dinner for two') at a combined price for a limited period.",
    whyTested: "Bundles are a way to test whether customers buy an additional item when the combination is made easy and visibly priced.",
    dataRequired: ["Item-level prices and margins", "Average basket and items per transaction", "Revenue of the bundled products before the test"],
    possibleCosts: ["Discount given on the bundle", "Signage and till configuration", "Staff time"],
    possibleBenefits: ["May increase items per transaction", "Could lift the average basket", "May make price perception more favourable"],
    risks: ["Customers who would have bought all items anyway now pay less", "Bundle margin can be lower than the single-item margin", "Till and label errors"],
    metrics: ["Bundle units sold", "Average basket", "Items per transaction", "Gross margin of bundled products", "Single-item sales of the same products"],
    simulator: { kind: "REVENUE_OPPORTUNITY", note: "Model the basket change together with a margin change in points." },
    hypothesisTemplate: "A lunch or dinner bundle could potentially increase items per transaction.",
    testTemplate: "Offer one bundle for four weeks. Compare bundle units, single-item sales of the same products and their combined gross profit with the four weeks before.",
  },
  {
    key: "price-ladder-test",
    title: "Price-ladder test",
    category: "PRICING",
    what: "Review the entry / mid / premium price points in one category and test a changed ladder (for example adding an entry-price item).",
    whyTested: "The spread of price points may influence which item customers choose. A controlled test in a single category shows how mix and margin respond in your store.",
    dataRequired: ["Item-level prices, units and margins in the category", "Category revenue and margin before the test", "Competitor shelf prices, with a source and date"],
    possibleCosts: ["Margin given up on repriced items", "Relabelling", "Listing a new item"],
    possibleBenefits: ["May improve price perception", "Could shift mix towards items with a higher unit margin", "May increase category units"],
    risks: ["Customers may trade down, lowering category margin", "Price changes are noticed and hard to reverse", "Results from one category do not transfer automatically"],
    metrics: ["Category units", "Category revenue", "Category gross margin", "Mix by price tier"],
    simulator: { kind: "REVENUE_OPPORTUNITY", note: "Model the basket change and the margin change in points together." },
    hypothesisTemplate: "A changed price ladder in this category could potentially shift mix and category margin.",
    testTemplate: "Change the price ladder in one category for six weeks in one store. Compare units, revenue and gross margin by price tier with a control store.",
  },
  {
    key: "assortment-review",
    title: "Assortment review: slow sellers vs local products",
    category: "ASSORTMENT",
    what: "Replace the slowest-selling items of a category with a small range of local or regional products for a test period.",
    whyTested: "Shelf space is limited. Testing a swap shows whether the space earns more with different products, without committing to a full range change.",
    dataRequired: ["Item-level units and revenue", "Category margin", "Shelf space by category", "Supplier terms for the new items"],
    possibleCosts: ["Clearance of delisted items", "Listing and onboarding of new suppliers", "Higher purchase prices"],
    possibleBenefits: ["May raise revenue per shelf metre", "Could differentiate the store from discount competitors", "May improve margin if the new items carry more"],
    risks: ["Regular buyers of delisted items may be lost", "Small suppliers may not deliver reliably", "Higher waste for unfamiliar products"],
    metrics: ["Category revenue", "Revenue per m² of category space", "Category gross margin", "Waste value", "Stockout rate"],
    simulator: { kind: "TRANSACTION_UPLIFT", note: "Additional purchases per day × item value × margin, against one-off listing cost." },
    hypothesisTemplate: "Replacing the slowest sellers in this category with local products could potentially raise revenue from the same shelf space.",
    testTemplate: "Swap the ten slowest sellers of one category for local products for eight weeks. Compare category revenue, margin and waste with the eight weeks before.",
  },
  {
    key: "reduce-stockouts",
    title: "Reduce stockouts",
    category: "INVENTORY",
    what: "Tighten ordering and shelf-replenishment routines for the items and times of day with the most out-of-stocks.",
    whyTested: "A product that is not on the shelf cannot be sold. Where stockout rates are recorded and high, a replenishment test shows how much revenue returns.",
    dataRequired: ["Stockout rate by category", "Category revenue by month", "Delivery schedule", "Waste value (to watch over-ordering)"],
    possibleCosts: ["Additional replenishment labor", "Higher stock levels", "More waste if fresh products are over-ordered"],
    possibleBenefits: ["May recover sales that are currently lost", "Could improve customer satisfaction", "May reduce substitution to lower-margin items"],
    risks: ["Over-ordering raises waste and tied-up capital", "Stockouts may be caused upstream by suppliers", "Recorded stockout rates may be incomplete"],
    metrics: ["Stockout rate", "Category revenue", "Waste value", "Stock on hand"],
    simulator: { kind: "TRANSACTION_UPLIFT", note: "Recovered purchases per day × item value × margin, against additional labor." },
    hypothesisTemplate: "Fewer out-of-stocks in this category could potentially recover sales that are currently lost.",
    testTemplate: "Add a fixed afternoon replenishment round for the affected category for six weeks. Compare stockout rate, category revenue and waste with the six weeks before.",
  },
  {
    key: "optimize-staff-schedules",
    title: "Optimize staff schedules",
    category: "STAFFING",
    what: "Align staffing levels by hour with the recorded hourly transaction profile.",
    whyTested: "Staffing that does not follow the demand curve means idle hours at some times and queues at others. A schedule test shows whether hours can move without harming service.",
    dataRequired: ["Hourly transactions", "Rostered hours by hour of day", "Personnel cost", "Queue or service complaints (if recorded)"],
    possibleCosts: ["Scheduling effort", "Possible premiums for changed shifts", "Training for multi-skilled roles"],
    possibleBenefits: ["May reduce paid hours at quiet times", "Could shorten queues at peaks", "May improve shelf availability if replenishment is timed better"],
    risks: ["Staff dissatisfaction with changed shifts", "Under-staffing harms service and sales", "Labor agreements may limit flexibility"],
    metrics: ["Personnel cost", "Personnel cost % of revenue", "Transactions per labor hour", "Queue length at peak", "Revenue"],
    simulator: { kind: "COST_REDUCTION", note: "Share of monthly personnel cost avoided, net of any cost of the change." },
    hypothesisTemplate: "Aligning rostered hours with the hourly transaction profile could potentially lower personnel cost without reducing service.",
    testTemplate: "Shift rostered hours from the two quietest to the two busiest hours for six weeks. Compare personnel cost, peak queue length and revenue with the six weeks before.",
  },
  {
    key: "improve-checkout-speed",
    title: "Improve checkout speed",
    category: "CHECKOUT",
    what: "Open an additional till at peak times, add an express lane, or introduce self-checkout.",
    whyTested: "Queues at peak hours may cause some customers to abandon or avoid the store. Whether faster checkout brings additional transactions has to be measured.",
    dataRequired: ["Hourly transactions", "Tills open by hour", "Queue observations at peak", "Investment and maintenance quotes for equipment"],
    possibleCosts: ["Additional cashier hours", "Self-checkout hardware, installation and maintenance", "Shrinkage at self-checkout", "Staff supervision"],
    possibleBenefits: ["May reduce abandoned baskets at peak", "Could raise peak-hour transaction capacity", "May free staff for replenishment"],
    risks: ["Investment may not be recovered if queues were not limiting sales", "Higher shrinkage", "Some customers dislike self-checkout"],
    metrics: ["Peak-hour transactions", "Queue length", "Transactions per till hour", "Shrinkage", "Personnel cost"],
    simulator: { kind: "BREAK_EVEN", note: "Additional transactions needed to recover the equipment investment (preset: Self-checkout)." },
    hypothesisTemplate: "Faster checkout at peak times could potentially reduce abandoned visits.",
    testTemplate: "Open one additional till from 17:00 to 19:00 for four weeks. Compare peak-hour transactions and observed queue length with the four weeks before.",
  },
  {
    key: "seasonal-displays",
    title: "Seasonal displays",
    category: "SEASONAL",
    what: "Dedicated, time-limited displays for seasonal occasions (barbecue, back to school, Advent, Easter).",
    whyTested: "Monthly revenue shows seasonal patterns. A display test shows whether making the occasion visible changes category sales in that period compared with the same period a year earlier.",
    dataRequired: ["Monthly revenue for at least 12–24 months", "Category revenue in the same season last year", "Known events calendar"],
    possibleCosts: ["Display material", "Seasonal stock and leftover stock afterwards", "Staff time"],
    possibleBenefits: ["May increase seasonal category sales", "Could raise the average basket in the season", "May strengthen the store's local relevance"],
    risks: ["Unsold seasonal stock must be marked down", "Year-over-year comparisons are affected by weather and calendar shifts", "Space taken from regular lines"],
    metrics: ["Seasonal category revenue vs same period last year", "Average basket", "Leftover stock / markdown value", "Gross margin"],
    simulator: { kind: "TRANSACTION_UPLIFT", note: "Additional purchases per day during the season × item value × margin, against display cost." },
    hypothesisTemplate: "A dedicated seasonal display could potentially increase seasonal category sales in this period.",
    testTemplate: "Set up one seasonal display for the length of the season. Compare seasonal category revenue with the same weeks last year and with a store without the display.",
  },
  {
    key: "loyalty-campaign",
    title: "Loyalty campaign",
    category: "CUSTOMER_RETENTION",
    what: "A time-limited stamp card or points campaign that rewards repeat visits.",
    whyTested: "If customers per day stagnate, a loyalty mechanic is a way to test whether visit frequency of existing customers can be raised.",
    dataRequired: ["Customers and transactions per day", "Average basket", "Gross margin", "Redemption counts"],
    possibleCosts: ["Reward cost", "Printing or app fees", "Staff time at the till"],
    possibleBenefits: ["May increase visit frequency", "Could raise share of wallet among regular customers", "Redemption data shows how many customers engage"],
    risks: ["Rewards may go to customers who would have come anyway", "Frequency may fall back after the campaign", "Margin dilution"],
    metrics: ["Customers per day", "Transactions per day", "Redemptions", "Average basket", "Gross margin", "Transactions four weeks after the campaign"],
    simulator: { kind: "REVENUE_OPPORTUNITY", note: "Traffic change with a margin change in points for the reward cost." },
    hypothesisTemplate: "A stamp-card campaign could potentially increase the visit frequency of regular customers.",
    testTemplate: "Run an eight-week stamp card. Compare transactions per day during and four weeks after the campaign with the eight weeks before and with a control store.",
  },
  {
    key: "entrance-displays",
    title: "Entrance displays",
    category: "MERCHANDISING",
    what: "Use the first metres after the entrance for a rotating display of fresh, seasonal or promotional products.",
    whyTested: "Every customer passes the entrance zone. A rotating display tests which products gain when seen first.",
    dataRequired: ["Revenue of the displayed products before the test", "Total transactions", "Waste value for fresh products"],
    possibleCosts: ["Display fixtures", "Staff time for weekly rotation", "Waste from fresh displays"],
    possibleBenefits: ["May increase sales of the displayed products", "Could improve freshness perception", "May raise the average basket"],
    risks: ["Sales may only move from the home shelf", "Congestion at the entrance", "Higher waste"],
    metrics: ["Revenue of displayed products", "Home-shelf revenue of the same products", "Average basket", "Waste value"],
    simulator: { kind: "TRANSACTION_UPLIFT", note: "Share of daily transactions that add one displayed item, against fixture cost." },
    hypothesisTemplate: "An entrance display could potentially increase sales of the displayed products.",
    testTemplate: "Rotate one entrance display weekly for six weeks. Compare total (display + home shelf) revenue of the displayed products with the six weeks before.",
  },
  {
    key: "ready-to-eat-section",
    title: "Ready-to-eat section",
    category: "CONVENIENCE",
    what: "A dedicated chilled or warm section for meals that can be eaten immediately, typically near the entrance or the tills.",
    whyTested: "Convenience demand depends strongly on location. A dedicated section is a larger step than a lunch range and is usually tested with a temporary set-up first.",
    dataRequired: ["Ready-to-eat revenue and margin", "Hourly transactions", "Waste value", "Quotes for equipment", "Footfall-relevant location signals, with sources"],
    possibleCosts: ["Refrigeration or warming equipment", "Energy", "Preparation labor", "Waste", "Food-safety compliance"],
    possibleBenefits: ["May attract additional convenience-driven visits", "Could raise ready-to-eat revenue (its margin must come from your own data)", "May extend the store's relevance to new times of day"],
    risks: ["High waste if demand is lower than assumed", "Investment may not be recovered", "Food-safety obligations", "Lower basket from convenience-only visits"],
    metrics: ["Ready-to-eat revenue", "Transactions by hour", "Waste value", "Gross margin", "Energy cost"],
    simulator: { kind: "BREAK_EVEN", note: "Additional transactions needed to recover the equipment investment (preset: New refrigerator)." },
    hypothesisTemplate: "A dedicated ready-to-eat section could potentially attract additional convenience-driven visits.",
    testTemplate: "Set up a temporary ready-to-eat section for eight weeks. Compare ready-to-eat revenue, transactions by hour and waste with the eight weeks before and with a control store.",
  },
  {
    key: "leaflet-campaign",
    title: "Leaflet or digital campaign",
    category: "MARKETING",
    what: "A broader advertising push (weekly leaflet, social media, local radio) across several stores.",
    whyTested: "Marketing spend is easy to measure; its effect is not. Running a campaign in some stores and not in others gives a comparison instead of an assumption.",
    dataRequired: ["Marketing cost by month", "Transactions and revenue by store", "Which stores were in the campaign area"],
    possibleCosts: ["Creative, print and distribution", "Media spend", "Promotional discounts"],
    possibleBenefits: ["May increase transactions in the campaign period", "Could raise awareness among non-customers", "May support a specific category or season"],
    risks: ["Effect is hard to separate from seasonality without control stores", "Sales may be pulled forward rather than added", "Margin dilution on promoted items"],
    metrics: ["Transactions per day in campaign vs control stores", "Revenue", "Gross margin", "Marketing cost % of revenue"],
    simulator: { kind: "BREAK_EVEN", note: "Additional transactions needed to recover the campaign cost (preset: Advertising campaign)." },
    hypothesisTemplate: "A campaign in this store's area could potentially increase transactions during the campaign period.",
    testTemplate: "Run the campaign in two stores and not in two comparable stores for four weeks. Compare the change in transactions per day between the two groups.",
  },
];

export function getLibraryEntry(key: string | null | undefined): LibraryEntry | null {
  if (!key) return null;
  return STRATEGY_LIBRARY.find((e) => e.key === key) ?? null;
}

export function libraryByCategory(category?: StrategyCategoryKey | null): LibraryEntry[] {
  return category ? STRATEGY_LIBRARY.filter((e) => e.category === category) : STRATEGY_LIBRARY;
}

/** Where the "Open simulator" action of a library entry leads. */
export function simulatorHref(sim: LibrarySimulator): string {
  if (sim.kind === "BREAK_EVEN") return "/strategies?tab=break-even";
  if (sim.kind === "REVENUE_OPPORTUNITY") return "/strategies?tab=opportunity";
  return `/strategies?tab=simulator&kind=${sim.kind}`;
}
