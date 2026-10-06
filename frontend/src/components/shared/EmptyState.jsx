import { Inbox } from 'lucide-react';
export default function EmptyState({ title = 'No data', message = 'Nothing to display yet.', icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-500">
      <Icon className="w-12 h-12 mb-4 text-slate-600" />
      <h3 className="text-lg font-medium text-slate-400">{title}</h3>
      <p className="text-sm mt-1">{message}</p>
    </div>
  );
}
