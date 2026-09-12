import mongoose, { Document, Schema } from 'mongoose';

export interface IOverrideEvent extends Document {
  overrideId: string;
  operatorId: string;
  operatorEmail?: string;
  communityId: string;
  timestamp: Date;
  previousState: Record<string, any>;
  overrideSettings: {
    forceDieselOn?: boolean;
    forceDieselOff?: boolean;
    minBatteryReservePct?: number;
    dieselManualKw?: number;
    shedTier4?: boolean;
    reason: string;
  };
  reason: string;
  quantifiedImpact: {
    costDeltaUsd: number;
    co2DeltaKg: number;
    reliabilityDeltaPct: number;
    explanation?: string;
  };
  optimizationRunId?: string;
  status: 'ACTIVE' | 'CLEARED';
  createdAt: Date;
  updatedAt: Date;
}

const OverrideEventSchema = new Schema<IOverrideEvent>(
  {
    overrideId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    operatorId: {
      type: String,
      required: true,
      index: true
    },
    operatorEmail: {
      type: String
    },
    communityId: {
      type: String,
      default: 'com-offgrid-01',
      index: true
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },
    previousState: {
      type: Schema.Types.Mixed,
      default: {}
    },
    overrideSettings: {
      forceDieselOn: { type: Boolean },
      forceDieselOff: { type: Boolean },
      minBatteryReservePct: { type: Number },
      dieselManualKw: { type: Number },
      shedTier4: { type: Boolean },
      reason: { type: String, required: true }
    },
    reason: {
      type: String,
      required: true
    },
    quantifiedImpact: {
      costDeltaUsd: { type: Number, default: 0 },
      co2DeltaKg: { type: Number, default: 0 },
      reliabilityDeltaPct: { type: Number, default: 0 },
      explanation: { type: String }
    },
    optimizationRunId: {
      type: String
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'CLEARED'],
      default: 'ACTIVE'
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

export const OverrideEvent = mongoose.model<IOverrideEvent>('OverrideEvent', OverrideEventSchema);
