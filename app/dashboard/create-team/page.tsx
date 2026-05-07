'use client';

import { useRouter } from 'next/navigation';
import { CreateTeamForm } from '@/components/CreateTeamForm';

export default function CreateTeamPage() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push('/dashboard/teams');
  };

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">Create New Team</h1>
        <p className="text-slate-600">Set up a new team with repository and deployment configuration</p>
      </div>

      {/* Form */}
      <div className="max-w-2xl">
        <CreateTeamForm onSuccess={handleSuccess} />
      </div>
    </>
  );
}
