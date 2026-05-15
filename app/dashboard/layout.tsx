import { DashboardSidebar } from '@/components/DashboardSidebar';
import { ProtectedLayout } from '@/components/ProtectedLayout';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedLayout>
      <div className="flex min-h-screen bg-slate-50">
        <DashboardSidebar />
        <div className="flex-1 ml-64">
          <main className="p-8">{children}</main>
        </div>
      </div>
    </ProtectedLayout>
  );
}
