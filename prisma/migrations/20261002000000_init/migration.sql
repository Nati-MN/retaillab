-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ANALYST', 'VIEWER');

-- CreateEnum
CREATE TYPE "StoreType" AS ENUM ('SUPERMARKET', 'CONVENIENCE', 'DISCOUNT', 'SPECIALTY');

-- CreateEnum
CREATE TYPE "StoreMetricKind" AS ENUM ('HOURLY_TRANSACTIONS', 'STOCKOUT_RATE_PCT', 'WASTE_VALUE');

-- CreateEnum
CREATE TYPE "CostType" AS ENUM ('PERSONNEL', 'RENT', 'ENERGY', 'LOGISTICS', 'WASTE', 'MARKETING', 'MAINTENANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "SourceReliability" AS ENUM ('OFFICIAL', 'COMMUNITY', 'COMMERCIAL', 'UNKNOWN', 'DEMO');

-- CreateEnum
CREATE TYPE "SignalType" AS ENUM ('PUBLIC_TRANSPORT', 'PARKING', 'SCHOOL', 'UNIVERSITY', 'OFFICE', 'RESIDENTIAL', 'SHOPPING_CENTER', 'POINT_OF_INTEREST', 'POPULATION', 'DEVELOPMENT', 'ROAD_ACCESS');

-- CreateEnum
CREATE TYPE "ResearchStatus" AS ENUM ('COMPLETED', 'PARTIAL', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "FindingKind" AS ENUM ('FACT', 'OPPORTUNITY', 'RISK', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "StrategyCategory" AS ENUM ('PRICING', 'ASSORTMENT', 'STORE_LAYOUT', 'OPENING_HOURS', 'STAFFING', 'MARKETING', 'CUSTOMER_RETENTION', 'CHECKOUT', 'INVENTORY', 'FOOD_WASTE', 'LOCAL_MARKETING', 'CONVENIENCE', 'SEASONAL', 'MERCHANDISING');

-- CreateEnum
CREATE TYPE "StrategyOrigin" AS ENUM ('RULE_ENGINE', 'LLM', 'USER');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "StrategyStatus" AS ENUM ('HYPOTHESIS', 'SIMULATED', 'TESTING', 'VALIDATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ScenarioKind" AS ENUM ('OPENING_HOURS', 'BREAK_EVEN', 'REVENUE_OPPORTUNITY', 'TRANSACTION_UPLIFT', 'COST_REDUCTION');

-- CreateEnum
CREATE TYPE "ScenarioVariant" AS ENUM ('CONSERVATIVE', 'BASE', 'OPTIMISTIC');

-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('PLANNED', 'RUNNING', 'COMPLETED', 'STOPPED');

-- CreateEnum
CREATE TYPE "ExperimentDecision" AS ENUM ('ADOPT', 'REPEAT', 'MODIFY', 'REJECT', 'INCONCLUSIVE');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('NEW', 'INVESTIGATING', 'READY_TO_TEST', 'TESTING', 'VALIDATED', 'REJECTED', 'INCONCLUSIVE');

-- CreateEnum
CREATE TYPE "Effort" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "onboardingCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aiIncludeFinancials" BOOLEAN NOT NULL DEFAULT false,
    "aiIncludeStoreNames" BOOLEAN NOT NULL DEFAULT true,
    "aiIncludeResearch" BOOLEAN NOT NULL DEFAULT true,
    "aiExplanations" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OWNER',

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "openingDate" DATE,
    "areaSqm" DOUBLE PRECISION,
    "employees" INTEGER,
    "parkingSpaces" INTEGER,
    "type" "StoreType" NOT NULL DEFAULT 'SUPERMARKET',
    "opensAt" TEXT,
    "closesAt" TEXT,
    "openDaysPerWeek" INTEGER,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyRevenue" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "revenue" DECIMAL(14,2) NOT NULL,
    "transactions" INTEGER,
    "customers" INTEGER,
    "grossMarginPct" DECIMAL(5,2),
    "openDays" INTEGER,

    CONSTRAINT "MonthlyRevenue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreMetric" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "kind" "StoreMetricKind" NOT NULL,
    "hour" INTEGER NOT NULL DEFAULT -1,
    "value" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "StoreMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryMetric" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "revenue" DECIMAL(14,2) NOT NULL,
    "marginPct" DECIMAL(5,2),
    "wasteValue" DECIMAL(14,2),
    "stockoutRatePct" DECIMAL(5,2),
    "areaSqm" DOUBLE PRECISION,

    CONSTRAINT "CategoryMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cost" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "type" "CostType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "Cost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnownEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storeId" TEXT,
    "date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "KnownEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchSource" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "accessedAt" TIMESTAMP(3) NOT NULL,
    "excerpt" TEXT NOT NULL,
    "reliability" "SourceReliability" NOT NULL DEFAULT 'UNKNOWN',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ResearchSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "distanceM" INTEGER NOT NULL,
    "openingHours" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "sourceId" TEXT NOT NULL,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationSignal" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" "SignalType" NOT NULL,
    "name" TEXT NOT NULL,
    "detail" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "distanceM" INTEGER,
    "sourceId" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LocationSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchResult" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storeId" TEXT,
    "query" TEXT NOT NULL,
    "radiusM" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "ResearchStatus" NOT NULL,
    "sourcesChecked" INTEGER NOT NULL DEFAULT 0,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchFinding" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "kind" "FindingKind" NOT NULL,
    "text" TEXT NOT NULL,
    "sourceId" TEXT,

    CONSTRAINT "ResearchFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Strategy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storeId" TEXT,
    "libraryKey" TEXT,
    "ruleKey" TEXT,
    "title" TEXT NOT NULL,
    "category" "StrategyCategory" NOT NULL,
    "origin" "StrategyOrigin" NOT NULL DEFAULT 'USER',
    "observation" TEXT NOT NULL,
    "locationSignal" TEXT,
    "hypothesis" TEXT NOT NULL,
    "whyItMayMatter" TEXT NOT NULL,
    "proposedTest" TEXT NOT NULL,
    "assumptions" TEXT[],
    "risks" TEXT[],
    "metricsToWatch" TEXT[],
    "costAssumption" DECIMAL(14,2),
    "dataConfidence" "Confidence" NOT NULL DEFAULT 'LOW',
    "confidenceNote" TEXT,
    "status" "StrategyStatus" NOT NULL DEFAULT 'HYPOTHESIS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storeId" TEXT,
    "strategyId" TEXT,
    "name" TEXT NOT NULL,
    "kind" "ScenarioKind" NOT NULL,
    "derivation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioInput" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "variant" "ScenarioVariant" NOT NULL,
    "key" TEXT NOT NULL,
    "value" DECIMAL(16,4) NOT NULL,

    CONSTRAINT "ScenarioInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experiment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "strategyId" TEXT,
    "title" TEXT NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "testStoreId" TEXT NOT NULL,
    "controlStoreId" TEXT,
    "status" "ExperimentStatus" NOT NULL DEFAULT 'PLANNED',
    "startDate" DATE,
    "endDate" DATE,
    "cost" DECIMAL(14,2),
    "notes" TEXT,
    "decision" "ExperimentDecision",
    "decisionNote" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentMetric" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'EUR',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "testBefore" DECIMAL(14,2),
    "testAfter" DECIMAL(14,2),
    "controlBefore" DECIMAL(14,2),
    "controlAfter" DECIMAL(14,2),

    CONSTRAINT "ExperimentMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "strategyId" TEXT,
    "title" TEXT NOT NULL,
    "observation" TEXT NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "impactScenario" TEXT NOT NULL,
    "estimatedCost" DECIMAL(14,2),
    "effort" "Effort" NOT NULL DEFAULT 'MEDIUM',
    "dataConfidence" "Confidence" NOT NULL DEFAULT 'LOW',
    "suggestedExperiment" TEXT NOT NULL,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "sections" TEXT[],
    "storeIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Membership_organizationId_idx" ON "Membership"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_organizationId_key" ON "Membership"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "Store_organizationId_idx" ON "Store"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Store_organizationId_code_key" ON "Store"("organizationId", "code");

-- CreateIndex
CREATE INDEX "MonthlyRevenue_month_idx" ON "MonthlyRevenue"("month");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyRevenue_storeId_month_key" ON "MonthlyRevenue"("storeId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "StoreMetric_storeId_month_kind_hour_key" ON "StoreMetric"("storeId", "month", "kind", "hour");

-- CreateIndex
CREATE UNIQUE INDEX "Category_organizationId_name_key" ON "Category"("organizationId", "name");

-- CreateIndex
CREATE INDEX "CategoryMetric_storeId_month_idx" ON "CategoryMetric"("storeId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryMetric_storeId_categoryId_month_key" ON "CategoryMetric"("storeId", "categoryId", "month");

-- CreateIndex
CREATE INDEX "Cost_storeId_month_idx" ON "Cost"("storeId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "Cost_storeId_month_type_key" ON "Cost"("storeId", "month", "type");

-- CreateIndex
CREATE INDEX "KnownEvent_organizationId_date_idx" ON "KnownEvent"("organizationId", "date");

-- CreateIndex
CREATE INDEX "ResearchSource_organizationId_idx" ON "ResearchSource"("organizationId");

-- CreateIndex
CREATE INDEX "Competitor_storeId_idx" ON "Competitor"("storeId");

-- CreateIndex
CREATE INDEX "LocationSignal_storeId_type_idx" ON "LocationSignal"("storeId", "type");

-- CreateIndex
CREATE INDEX "ResearchResult_organizationId_completedAt_idx" ON "ResearchResult"("organizationId", "completedAt");

-- CreateIndex
CREATE INDEX "ResearchFinding_resultId_idx" ON "ResearchFinding"("resultId");

-- CreateIndex
CREATE INDEX "Strategy_organizationId_idx" ON "Strategy"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Strategy_organizationId_storeId_ruleKey_key" ON "Strategy"("organizationId", "storeId", "ruleKey");

-- CreateIndex
CREATE INDEX "Scenario_organizationId_idx" ON "Scenario"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioInput_scenarioId_variant_key_key" ON "ScenarioInput"("scenarioId", "variant", "key");

-- CreateIndex
CREATE INDEX "Experiment_organizationId_status_idx" ON "Experiment"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ExperimentMetric_experimentId_idx" ON "ExperimentMetric"("experimentId");

-- CreateIndex
CREATE INDEX "Opportunity_organizationId_status_idx" ON "Opportunity"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Report_organizationId_idx" ON "Report"("organizationId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyRevenue" ADD CONSTRAINT "MonthlyRevenue_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreMetric" ADD CONSTRAINT "StoreMetric_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryMetric" ADD CONSTRAINT "CategoryMetric_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryMetric" ADD CONSTRAINT "CategoryMetric_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cost" ADD CONSTRAINT "Cost_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnownEvent" ADD CONSTRAINT "KnownEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnownEvent" ADD CONSTRAINT "KnownEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSource" ADD CONSTRAINT "ResearchSource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ResearchSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationSignal" ADD CONSTRAINT "LocationSignal_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationSignal" ADD CONSTRAINT "LocationSignal_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ResearchSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchResult" ADD CONSTRAINT "ResearchResult_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchResult" ADD CONSTRAINT "ResearchResult_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchFinding" ADD CONSTRAINT "ResearchFinding_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "ResearchResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchFinding" ADD CONSTRAINT "ResearchFinding_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ResearchSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Strategy" ADD CONSTRAINT "Strategy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Strategy" ADD CONSTRAINT "Strategy_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioInput" ADD CONSTRAINT "ScenarioInput_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_testStoreId_fkey" FOREIGN KEY ("testStoreId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_controlStoreId_fkey" FOREIGN KEY ("controlStoreId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentMetric" ADD CONSTRAINT "ExperimentMetric_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

