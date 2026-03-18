import { SignIn } from '@clerk/react';

export default function SignInPage() {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-slate-50 px-4">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">ArtSlaw</h1>
        <p className="text-slate-400 text-sm mt-1">Your personal gallery companion</p>
      </div>
      <SignIn routing="hash" />
    </div>
  );
}
