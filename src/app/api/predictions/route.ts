import { NextResponse } from "next/server";
import { fetchFixtures } from "@/lib/services/apiFootball";
import { fetchOdds } from "@/lib/services/oddsApi";
import { runPredictionEngine } from "@/lib/services/predictionEngine";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const league = searchParams.get("league") || "";
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];
    const market = searchParams.get("market") || "1X2";

    // 1. Fetch live matches & stats
    const matches = await fetchFixtures(date, league);
    
    // 2. Fetch odds for these matches
    const oddsList = await fetchOdds(matches, market);

    // 3. Run prediction engine
    const predictions = matches.map(match => {
      const matchOdds = oddsList.find(o => o.matchId === match.id);
      if (!matchOdds) return null;
      return runPredictionEngine(match, matchOdds, market);
    }).filter(Boolean);

    return NextResponse.json(predictions);
  } catch (error) {
    console.error("Error in predictions API:", error);
    return NextResponse.json({ error: "Failed to generate predictions" }, { status: 500 });
  }
}
