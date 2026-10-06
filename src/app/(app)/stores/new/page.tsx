import Link from "next/link";
import { StoreForm } from "@/components/stores/StoreForm";
import { Notice, PageHeader, Panel } from "@/components/ui";
import { saveStoreAction } from "@/server/actions/stores";
import { canWrite, requireOrg } from "@/server/session";

export const metadata = { title: "Add store" };

export default async function NewStorePage() {
  const ctx = await requireOrg();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow={<Link href="/stores" className="hover:text-ink">Stores</Link>} title="Add store" subtitle="Only name, code, address, city and type are required. Everything else can be added later; missing values are shown as missing." />
      {canWrite(ctx.role) ? (
        <Panel>
          <StoreForm action={saveStoreAction} submitLabel="Create store" cancelHref="/stores" />
        </Panel>
      ) : (
        <Notice tone="warn" title="Read-only access">Your role cannot add stores. Ask an owner or analyst of {ctx.org.name}.</Notice>
      )}
    </div>
  );
}
