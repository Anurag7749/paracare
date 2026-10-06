import { AlertTriangle, RefreshCw } from 'lucide-react';
export default function ErrorState({ message = 'Something went wrong', onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-red-400">
      <AlertTriangle className="w-12 h-12 mb-4" />
      <h3 className="text-lg font-medium">Error</h3>
      <p className="text-sm mt-1 text-slate-400">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-4 flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm transition-colors">
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      )}
    </div>
  );
}
