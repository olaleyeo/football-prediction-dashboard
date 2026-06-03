import type { APIMatch } from "@/types/match";
import { APIOdds } from "./oddsApi";



export interface PredictionResult {
  fixture: string;
  league: string;
  market: string;
  prediction: string;
  htFt: string | null;
  score: string | null;
  date: Date;
  bt: number;
  oi: number;
  edge: number;
  confidence: number;
  recommendation: string;
  status: string;
}

function clamp(x: number, minVal: number, maxVal: number): number {
  return Math.max(minVal, Math.min(maxVal, x));
}

function seededVariation(fixture: string, mod: number, scale: number): number {
  const seed = fixture.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return (seed % mod) * scale;
}

export function getCalibrated1X2Probs(stats: any, fixture: string): { pHome: number; pDraw: number; pAway: number } {
  const {
    GF_H, GA_H, GF_A, GA_A,
    Form_H, Form_A,
    League_avg_goals,
    recent_league_avg_goals,
    home_team_is_strong_at_home
  } = stats;

  // 1) Scoring environment
  const baseLeagueAvg =
    recent_league_avg_goals ||
    League_avg_goals ||
    2.7;

  const variation = seededVariation(fixture + "_1X2", 13, 0.06);

  // 2) Attack / defence strength
  const S_home_attack = clamp(GF_H / baseLeagueAvg, 0, 1.6);
  const S_away_attack = clamp(GF_A / baseLeagueAvg, 0, 1.6);
  const S_home_defence = clamp(1 - GA_H / baseLeagueAvg, -0.3, 1.3);
  const S_away_defence = clamp(1 - GA_A / baseLeagueAvg, -0.3, 1.3);

  // 3) Form & home advantage
  const S_form_home = clamp(Form_H, 0, 1);
  const S_form_away = clamp(Form_A, 0, 1);

  const homeAdv_raw = home_team_is_strong_at_home ? 1.22 : 1.05;
  const homeAdv = clamp(homeAdv_raw + variation, 0.90, 1.30);

  // 4) Tempo
  const tempo_home = clamp((GF_H + GA_H) / (2 * baseLeagueAvg), 0.4, 1.7);
  const tempo_away = clamp((GF_A + GA_A) / (2 * baseLeagueAvg), 0.4, 1.7);

  // 5) xG-style expectation
  const xG_home =
    baseLeagueAvg *
    (0.55 * S_home_attack +
     0.25 * (1 - S_away_defence) +
     0.20 * S_form_home) *
    homeAdv *
    tempo_home;

  const xG_away =
    baseLeagueAvg *
    (0.55 * S_away_attack +
     0.25 * (1 - S_home_defence) +
     0.20 * S_form_away) *
    (2 - homeAdv) *
    tempo_away;

  // 6) Strength scores
  const strengthHome =
    0.60 * xG_home -
    0.20 * xG_away +
    0.20 * homeAdv;

  const strengthAway =
    0.60 * xG_away -
    0.20 * xG_home +
    0.20 * (2 - homeAdv);

  // Normalize to positive
  const minStrength = Math.min(strengthHome, strengthAway, 0);
  const adjHome = strengthHome - minStrength + 0.05;
  const adjAway = strengthAway - minStrength + 0.05;

  // 7) Draw probability (calibrated)
  const diff = Math.abs(adjHome - adjAway);
  const similarity = clamp(1 - Math.pow(diff, 0.8), 0, 1);

  const scoreDraw =
    0.20 +                // base
    0.25 * similarity +   // similarity boost
    0.05 * (1 - tempo_home * tempo_away); // low-tempo boost

  const scoreDrawClamped = clamp(scoreDraw, 0.18, 0.38);

  // 8) Convert to probabilities
  const sumScores = adjHome + adjAway + scoreDrawClamped || 1;

  let pHome = adjHome / sumScores;
  let pDraw = scoreDrawClamped / sumScores;
  let pAway = adjAway / sumScores;

  // 9) Normalize
  const total = pHome + pDraw + pAway || 1;
  pHome /= total;
  pDraw /= total;
  pAway /= total;

  return { pHome, pDraw, pAway };
}

function computeBT(
  market: string,
  stats: any,
  fixture: string,
  line: number = 2.5
): { BT: number; prediction: string } {

  // ============================
  // 1X2 (calibrated with draw + away-strength logic)
  // ============================
  if (market === "1X2") {
    const { pHome, pDraw, pAway } = getCalibrated1X2Probs(stats, fixture);

    let prediction = "X (Draw)";
    let pModel = pDraw;

    if (pHome >= pDraw && pHome >= pAway) {
      prediction = "1 (Home Win)";
      pModel = pHome;
    } else if (pAway >= pHome && pAway >= pDraw) {
      prediction = "2 (Away Win)";
      pModel = pAway;
    }

    return { BT: pModel * 100, prediction };
  }

  // ============================
  // Double Chance (driven by calibrated 1X2 probs)
  // ============================
  if (market === "Double Chance") {
    const { pHome, pDraw, pAway } = getCalibrated1X2Probs(stats, fixture);

    const h = clamp(pHome, 0, 1);
    const d = clamp(pDraw, 0, 1);
    const a = clamp(pAway, 0, 1);
    const total = h + d + a || 1;

    const ph = h / total;
    const pd = d / total;
    const pa = a / total;

    const p1X = ph + pd;
    const p12 = ph + pa;
    const pX2 = pd + pa;

    let prediction = "12";
    let pModel = p12;

    if (p1X >= p12 && p1X >= pX2) {
      prediction = "1X";
      pModel = p1X;
    } else if (pX2 >= p12 && pX2 >= p1X) {
      prediction = "X2";
      pModel = pX2;
    }

    return { BT: pModel * 100, prediction };
  }

  // ============================
  // Over/Under TOTAL (calibrated synthetic-aware)
  // ============================
  if (market === "OU_TOTAL") {
    const {
      GF_H, GA_H, GF_A, GA_A,
      Form_H, Form_A,
      League_avg_goals,
      recent_league_avg_goals
    } = stats;

    // Higher global baseline when league data is weak
    const baseLeagueAvg =
      recent_league_avg_goals ||
      League_avg_goals ||
      2.7;

    const variation = seededVariation(fixture, 12, 0.10);

    const S_home_attack = clamp(GF_H / baseLeagueAvg, 0, 1.4);
    const S_away_attack = clamp(GF_A / baseLeagueAvg, 0, 1.4);
    const S_home_defence = clamp(1 - GA_H / baseLeagueAvg, -0.2, 1.2);
    const S_away_defence = clamp(1 - GA_A / baseLeagueAvg, -0.2, 1.2);

    // Tempo factor: high GF+GA → higher tempo → more goals
    const tempo_home = clamp((GF_H + GA_H) / (2 * baseLeagueAvg), 0, 1.5);
    const tempo_away = clamp((GF_A + GA_A) / (2 * baseLeagueAvg), 0, 1.5);
    const tempo = (tempo_home + tempo_away) / 2;

    // Mismatch amplified
    const mismatch =
      S_home_attack * (1 - S_away_defence) +
      S_away_attack * (1 - S_home_defence);

    // Trend weighting: if recent league avg is high, push xG up
    const trendBoost =
      recent_league_avg_goals && recent_league_avg_goals > 2.7
        ? 0.15
        : recent_league_avg_goals && recent_league_avg_goals < 2.3
        ? -0.10
        : 0;

    const xG_total =
      baseLeagueAvg *
      (0.40 * S_home_attack +
       0.40 * S_away_attack +
       0.25 * mismatch +
       0.20 * tempo) +
      trendBoost +
      variation;

    const pOver = 1 / (1 + Math.exp(-(xG_total - line)));
    const pUnder = 1 - pOver;

    const prediction = pOver >= pUnder ? `Over ${line}` : `Under ${line}`;
    const pModel = prediction.startsWith("Over") ? pOver : pUnder;

    return { BT: pModel * 100, prediction };
  }

  // ============================
  // Home Team Goals Over/Under (calibrated)
  // ============================
  if (market === "OU_HOME_GOALS") {
    const {
      GF_H, GA_A,
      Form_H,
      League_avg_goals,
      recent_league_avg_goals
    } = stats;

    const baseLeagueAvg =
      recent_league_avg_goals ||
      League_avg_goals ||
      2.7;

    const variation = seededVariation(fixture + "_H", 9, 0.08);

    const S_home_attack = clamp(GF_H / baseLeagueAvg, 0, 1.5);
    const S_away_defence = clamp(1 - GA_A / baseLeagueAvg, -0.2, 1.2);

    const tempo_home = clamp((GF_H + GA_A) / (2 * baseLeagueAvg), 0, 1.6);

    const xG_home =
      baseLeagueAvg *
      (0.55 * S_home_attack +
       0.25 * (1 - S_away_defence) +
       0.25 * tempo_home +
       0.15 * Form_H) +
      variation;

    const pOver = 1 / (1 + Math.exp(-(xG_home - line)));
    const pUnder = 1 - pOver;

    const prediction =
      pOver >= pUnder ? `Home Over ${line}` : `Home Under ${line}`;

    const pModel = prediction.includes("Over") ? pOver : pUnder;

    return { BT: pModel * 100, prediction };
  }

  // ============================
  // Away Team Goals Over/Under (calibrated)
  // ============================
  if (market === "OU_AWAY_GOALS") {
    const {
      GF_A, GA_H,
      Form_A,
      League_avg_goals,
      recent_league_avg_goals
    } = stats;

    const baseLeagueAvg =
      recent_league_avg_goals ||
      League_avg_goals ||
      2.7;

    const variation = seededVariation(fixture + "_A", 9, 0.08);

    const S_away_attack = clamp(GF_A / baseLeagueAvg, 0, 1.5);
    const S_home_defence = clamp(1 - GA_H / baseLeagueAvg, -0.2, 1.2);

    const tempo_away = clamp((GF_A + GA_H) / (2 * baseLeagueAvg), 0, 1.6);

    const xG_away =
      baseLeagueAvg *
      (0.55 * S_away_attack +
       0.25 * (1 - S_home_defence) +
       0.25 * tempo_away +
       0.15 * Form_A) +
      variation;

    const pOver = 1 / (1 + Math.exp(-(xG_away - line)));
    const pUnder = 1 - pOver;

    const prediction =
      pOver >= pUnder ? `Away Over ${line}` : `Away Under ${line}`;

    const pModel = prediction.includes("Over") ? pOver : pUnder;

    return { BT: pModel * 100, prediction };
  }

  // ============================
  // Draw No Bet (DNB)
  // ============================
  if (market === "DNB") {
    const { pHome, pDraw, pAway } = getCalibrated1X2Probs(stats, fixture);

    const pHomeDNB = pHome / (pHome + pAway);
    const pAwayDNB = pAway / (pHome + pAway);

    let prediction = "Home DNB";
    let pModel = pHomeDNB;

    if (pAwayDNB > pHomeDNB) {
      prediction = "Away DNB";
      pModel = pAwayDNB;
    }

    return { BT: pModel * 100, prediction };
  }

  // ============================
  // BTTS (with synthetic fallback)
  // ============================
  if (market === "BTTS") {
    const {
      GF_H, GA_H, GF_A, GA_A,
      Form_H, Form_A,
      League_avg_goals
    } = stats;

    const variation = seededVariation(fixture, 5, 0.05);

    const S_home_attack = clamp(GF_H / League_avg_goals, 0, 1);
    const S_away_attack = clamp(GF_A / League_avg_goals, 0, 1);
    const S_home_defence = clamp(1 - GA_H / League_avg_goals, 0, 1);
    const S_away_defence = clamp(1 - GA_A / League_avg_goals, 0, 1);

    const pHomeScores =
      0.55 * S_home_attack +
      0.25 * (1 - S_away_defence) +
      0.20 * Form_H +
      variation;

    const pAwayScores =
      0.55 * S_away_attack +
      0.25 * (1 - S_home_defence) +
      0.20 * Form_A +
      variation * 0.8;

    const pBTTS = clamp(pHomeScores * pAwayScores, 0, 1);
    const pNoBTTS = 1 - pBTTS;

    const prediction = pBTTS >= pNoBTTS ? "BTTS Yes" : "BTTS No";
    const pModel = prediction === "BTTS Yes" ? pBTTS : pNoBTTS;

    return { BT: pModel * 100, prediction };
  }

  // =====================================
  // Combined Corners Market (Over vs Under 7.5)
  // tuned slope + region + volatility + home advantage
  // =====================================
  if (market === "Corners_Combined") {
    const {
      corners_for_H,
      corners_against_H,
      corners_for_A,
      corners_against_A,
      GF_H, GA_H,
      GF_A, GA_A,
      League_avg_corners,
      recent_league_avg_corners,
      League_name,      // optional
      Country,          // optional
      Continent         // optional
    } = stats;

    // 1) League baseline
    const leagueBaseRaw =
      recent_league_avg_corners ||
      League_avg_corners ||
      8.4;

    // 2) Region / continent factor
    const name = (League_name || Country || Continent || "").toLowerCase();

    let regionFactor = 1.0;
    if (name.includes("brazil") || name.includes("brasileiro") || name.includes("south america")) {
      regionFactor = 1.08; // more corners
    } else if (name.includes("england") || name.includes("premier league") || name.includes("europe")) {
      regionFactor = 1.02;
    } else if (name.includes("usa") || name.includes("usl") || name.includes("mls")) {
      regionFactor = 1.05;
    } else if (name.includes("women") || name.includes("w league") || name.includes("womens")) {
      regionFactor = 0.95; // slightly fewer
    } else if (name.includes("africa") || name.includes("caf")) {
      regionFactor = 0.98;
    }

    // 3) League correction (per region)
    const leagueCorrection =
      clamp(leagueBaseRaw / 10.0, 0.70, 1.10) * regionFactor;

    // 4) Synthetic fallback
    const syntheticHome =
      (GF_H + GA_H) * 0.50 +
      seededVariation(fixture + "_cornersH", 21, 0.7);

    const syntheticAway =
      (GF_A + GA_A) * 0.50 +
      seededVariation(fixture + "_cornersA", 22, 0.7);

    const H_for = corners_for_H || syntheticHome;
    const H_against = corners_against_H || syntheticHome * 0.65;

    const A_for = corners_for_A || syntheticAway;
    const A_against = corners_against_A || syntheticAway * 0.65;

    // 5) Tempo
    const tempo =
      clamp(
        (GF_H + GA_H + GF_A + GA_A) / (2 * (leagueBaseRaw / 3)),
        0.55,
        1.20
      );

    // 6) Mismatch
    const mismatch =
      clamp(
        Math.abs(GF_H - GF_A) +
        Math.abs(GA_H - GA_A),
        0,
        4
      ) / 6;

    // 7) Corner volatility (how wild games are)
    const goalSpread = Math.abs(GF_H - GA_H) + Math.abs(GF_A - GA_A);
    const volatility =
      clamp(goalSpread / 4, 0.7, 1.3); // higher spread → more volatility

    // 8) Home‑corner advantage
    const rawHomeCornerRatio =
      (H_for + H_against + 0.1) / (A_for + A_against + 0.1);

    const homeCornerAdv =
      clamp(rawHomeCornerRatio, 0.85, 1.20); // >1 → home more corners

    // 9) Expected corners (raw)
    let xC_home =
      0.40 * H_for +
      0.25 * A_against +
      0.35 * leagueBaseRaw * tempo;

    let xC_away =
      0.40 * A_for +
      0.25 * H_against +
      0.35 * leagueBaseRaw * tempo;

    // apply home‑corner advantage
    xC_home *= homeCornerAdv;
    xC_away /= homeCornerAdv;

    // 10) Defensive bias
    const defensiveBias =
      clamp((GA_H + GA_A) / (GF_H + GF_A + 0.1), 0.75, 1.45);

    // 11) Final expected corners
    let xC_total =
      ((xC_home + xC_away) *
      (1 + 0.08 * mismatch) *
      volatility /
      defensiveBias) *
      leagueCorrection;

    // 12) Global dampening
    xC_total *= 0.80;

    // 13) Benchmark
    const line = 7.5;

    // 14) Tuned sigmoid slope
    const slope = 0.75; // softer → fewer 100% outputs

    const pOver =
      1 / (1 + Math.exp(-(slope * (xC_total - line))));

    const pUnder = 1 - pOver;

    const isOver = pOver >= pUnder;

    return {
      BT: (isOver ? pOver : pUnder) * 100,
      prediction: isOver ? "Over 7.5 Corners" : "Under 7.5 Corners"
    };
  }

  // ============================
  // Cards (synthetic fallback)
  // ============================
  if (market === "CARDS") {
    const {
      GF_H, GA_H, GF_A, GA_A,
      League_avg_cards,
      Referee_avg_cards
    } = stats;

    const variation = seededVariation(fixture, 6, 0.07);

    const aggression_home = clamp((GA_H + GF_H) / 2, 0, 1);
    const aggression_away = clamp((GA_A + GF_A) / 2, 0, 1);

    const refereeFactor = clamp(Referee_avg_cards / League_avg_cards, 0.6, 1.4);

    const xC_total =
      League_avg_cards *
      (0.45 * aggression_home +
       0.45 * aggression_away +
       0.10 * refereeFactor) +
      variation;

    const pOver = 1 / (1 + Math.exp(-(xC_total - line)));
    const pUnder = 1 - pOver;

    const prediction = pOver >= pUnder
      ? `Over ${line} Cards`
      : `Under ${line} Cards`;

    const pModel = prediction.includes("Over") ? pOver : pUnder;

    return { BT: pModel * 100, prediction };
  }

  // ============================
  // Fouls (synthetic fallback)
  // ============================
  if (market === "FOULS") {
    const {
      GF_H, GA_H, GF_A, GA_A,
      League_avg_fouls
    } = stats;

    const variation = seededVariation(fixture, 8, 0.09);

    const aggression_home = clamp((GA_H + GF_H) / 2, 0, 1);
    const aggression_away = clamp((GA_A + GF_A) / 2, 0, 1);

    const mismatch =
      Math.abs((GF_H - GA_A) - (GF_A - GA_H));

    const xF_total =
      League_avg_fouls *
      (0.40 * aggression_home +
       0.40 * aggression_away +
       0.20 * mismatch) +
      variation;

    const pOver = 1 / (1 + Math.exp(-(xF_total - line)));
    const pUnder = 1 - pOver;

    const prediction = pOver >= pUnder
      ? `Over ${line} Fouls`
      : `Under ${line} Fouls`;

    const pModel = prediction.includes("Over") ? pOver : pUnder;

    return { BT: pModel * 100, prediction };
  }

  return { BT: 50, prediction: "Unknown" };
}

export function runPredictionEngine(
  match: APIMatch,
  oddsData: APIOdds,
  marketType: string
): PredictionResult {

  const st = match.stats;

  let bt = 50;
  let predictionStr = "";
  let pMarket = 0.5;

  // ============================
  // 1X2
  // ============================
  if (marketType === "1X2") {
    const res = computeBT("1X2", st, match.fixture);
    bt = res.BT;
    predictionStr = res.prediction;

    if (predictionStr === "1 (Home Win)")
      pMarket = 1 / (oddsData.odds.home || 2.1);
    else if (predictionStr === "X (Draw)")
      pMarket = 1 / (oddsData.odds.draw || 3.4);
    else
      pMarket = 1 / (oddsData.odds.away || 3.5);
  }

  // ============================
  // Over/Under (generic)
  // ============================
  else if (marketType === "OU") {
    const line = oddsData.line || 2.5;
    const res = computeBT("OU_TOTAL", st, match.fixture, line);
    bt = res.BT;
    predictionStr = res.prediction;

    if (predictionStr.startsWith("Over"))
      pMarket = 1 / (oddsData.odds.over || 1.85);
    else
      pMarket = 1 / (oddsData.odds.under || 1.95);
  }

  // ============================
  // Home Team Goals
  // ============================
  else if (marketType === "HomeGoals") {
    const line = oddsData.line || 1.5;
    const res = computeBT("OU_HOME_GOALS", st, match.fixture, line);
    bt = res.BT;
    predictionStr = res.prediction;
    pMarket = 1 / (oddsData.odds.over || 1.9);
  }

  // ============================
  // Away Team Goals
  // ============================
  else if (marketType === "AwayGoals") {
    const line = oddsData.line || 1.5;
    const res = computeBT("OU_AWAY_GOALS", st, match.fixture, line);
    bt = res.BT;
    predictionStr = res.prediction;
    pMarket = 1 / (oddsData.odds.over || 1.9);
  }

  // ============================
  // Draw No Bet
  // ============================
  else if (marketType === "DNB") {
    const res = computeBT("DNB", st, match.fixture);
    bt = res.BT;
    predictionStr = res.prediction;

    const home = oddsData.odds.home || 2.1;
    const draw = oddsData.odds.draw || 3.4;
    const away = oddsData.odds.away || 3.5;

    const homeDNB = (home * draw) / (home + draw);
    const awayDNB = (away * draw) / (away + draw);

    if (predictionStr === "Home DNB")
      pMarket = 1 / homeDNB;
    else
      pMarket = 1 / awayDNB;
  }

  // ============================
  // BTTS
  // ============================
  else if (marketType === "BTTS") {
    const res = computeBT("BTTS", st, match.fixture);
    bt = res.BT;
    predictionStr = res.prediction;

    if (predictionStr === "BTTS Yes")
      pMarket = 1 / (oddsData.odds.yes || 1.7);
    else
      pMarket = 1 / (oddsData.odds.no || 2.1);
  }

  // ============================
  // Corners (Combined Over/Under 7.5)
  // ============================
  else if (marketType === "Corners_Combined") {
    const res = computeBT("Corners_Combined", st, match.fixture);
    bt = res.BT;
    predictionStr = res.prediction;
    
    if (predictionStr.includes("Over")) {
      pMarket = 1 / (oddsData.odds.over || 1.9);
    } else {
      pMarket = 1 / (oddsData.odds.under || 1.9);
    }
  }

  // ============================
  // Cards
  // ============================
  else if (marketType === "Cards") {
    const line = oddsData.line || 4.5;
    const res = computeBT("CARDS", st, match.fixture, line);
    bt = res.BT;
    predictionStr = res.prediction;
    pMarket = 1 / (oddsData.odds.over || 1.8);
  }

  // ============================
  // Fouls
  // ============================
  else if (marketType === "Fouls") {
    const line = oddsData.line || 24.5;
    const res = computeBT("FOULS", st, match.fixture, line);
    bt = res.BT;
    predictionStr = res.prediction;
    pMarket = 1 / (oddsData.odds.over || 1.9);
  }

  // ============================
  // Double Chance (1X / 12 / X2)
  // ============================
  else if (marketType === "DC") {
    const res = computeBT("Double Chance", st, match.fixture);
    bt = res.BT;
    predictionStr = res.prediction;

    const dc = oddsData.odds.doubleChance || {};
    let marketOdds = dc["1X"] || 1.3;

    if (predictionStr === "12") marketOdds = dc["12"] || 1.3;
    if (predictionStr === "X2") marketOdds = dc["X2"] || 1.3;

    pMarket = 1 / marketOdds;
  }

  const pModel = bt / 100;
  const edge = pModel - pMarket;

  const OI_raw = 50 + 200 * edge;
  const oi = clamp(OI_raw, 0, 100);

  const confidence = 0.6 * bt + 0.4 * oi;

  let recommendation = "PASS";
  if (confidence >= 80 && edge >= 0.07) recommendation = "ELITE";
  else if (confidence >= 70 && edge >= 0.04) recommendation = "STRONG";
  else if (confidence >= 60 && edge >= 0.02) recommendation = "GOOD";

  return {
    fixture: match.fixture,
    league: match.league,
    market: marketType,
    prediction: predictionStr,
    htFt: null,
    score: null,
    date: match.date,
    bt: Math.round(bt),
    oi: Math.round(oi),
    edge: parseFloat(edge.toFixed(3)),
    confidence: Math.round(confidence),
    recommendation,
    status: match.status
  };
}
