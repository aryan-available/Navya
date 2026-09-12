import mongoose, { Document, Schema } from 'mongoose';

export interface ICommunity extends Document {
  communityId: string;
  name: string;
  location: {
    latitude: number;
    longitude: number;
    region: string;
    timezone: string;
  };
  demandProfileType: string;
  reliabilityTargets: {
    minUptimePct: number;
    maxOutageHoursYear: number;
  };
  energyAssets: {
    solar: {
      capacityKw: number;
      efficiencyPct: number;
      inverterCapacityKw: number;
    };
    wind: {
      capacityKw: number;
      cutInSpeedMs: number;
      ratedSpeedMs: number;
    };
    battery: {
      capacityKwh: number;
      maxChargeKw: number;
      maxDischargeKw: number;
      minSocPct: number;
      maxSocPct: number;
      roundTripEfficiencyPct: number;
    };
    diesel: {
      ratedKw: number;
      minLoadKw: number;
      sweetSpotKw: number;
      tankCapacityL: number;
      fuelConsumptionLPerKwh: number;
      fuelPricePerLiter: number;
    };
  };
  currentOperationalState?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const CommunitySchema = new Schema<ICommunity>(
  {
    communityId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    name: {
      type: String,
      required: true
    },
    location: {
      latitude: { type: Number, default: -1.2921 },
      longitude: { type: Number, default: 36.8219 },
      region: { type: String, default: 'Off-Grid Eco District' },
      timezone: { type: String, default: 'UTC+3' }
    },
    demandProfileType: {
      type: String,
      default: 'RURAL_COMMUNITY_MIXED'
    },
    reliabilityTargets: {
      minUptimePct: { type: Number, default: 99.5 },
      maxOutageHoursYear: { type: Number, default: 24 }
    },
    energyAssets: {
      solar: {
        capacityKw: { type: Number, default: 120.0 },
        efficiencyPct: { type: Number, default: 21.5 },
        inverterCapacityKw: { type: Number, default: 100.0 }
      },
      wind: {
        capacityKw: { type: Number, default: 60.0 },
        cutInSpeedMs: { type: Number, default: 3.0 },
        ratedSpeedMs: { type: Number, default: 11.0 }
      },
      battery: {
        capacityKwh: { type: Number, default: 250.0 },
        maxChargeKw: { type: Number, default: 50.0 },
        maxDischargeKw: { type: Number, default: 60.0 },
        minSocPct: { type: Number, default: 20.0 },
        maxSocPct: { type: Number, default: 95.0 },
        roundTripEfficiencyPct: { type: Number, default: 92.0 }
      },
      diesel: {
        ratedKw: { type: Number, default: 100.0 },
        minLoadKw: { type: Number, default: 25.0 },
        sweetSpotKw: { type: Number, default: 80.0 },
        tankCapacityL: { type: Number, default: 1000.0 },
        fuelConsumptionLPerKwh: { type: Number, default: 0.27 },
        fuelPricePerLiter: { type: Number, default: 1.45 }
      }
    },
    currentOperationalState: {
      type: Schema.Types.Mixed,
      default: {}
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

export const Community = mongoose.model<ICommunity>('Community', CommunitySchema);
