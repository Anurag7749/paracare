import { Loader2 } from 'lucide-react';
export default function LoadingState({ message = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
      <Loader2 className="w-8 h-8 animate-spin text-cyan-400 mb-3" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
