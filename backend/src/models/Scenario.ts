import mongoose, { Document, Schema } from 'mongoose';

export interface IScenario extends Document {
  scenarioId: string;
  scenarioType: string;
  name: string;
  parameters: Record<string, any>;
  timestamp: Date;
  status: 'ACTIVE' | 'RESOLVED' | 'APPLIED';
  communityId: string;
  resultingOptimizationRunId?: string;
  impactMetrics?: {
    costDeltaUsd: number;
    co2DeltaKg: number;
    reliabilityDeltaPct: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ScenarioSchema = new Schema<IScenario>(
  {
    scenarioId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    scenarioType: {
      type: String,
      required: true,
      enum: ['CLOUD_COVER', 'WIND_DROP', 'BATTERY_FAULT', 'DEMAND_SURGE', 'DIESEL_PRICE_SPIKE', 'CUSTOM'],
      index: true
    },
    name: {
      type: String,
      required: true
    },
    parameters: {
      type: Schema.Types.Mixed,
      default: {}
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'RESOLVED', 'APPLIED'],
      default: 'APPLIED'
    },
    communityId: {
      type: String,
      default: 'com-offgrid-01',
      index: true
    },
    resultingOptimizationRunId: {
      type: String,
      index: true
    },
    impactMetrics: {
      costDeltaUsd: { type: Number, default: 0 },
      co2DeltaKg: { type: Number, default: 0 },
      reliabilityDeltaPct: { type: Number, default: 0 }
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

export const Scenario = mongoose.model<IScenario>('Scenario', ScenarioSchema);
