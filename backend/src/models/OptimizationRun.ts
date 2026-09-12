import mongoose, { Document, Schema } from 'mongoose';

export interface IOptimizationRun extends Document {
  runId: string;
  timestamp: Date;
  communityId: string;
  scenarioId?: string;
  triggerReason: string;
  horizonHours: number;
  inputSnapshot: Record<string, any>;
  forecastSnapshot?: Record<string, any>;
  dispatchPlan: Record<string, any>;
  objectiveBreakdown: {
    totalCostUsd: number;
    totalCo2Kg: number;
    renewableSharePct: number;
    dieselLitersUsed: number;
    reliabilityScorePct: number;
    unservedEnergyPenalty?: number;
    degradationPenalty?: number;
  };
  shortfallStage: number;
  reasonCodes: string[];
  executedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const OptimizationRunSchema = new Schema<IOptimizationRun>(
  {
    runId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },
    communityId: {
      type: String,
      default: 'com-offgrid-01',
      index: true
    },
    scenarioId: {
      type: String,
      index: true
    },
    triggerReason: {
      type: String,
      default: 'ORCHESTRATOR_TICK'
    },
    horizonHours: {
      type: Number,
      default: 24
    },
    inputSnapshot: {
      type: Schema.Types.Mixed,
      required: true
    },
    forecastSnapshot: {
      type: Schema.Types.Mixed
    },
    dispatchPlan: {
      type: Schema.Types.Mixed,
      required: true
    },
    objectiveBreakdown: {
      totalCostUsd: { type: Number, default: 0 },
      totalCo2Kg: { type: Number, default: 0 },
      renewableSharePct: { type: Number, default: 100 },
      dieselLitersUsed: { type: Number, default: 0 },
      reliabilityScorePct: { type: Number, default: 100 },
      unservedEnergyPenalty: { type: Number, default: 0 },
      degradationPenalty: { type: Number, default: 0 }
    },
    shortfallStage: {
      type: Number,
      default: 0
    },
    reasonCodes: {
      type: [String],
      default: []
    },
    executedBy: {
      type: String,
      default: 'AUTOPILOT'
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: any) {
        delete ret.__v;
        ret.id = ret._id ? ret._id.toString() : undefined;
        delete ret._id;
        return ret;
      }
    }
  }
);

// Compound index for querying recent runs by community
OptimizationRunSchema.index({ communityId: 1, timestamp: -1 });

export const OptimizationRun = mongoose.model<IOptimizationRun>('OptimizationRun', OptimizationRunSchema);
