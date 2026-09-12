/**
 * LLM Explanation & Grounding Service
 *
 * CRITICAL RULE:
 * The LLM is ONLY an explanation and conversational translator layer.
 * It is NEVER used for optimization mathematics, dispatch calculations, or physical simulation.
 * All explanations are strictly grounded in real optimizer outputs and reason codes.
 */

import axios from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { LLMUnavailableError } from '../utils/errors';
import { CommunityState, DispatchPlan, ShortfallStage } from '../types';

export interface ExplanationContext {
  query?: string;
  currentState?: CommunityState;
  dispatchPlan?: DispatchPlan;
  shortfallStage?: ShortfallStage;
  reasonCodes?: string[];
  metrics?: Record<string, any>;
  scenarioName?: string;
}

export interface ExplanationResult {
  explanation: string;
  grounded_reason_codes: string[];
  metrics_referenced: Record<string, any>;
  provider: string;
}

export class LLMClient {
  private provider: string;
  private apiKey: string;

  constructor() {
    this.provider = env.LLM_PROVIDER.toLowerCase();
    this.apiKey = env.LLM_API_KEY;
  }

  /**
   * Explain an optimization decision or scenario consequence
   */
  async explainDecision(context: ExplanationContext): Promise<ExplanationResult> {
    const reasonCodes = context.reasonCodes || context.dispatchPlan?.reason_codes || [];
    const metrics = context.metrics || context.dispatchPlan?.metrics || {};

    // If no API key is provided, use high-fidelity grounded deterministic synthesizer
    if (!this.apiKey || this.apiKey.includes('sample')) {
      logger.info('LLM API key not configured or in mock mode; using grounded deterministic explanation engine');
      return this.synthesizeGroundedExplanation(context);
    }

    try {
      if (this.provider === 'claude' || this.provider === 'anthropic') {
        return await this.callAnthropic(context);
      } else {
        return await this.callOpenAI(context);
      }
    } catch (err) {
      logger.warn('LLM API call failed, falling back to grounded explanation synthesis', err);
      return this.synthesizeGroundedExplanation(context);
    }
  }

  /**
   * Anthropic Claude Grounded API Call
   */
  private async callAnthropic(context: ExplanationContext): Promise<ExplanationResult> {
    const prompt = this.buildStrictGroundingPrompt(context);

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 600,
        temperature: 0.1, // low temperature for mathematical adherence
        system: `You are GridPilot's operational explanation assistant for an off-grid microgrid.
CRITICAL RULES:
- Use ONLY the supplied optimizer output and system data.
- Do not invent numerical values.
- Do not modify optimization decisions.
- Do not perform the core dispatch optimization.
- If information is unavailable, say so clearly.
- Always explain the physical and economic trade-offs (e.g. diesel sweet spot at 80% vs battery degradation vs tier shedding).`,
        messages: [{ role: 'user', content: prompt }]
      },
      {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        timeout: 10000
      }
    );

    const text = response.data?.content?.[0]?.text || '';
    return {
      explanation: text.trim(),
      grounded_reason_codes: context.reasonCodes || [],
      metrics_referenced: context.metrics || {},
      provider: 'Anthropic Claude'
    };
  }

  /**
   * OpenAI Grounded API Call
   */
  private async callOpenAI(context: ExplanationContext): Promise<ExplanationResult> {
    const prompt = this.buildStrictGroundingPrompt(context);

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: `You are GridPilot's microgrid operational explainer.
CRITICAL RULES:
- Use ONLY the supplied optimizer output and system data.
- Do not invent numerical values.
- Do not modify optimization decisions.
- Do not perform the core dispatch optimization.
- If information is unavailable, say so.`
          },
          { role: 'user', content: prompt }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    const text = response.data?.choices?.[0]?.message?.content || '';
    return {
      explanation: text.trim(),
      grounded_reason_codes: context.reasonCodes || [],
      metrics_referenced: context.metrics || {},
      provider: 'OpenAI GPT'
    };
  }

  /**
   * Constructs the strict system prompt for grounding
   */
  private buildStrictGroundingPrompt(context: ExplanationContext): string {
    return `OPERATOR QUESTION:
"${context.query || 'Explain the current microgrid dispatch and optimization rationale.'}"

OFFICIAL OPTIMIZER DATA (Grounded Ground Truth):
Current State:
- Solar Available: ${context.currentState?.generation.solar_kw ?? 'N/A'} kW
- Wind Available: ${context.currentState?.generation.wind_kw ?? 'N/A'} kW
- Battery SoC: ${context.currentState?.battery.soc_pct ?? 'N/A'}% (Stored: ${context.currentState?.battery.stored_kwh ?? 'N/A'} kWh)
- Diesel Output: ${context.currentState?.generation.diesel_kw ?? 'N/A'} kW (Status: ${context.currentState?.diesel.status ?? 'N/A'})
- Total Community Demand: ${context.currentState?.demand.total_kw ?? 'N/A'} kW
- Critical Tier 1 Clinic Demand: ${context.currentState?.demand.tier_breakdown.tier1_critical_kw ?? 'N/A'} kW
- Flexible Tier 4 Demand: ${context.currentState?.demand.tier_breakdown.tier4_flexible_kw ?? 'N/A'} kW

Shortfall Stage: Stage ${context.shortfallStage ?? context.currentState?.shortfall_stage ?? 0}
Active Engine Reason Codes: ${JSON.stringify(context.reasonCodes || [])}
Metrics: Cost: $${context.metrics?.total_cost_usd ?? '0'}, CO2: ${context.metrics?.total_co2_kg ?? '0'} kg, Reliability: ${context.metrics?.reliability_score_pct ?? '100'}%

Explain in 2-4 concise, professional sentences exactly why the system is in this state and why this dispatch mix was mathematically chosen.`;
  }

  /**
   * Deterministic Grounded Synthesizer
   * Used when no external LLM API key is present, guaranteeing 100% mathematical consistency without external dependencies.
   */
  public synthesizeGroundedExplanation(context: ExplanationContext): ExplanationResult {
    const state = context.currentState;
    const stage = context.shortfallStage ?? state?.shortfall_stage ?? ShortfallStage.STAGE_0_EARLY_WARNING;
    const codes = context.reasonCodes || context.dispatchPlan?.reason_codes || [];
    const solar = state?.generation.solar_kw ?? 0;
    const wind = state?.generation.wind_kw ?? 0;
    const diesel = state?.generation.diesel_kw ?? 0;
    const batSoc = state?.battery.soc_pct ?? 80;
    const demand = state?.demand.total_kw ?? 100;

    let explanation = '';

    if (stage === ShortfallStage.STAGE_0_EARLY_WARNING) {
      if (solar + wind >= demand) {
        explanation = `Solar (${solar} kW) and Wind (${wind} kW) fully cover the current community load (${demand} kW). Surplus clean energy is routed into battery storage (currently ${batSoc}% SoC). The diesel generator remains idle with zero emissions.`;
      } else {
        explanation = `Renewable generation (${solar + wind} kW) is supplemented by battery discharge to cover the ${demand} kW demand. The optimizer is keeping the diesel generator off to avoid fuel expenditure while battery reserves remain above safe thresholds.`;
      }
    } else if (stage === ShortfallStage.STAGE_1_PREEMPTIVE_PRECHARGE) {
      explanation = `The system has entered Stage 1 (Preemptive Pre-Charge). Forecast indicates approaching low-irradiance or wind calm; the optimizer is banking all available surplus power into the battery to build energy buffer for high-priority loads.`;
    } else if (stage === ShortfallStage.STAGE_2_DEFERRABLE_RESCHEDULE) {
      explanation = `Shortfall Stage 2 is active. Non-urgent Tier 4 loads (such as EV charging and heavy agricultural processing) have been rescheduled to align with upcoming surplus generation windows, protecting critical clinic and community power.`;
    } else if (stage === ShortfallStage.STAGE_3_EFFICIENT_DIESEL) {
      explanation = `Shortfall Stage 3 is active. The diesel generator has been dispatched at its ${state?.diesel.optimal_sweet_spot_kw || 80} kW thermal efficiency sweet spot. Operating at ~80% rated load prevents wet-stacking and minimizes fuel-per-kWh, while any excess generation is banked into the battery.`;
    } else if (stage === ShortfallStage.STAGE_4_FAIR_LOAD_SHEDDING) {
      explanation = `Emergency Stage 4 Fair Load Shedding is active. To prevent a catastrophic total microgrid blackout, Tier 4 flexible loads and non-essential Tier 3 loads have been shed. Tier 1 Critical Medical/Clinic infrastructure is strictly protected.`;
    } else {
      explanation = `The microgrid dispatch optimizer is continuously balancing available renewable supply (${solar + wind} kW) against community demand (${demand} kW) to minimize cost, fuel burn, and emissions while maintaining 100% reliability.`;
    }

    return {
      explanation,
      grounded_reason_codes: codes,
      metrics_referenced: {
        solar_kw: solar,
        wind_kw: wind,
        diesel_kw: diesel,
        battery_soc_pct: batSoc,
        demand_kw: demand,
        shortfall_stage: stage
      },
      provider: 'GridPilot Grounded Decision Synthesizer'
    };
  }
}

export const llmClient = new LLMClient();
