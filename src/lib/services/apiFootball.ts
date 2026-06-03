import type { APIMatch } from "@/types/match";

// Helper to convert form string like "WWDL" to a 0-1 index
function calculateFormIndex(formStr: string): number {
  if (!formStr) return 0.5;
  let score = 0;
  for (const char of formStr) {
    if (char === 'W') score += 1;
    else if (char === 'D') score += 0.5;
  }
  return score / formStr.length;
}

export async function fetchFixtures(date: string, leagueNameFilter: string): Promise<APIMatch[]> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey || apiKey.includes("your_api_football_key")) {
    return getMockFixtures(date, leagueNameFilter);
  }

  try {
    const res = await fetch(`https://v3.football.api-sports.io/fixtures?date=${date}&timezone=Europe/London`, {
      headers: { "x-apisports-key": apiKey },
      next: { revalidate: 300 }
    });
    
    if (!res.ok) throw new Error("Failed to fetch fixtures from API-Football");
    
    const data = await res.json();
    let fixtures = data.response || [];

    // Filter out finished, cancelled, or postponed matches
    fixtures = fixtures.filter((f: any) => 
      !['FT', 'AET', 'PEN', 'CANC', 'PST', 'ABD'].includes(f.fixture.status.short)
    );

    if (leagueNameFilter) {
      fixtures = fixtures.filter((f: any) => 
        f.league.name.toLowerCase().includes(leagueNameFilter.toLowerCase())
      );
    }

    // Identify unique leagues to fetch standings
    const leagueMap = new Map<string, any>();
    for (const f of fixtures) {
      const key = `${f.league.id}-${f.league.season}`;
      if (!leagueMap.has(key)) {
        leagueMap.set(key, { id: f.league.id, season: f.league.season });
      }
    }

    // Fetch standings to extract real GF, GA, and Form without exhausting the API limit
    const standingsCache = new Map<number, any>();
    const leagueStatsCache = new Map<number, { avgGoals: number }>();

    for (const { id, season } of Array.from(leagueMap.values())) {
      try {
        const stdRes = await fetch(`https://v3.football.api-sports.io/standings?league=${id}&season=${season}`, {
          headers: { "x-apisports-key": apiKey },
          next: { revalidate: 3600 }
        });
        if (stdRes.ok) {
          const stdData = await stdRes.json();
          const standings = stdData.response?.[0]?.league?.standings?.[0] || [];
          
          let totalGoals = 0;
          let totalMatches = 0;

          for (const team of standings) {
            const played = team.all.played || 1;
            const gf = team.all.goals.for || 0;
            const ga = team.all.goals.against || 0;
            
            totalGoals += (gf + ga);
            totalMatches += played;

            standingsCache.set(team.team.id, {
              gfPerMatch: gf / played,
              gaPerMatch: ga / played,
              form: calculateFormIndex(team.form)
            });
          }

          leagueStatsCache.set(id, {
            avgGoals: totalMatches > 0 ? totalGoals / totalMatches : 2.5
          });
        }
      } catch (e) {
        console.error("Failed to fetch standings for league", id, e);
      }
    }

    return fixtures.map((f: any) => {
      const hTeamId = f.teams.home.id;
      const aTeamId = f.teams.away.id;
      
      const hStats = standingsCache.get(hTeamId) || { gfPerMatch: 1.5, gaPerMatch: 1.5, form: 0.5 };
      const aStats = standingsCache.get(aTeamId) || { gfPerMatch: 1.5, gaPerMatch: 1.5, form: 0.5 };
      const lStats = leagueStatsCache.get(f.league.id) || { avgGoals: 2.5 };

      return {
        id: f.fixture.id.toString(),
        fixture: `${f.teams.home.name} vs ${f.teams.away.name}`,
        homeTeam: f.teams.home.name,
        awayTeam: f.teams.away.name,
        league: f.league.name,
        date: new Date(f.fixture.date),
        status: f.fixture.status.short,
        stats: {
          GF_H: hStats.gfPerMatch, GA_H: hStats.gaPerMatch, 
          GF_A: aStats.gfPerMatch, GA_A: aStats.gaPerMatch,
          BTTS_rate_H: 0.5, BTTS_rate_A: 0.5, 
          League_avg_goals: lStats.avgGoals, League_BTTS_rate: 0.5,
          League_avg_shots: 10, League_avg_corners: 10, League_avg_cards: 4, League_avg_fouls: 22,
          Form_H: hStats.form, Form_A: aStats.form, home_team_is_strong_at_home: hStats.form > 0.6,
          CornersFor_H: 5, CornersAgainst_H: 5, CornersFor_A: 5, CornersAgainst_A: 5,
          CardsFor_H: 2, CardsAgainst_H: 2, CardsFor_A: 2, CardsAgainst_A: 2,
          FoulsFor_H: 11, FoulsAgainst_H: 11, FoulsFor_A: 11, FoulsAgainst_A: 11,
          Referee_avg_cards: 4, Shots_H: 12, Shots_A: 12
        }
      };
    });
  } catch (error) {
    console.error("API-Football Error:", error);
    return getMockFixtures(date, leagueNameFilter);
  }
}

function getMockFixtures(date: string, league: string): APIMatch[] {
  return [
    {
      id: "mock_1",
      fixture: "Arsenal vs Chelsea",
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      league: league || "Premier League",
      date: new Date(date),
      status: "NS",
      stats: {
        GF_H: 2.1, GA_H: 0.9, GF_A: 1.5, GA_A: 1.2,
        BTTS_rate_H: 0.6, BTTS_rate_A: 0.55,
        League_avg_goals: 2.8, League_BTTS_rate: 0.52,
        League_avg_shots: 10.5, League_avg_corners: 9.8, League_avg_cards: 4.2, League_avg_fouls: 22.1,
        Form_H: 0.8, Form_A: 0.6, home_team_is_strong_at_home: true,
        CornersFor_H: 6.2, CornersAgainst_H: 4.1, CornersFor_A: 5.1, CornersAgainst_A: 4.9,
        CardsFor_H: 1.8, CardsAgainst_H: 2.1, CardsFor_A: 2.2, CardsAgainst_A: 1.9,
        FoulsFor_H: 10.5, FoulsAgainst_H: 11.2, FoulsFor_A: 12.1, FoulsAgainst_A: 10.8,
        Referee_avg_cards: 4.5, Shots_H: 14.5, Shots_A: 11.2
      }
    }
  ];
}
