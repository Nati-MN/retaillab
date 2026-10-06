import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteStoreForm } from "@/components/stores/DeleteStoreForm";
import { StoreForm } from "@/components/stores/StoreForm";
import { Notice, PageHeader, Panel, Tag } from "@/components/ui";
import { deleteStoreAction, saveStoreAction } from "@/server/actions/stores";
import { getStore } from "@/server/queries";
import { canWrite, requireOrg } from "@/server/session";

export const metadata = { title: "Edit store" };

export default async function EditStorePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrg();
  const { id } = await params;
  const store = await getStore(ctx.orgId, id);
  if (!store) notFound();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow={<><Link href="/stores" className="hover:text-ink">Stores</Link> / <Link href={`/stores/${store.id}`} className="hover:text-ink">{store.name}</Link></>}
        title={<span className="flex flex-wrap items-center gap-2">Edit {store.name} {store.isDemo && <Tag kind="DEMO" />}</span>}
      />
      {canWrite(ctx.role) ? (
        <Panel>
          <StoreForm key={store.id} action={saveStoreAction} store={store} submitLabel="Save changes" cancelHref={`/stores/${store.id}`} />
        </Panel>
      ) : (
        <Notice tone="warn" title="Read-only access">Your role cannot edit stores.</Notice>
      )}
      <Panel title="Delete store" className="mt-4 border-neg/30">
        {ctx.role === "OWNER" ? (
          <DeleteStoreForm action={deleteStoreAction} storeId={store.id} storeName={store.name} storeCode={store.code} />
        ) : (
          <p className="text-xs text-ink-2">Only an owner of {ctx.org.name} can delete a store.</p>
        )}
      </Panel>
    </div>
  );
}
