import {
  getPricingScoreLabel,
  getPricingScoreMetadata,
} from "@my-better-t-app/api/pricing-intelligence";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@my-better-t-app/ui/components/tooltip";
import { Button } from "@my-better-t-app/ui/components/button";
import { Info } from "lucide-react";
import type { CSSProperties } from "react";
import { fillRatio, scoreBand, staggerDelay } from "@/lib/score";

export type DisplayScore = { key: string; score: number; confidence: number };

export type PeerContext = {
  cohortLabel: string;
  pageCount: number;
  scores: { key: string; percentile: number; median: number }[];
};

export function ScoreGrid({ scores, peer }: { scores: DisplayScore[]; peer?: PeerContext | null }) {
  const peerByKey = new Map(peer?.scores.map((score) => [score.key, score]));
  return (
    // A short delay stops the tooltip firing on a pass-through; once one is
    // open the rest of the column opens instantly.
    <TooltipProvider delay={350}>
      <div className="score-grid">
        {scores.map((item, index) => {
          const comparison = peerByKey.get(item.key);
          return (
            <div
              className="score-row row-enter"
              key={item.key}
              data-band={scoreBand(item.score)}
              style={{ "--enter-delay": staggerDelay(index, 40, 6) } as CSSProperties}
            >
              <div className="score-meta">
                <ScoreLabel scoreKey={item.key} />
                <span className="score-number">{Math.round(item.score)}</span>
              </div>
              <div
                className="score-track"
                role="progressbar"
                aria-label={getPricingScoreLabel(item.key)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(item.score)}
              >
                {/* Bars sweep out after the row lands, so the value reads as a
                    measurement being taken rather than a static graphic. */}
                <span
                  className="score-fill"
                  style={
                    {
                      "--fill": fillRatio(item.score),
                      "--fill-delay": staggerDelay(index, 40, 6),
                    } as CSSProperties
                  }
                />
                {/* The peer median, so the bar is read against something. */}
                {comparison ? (
                  <span
                    className="score-peer-marker"
                    style={{ "--at": `${comparison.median}%` } as CSSProperties}
                  />
                ) : null}
              </div>
              <span className="score-confidence">
                {comparison ? (
                  <>
                    <strong>{ordinal(comparison.percentile)}</strong> of {peer?.pageCount}{" "}
                    {peer?.cohortLabel.toLowerCase()} · median {comparison.median} ·{" "}
                  </>
                ) : null}
                {Math.round(item.confidence * 100)}% confidence
              </span>
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

function ordinal(value: number) {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[value % 10] ?? "th";
  return `${value}${suffix}`;
}

/**
 * The tooltip carries the exact question the model answered. An unknown key
 * means this client is older than the server, so it degrades to the label
 * alone rather than offering a control with nothing behind it.
 */
function ScoreLabel({ scoreKey }: { scoreKey: string }) {
  const label = getPricingScoreLabel(scoreKey);
  const metadata = getPricingScoreMetadata(scoreKey);
  if (!metadata) return <span>{label}</span>;
  return (
    <span className="score-label">
      {label}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              className="score-info"
              variant="ghost"
              size="icon-xs"
              aria-label={`What ${label} measures`}
            />
          }
        >
          <Info size={12} aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent className="score-tooltip">{metadata.question}</TooltipContent>
      </Tooltip>
    </span>
  );
}
