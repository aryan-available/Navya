import mongoose, { Document, Schema } from 'mongoose';
import { SignalColor } from '../types';

export interface ISignalState extends Document {
  communityId: string;
  color: SignalColor;
  message: string;
  shortfallStage: number;
  timestamp: Date;
}

const SignalStateSchema = new Schema<ISignalState>(
  {
    communityId: {
      type: String,
      default: 'com-offgrid-01',
      index: true
    },
    color: {
      type: String,
      enum: ['GREEN', 'YELLOW', 'RED'],
      required: true,
      default: 'GREEN'
    },
    message: {
      type: String,
      required: true,
      default: 'Microgrid operating on 100% renewable generation. Battery charging.'
    },
    shortfallStage: {
      type: Number,
      default: 0
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
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

SignalStateSchema.index({ communityId: 1, timestamp: -1 });

export const SignalStateModel = mongoose.model<ISignalState>('SignalState', SignalStateSchema);
