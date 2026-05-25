'use client';

import { CreateTeamForm } from '@/components/CreateTeamForm';

export default function CreateTeamPage() {
  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">Create New Team</h1>
        <p className="text-slate-600">Set up a new team with repository and deployment configuration</p>
      </div>

      {/* Form */}
      <div className="w-full">
        <CreateTeamForm onSuccess={() => {}} />
      </div>
    </>
  );
}
