'use client';

import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ScoringAlgorithmDTO } from '@application/dtos/quiz.dto';
import { z } from 'zod';

type ScoringAlgorithm = z.infer<typeof ScoringAlgorithmDTO>;

interface ScoringInfoBadgeProps {
  algorithm: ScoringAlgorithm;
  decayRate?: number;
  className?: string;
}

const algorithmLabels: Record<ScoringAlgorithm, string> = {
  EXPONENTIAL_DECAY: 'Speed Scoring',
  LINEAR: 'Balanced Scoring',
  FIXED: 'Fixed Points',
};

const algorithmDescriptions: Record<ScoringAlgorithm, string> = {
  EXPONENTIAL_DECAY:
    'Answer faster to earn exponentially more points! Early answers get maximum bonus.',
  LINEAR:
    'Speed matters but you are guaranteed at least 50% of points even if time runs out.',
  FIXED:
    'All correct answers earn the same points regardless of speed. Take your time!',
};

const getDecayRateLabel = (rate: number): string => {
  if (rate <= 1.0) return 'Gentle';
  if (rate <= 2.5) return 'Default';
  return 'Aggressive';
};

export function ScoringInfoBadge({
  algorithm,
  decayRate = 2.0,
  className = '',
}: ScoringInfoBadgeProps) {
  const label = algorithmLabels[algorithm];
  const description = algorithmDescriptions[algorithm];
  const showDecayRate = algorithm === 'EXPONENTIAL_DECAY';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-gray-700/90 backdrop-blur-sm ${className}`}
          >
            <Info className="h-3.5 w-3.5" />
            <span>{label}</span>
            {showDecayRate && (
              <span className="ml-0.5 text-gray-600/60">
                • {getDecayRateLabel(decayRate)}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="max-w-xs border-white/20 bg-slate-900/95 p-3 text-sm text-white backdrop-blur-sm"
        >
          <p className="font-semibold">{label}</p>
          <p className="mt-1 text-white/80">{description}</p>
          {showDecayRate && (
            <p className="mt-2 text-xs text-white/60">
              Decay rate: {decayRate.toFixed(1)} ({getDecayRateLabel(decayRate)}
              )
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
