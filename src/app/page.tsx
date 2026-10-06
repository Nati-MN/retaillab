import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { auth } from "@/auth";
import { exploreDemo } from "@/server/authActions";

const CHAIN = ["Data", "Observation", "Hypothesis", "Calculation", "Experiment", "Result"];

export default async function Landing() {
  const session = await auth();
  if (session?.user?.id) redirect("/overview");
  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <div className="w-full max-w-3xl">
        <div className="flex items-center gap-2">
          <span aria-hidden className="grid h-6 w-6 place-items-center rounded-sm bg-ink font-mono text-xs font-bold text-surface">R</span>
          <span className="text-sm font-semibold tracking-tight">RetailLab</span>
        </div>
        <h1 className="mt-8 text-3xl leading-tight tracking-tight sm:text-4xl">
          Understand stores.<br />Test strategies.<br />Measure growth.
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-6 text-ink-2">
          Analytics and experiment tracking for physical retail. Every number shows its formula, every external claim
          shows its source, and every idea is labelled as a hypothesis until an experiment says otherwise.
        </p>
        <ol className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-2xs uppercase tracking-wider text-ink-3" aria-label="How RetailLab reasons">
          {CHAIN.map((c, i) => (
            <li key={c} className="flex items-center gap-2">
              <span className="rounded-sm border border-line-strong px-1.5 py-0.5 text-ink-2">{c}</span>
              {i < CHAIN.length - 1 && <ArrowRight className="h-3 w-3" aria-hidden />}
            </li>
          ))}
        </ol>

        <div className="mt-10 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2">
          <form action={exploreDemo} className="flex flex-col bg-surface p-5">
            <div className="label">No setup</div>
            <h2 className="mt-1 text-base">Explore Demo</h2>
            <p className="mt-1 flex-1 text-ink-2">
              Six fictional Austrian grocery stores of “AlpenMarkt GmbH” with 24 months of invented history, hypotheses and experiments.
            </p>
            <button type="submit" className="btn-primary mt-4 self-start">Explore demo <ArrowRight className="h-3.5 w-3.5" aria-hidden /></button>
          </form>
          <div className="flex flex-col bg-surface p-5">
            <div className="label">Your data</div>
            <h2 className="mt-1 text-base">Create Organization</h2>
            <p className="mt-1 flex-1 text-ink-2">
              Set up your company, add stores and enter monthly figures. A four-step wizard; everything except revenue is optional.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <Link href="/register" className="btn-secondary">Create organization</Link>
              <Link href="/login" className="btn-ghost">Sign in</Link>
            </div>
          </div>
        </div>
        <p className="mt-4 text-xs text-ink-3">
          The demo is shared and fictional. No external services are contacted unless you configure a provider.
        </p>
      </div>
    </main>
  );
}
