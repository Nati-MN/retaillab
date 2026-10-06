import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Notice } from "@/components/ui";
import { getReportRow, loadReportInput } from "@/components/reports/loadReport";
import { DeleteReportButton, PrintButton } from "@/components/reports/ReportControls";
import { ReportDocument } from "@/components/reports/ReportDocument";
import { seriesColor } from "@/lib/colors";
import { buildReport } from "@/lib/reports/model";
import { canWrite, requireOrg } from "@/server/session";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrg();
  const { id } = await params;
  const r = await getReportRow(ctx.orgId, id);
  return { title: r?.title ?? "Report" };
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrg();
  const { id } = await params;
  const report = await getReportRow(ctx.orgId, id);
  if (!report) notFound();
  const { input, allStoreIds, missingStores } = await loadReportInput(ctx.orgId, ctx.org.currency, report);
  const model = buildReport(input);
  // A store keeps its colour everywhere: index in the organization's alphabetical store list.
  const colors = Object.fromEntries(allStoreIds.map((sid, i) => [sid, seriesColor(i)]));
  const storesLabel = report.storeIds.length === 0
    ? `All stores (${input.stores.length})`
    : input.stores.length <= 3 ? input.stores.map((s) => s.name).join(", ") || "None" : `${input.stores.length} selected stores`;

  return (
    <>
      <div className="no-print mx-auto mb-3 flex max-w-[860px] flex-wrap items-center justify-between gap-2">
        <Link href="/reports" className="btn-ghost"><ArrowLeft className="h-3.5 w-3.5" aria-hidden />All reports</Link>
        <div className="flex flex-wrap items-center gap-2">
          {canWrite(ctx.role) && <DeleteReportButton id={report.id} />}
          <PrintButton />
        </div>
      </div>
      {missingStores > 0 && (
        <Notice tone="warn" className="no-print mx-auto mb-3 max-w-[860px]">
          {missingStores} store{missingStores === 1 ? "" : "s"} selected for this report no longer exist{missingStores === 1 ? "s" : ""} and {missingStores === 1 ? "is" : "are"} left out.
        </Notice>
      )}
      <ReportDocument
        model={model}
        colors={colors}
        meta={{
          title: report.title,
          orgName: ctx.org.name,
          isDemo: ctx.org.isDemo,
          generatedAt: input.generatedAt,
          createdAt: report.createdAt.toISOString(),
          createdBy: report.createdBy.name,
          storesLabel,
          currency: ctx.org.currency,
        }}
      />
    </>
  );
}
