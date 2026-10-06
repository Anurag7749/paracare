import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const statusColors = {
  normal: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/30',
  warning: 'from-amber-500/20 to-amber-600/5 border-amber-500/30',
  critical: 'from-red-500/20 to-red-600/5 border-red-500/30',
  info: 'from-cyan-500/20 to-cyan-600/5 border-cyan-500/30',
};

const statusTextColors = {
  normal: 'text-emerald-400',
  warning: 'text-amber-400',
  critical: 'text-red-400',
  info: 'text-cyan-400',
};

export default function HealthCard({ title, value, unit, icon: Icon, status = 'normal', trend, subtitle, className = '' }) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <div className={`relative overflow-hidden rounded-xl border bg-gradient-to-br p-5 ${statusColors[status]} ${className}`}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{title}</p>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-3xl font-bold ${statusTextColors[status]}`}>
              {value ?? '--'}
            </span>
            {unit && <span className="text-sm text-slate-400">{unit}</span>}
          </div>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        <div className={`p-2.5 rounded-lg bg-slate-800/50 ${statusTextColors[status]}`}>
          {Icon && <Icon className="w-5 h-5" />}
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1.5">
          <TrendIcon className={`w-3.5 h-3.5 ${trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-slate-400'}`} />
          <span className="text-xs text-slate-400">vs last reading</span>
        </div>
      )}
    </div>
  );
}
