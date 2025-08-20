import { Suspense } from "react";
import TimelineClient from "./TimelineClient";

export const dynamic = "force-dynamic";

export default function TimelinePage() {
  return (
    <Suspense fallback={<div className="p-6">Cargando cronograma…</div>}>
      <TimelineClient />
    </Suspense>
  );
}
