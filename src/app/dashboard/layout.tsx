import Header from '@/components/layout/Header';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
