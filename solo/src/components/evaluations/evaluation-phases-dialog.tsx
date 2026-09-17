"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function EvaluationPhasesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!open) return null;

  return (
    <div
      className="modal-overlay fixed inset-0 z-[120] flex items-center justify-center p-4"
      onClick={() => onOpenChange(false)}
    >
      <Card
        className="modal-panel w-full max-w-md border border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <CardContent className="space-y-4 pt-6">
          <h3 className="text-lg font-semibold">Evaluation phases</h3>
          <div className="space-y-4 text-sm text-gray-400">
            <div>
              <p className="font-medium text-white">Phase 1</p>
              <p>
                Hit the profit target while respecting max loss and daily loss
                limits. Minimum trading days may apply.
              </p>
            </div>
            <div>
              <p className="font-medium text-white">Phase 2</p>
              <p>
                Available on 2 Step programs — a second profit milestone before
                master status.
              </p>
            </div>
            <div>
              <p className="font-medium text-white">Master</p>
              <p>
                Funded trading with profit split payouts. Zero programs skip profit
                targets and focus on consistency instead.
              </p>
            </div>
            <p className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs">
              Breaching max loss or daily loss ends the evaluation and revokes MT5
              access until you start a new program.
            </p>
          </div>
          <Button variant="secondary" className="w-full" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
