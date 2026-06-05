import type { APIMatch } from "@/types/match";

export interface APIOdds {
  matchId: string;
  marketType: string;
  line?: number;
  odds: {
    home?: number;
    draw?: number;
    away?: number;
    over?: number;
    under?: number;
    yes?: number;
    no?: number;
    doubleChance?: {
      "1X"?: number;
      "X2"?: number;
      "12"?: number;
    };
  };
}

// Simple team name matching helper
function isSameTeam(name1: string, name2: string): boolean {
  if (!name1 || !name2) return false;
  const n1 = name1.toLowerCase().replace(/[^a-z0-9]/g, "");
  const n2 = name2.toLowerCase().replace(/[^a-z0-9]/g, "");
  return n1.includes(n2) || n2.includes(n1);
}

export async function fetchOdds(matches: APIMatch[], marketType: string): Promise<APIOdds[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey || apiKey.includes("your_the_odds_api_key")) {
    throw new Error("The-Odds-API key is missing or not configured.");
  }

  try {
    // The-Odds-API implementation
    const res = await fetch(`https://api.the-odds-api.com/v4/sports/upcoming/odds/?apiKey=${apiKey}&regions=eu,uk&markets=h2h,totals`, {
      next: { revalidate: 300 }
    });
    
    if (!res.ok) throw new Error("Failed to fetch from The-Odds-API");

    const data = await res.json();
    
    return matches.map(match => {
      // Find matching match in OddsAPI by fuzzy matching home and away names
      const oddsMatch = data.find((o: any) => 
        isSameTeam(o.home_team, match.homeTeam) && isSameTeam(o.away_team, match.awayTeam)
      );

      const h2h = oddsMatch?.bookmakers?.[0]?.markets?.find((m: any) => m.key === "h2h");
      const totals = oddsMatch?.bookmakers?.[0]?.markets?.find((m: any) => m.key === "totals");

      if (marketType === "1X2") {
        return { 
          matchId: match.id, 
          marketType, 
          odds: { 
            home: h2h?.outcomes.find((o:any) => isSameTeam(o.name, match.homeTeam))?.price || 2.1, 
            draw: h2h?.outcomes.find((o:any) => o.name === "Draw")?.price || 3.4, 
            away: h2h?.outcomes.find((o:any) => isSameTeam(o.name, match.awayTeam))?.price || 3.5 
          } 
        };
      } else if (marketType === "OU") {
        const overOutcome = totals?.outcomes.find((o:any) => o.name === "Over");
        const underOutcome = totals?.outcomes.find((o:any) => o.name === "Under");
        return { 
          matchId: match.id, 
          marketType, 
          line: overOutcome?.point || 2.5, 
          odds: { 
            over: overOutcome?.price || 1.85, 
            under: underOutcome?.price || 1.95 
          } 
        };
      }

      return { matchId: match.id, marketType, odds: {} };
    });

  } catch (error: any) {
    console.error("The-Odds-API Error:", error);
    throw new Error(error.message || "Failed to fetch from The-Odds-API");
  }
}

