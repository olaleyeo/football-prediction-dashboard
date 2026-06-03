import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface FilterBarProps {
  filters: { date: string; league: string; market: string; };
  onFilterChange: (key: string, value: string) => void;
}

export function FilterBar({ filters, onFilterChange }: FilterBarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-6">
      <Input 
        type="date"
        value={filters.date}
        onChange={(e) => onFilterChange("date", e.target.value)}
        className="w-full sm:w-[180px]"
      />
      <Input 
        placeholder="League (e.g. Premier League)" 
        value={filters.league}
        onChange={(e) => onFilterChange("league", e.target.value)}
        className="w-full sm:w-[220px]"
      />
      <Select value={filters.market} onValueChange={(val) => onFilterChange("market", val || "")}>
        <SelectTrigger className="w-full sm:w-[220px]">
          <SelectValue placeholder="Select Market" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1X2">Match Winner (1X2)</SelectItem>
          <SelectItem value="DC">Double Chance</SelectItem>
          <SelectItem value="DNB">Draw No Bet</SelectItem>
          <SelectItem value="OU">Over/Under Goals</SelectItem>
          <SelectItem value="HomeGoals">Home Team Goals O/U</SelectItem>
          <SelectItem value="AwayGoals">Away Team Goals O/U</SelectItem>
          <SelectItem value="BTTS">BTTS</SelectItem>
          <SelectItem value="Corners_Combined">Corners (Over/Under 7.5)</SelectItem>
          <SelectItem value="Cards">Cards (Over/Under)</SelectItem>
          
          <SelectItem value="Race5" disabled>Race to 5 Corners (Premium)</SelectItem>
          <SelectItem value="AHC_Corners" disabled>Asian Corners (Premium)</SelectItem>
          <SelectItem value="CorrectScore" disabled>Correct Score (xG Model) (Premium)</SelectItem>
          <SelectItem value="PlayerCards" disabled>Player Cards (Premium)</SelectItem>
        </SelectContent>
      </Select>
      <Button variant="secondary" onClick={() => {
        onFilterChange("date", new Date().toISOString().split("T")[0]);
        onFilterChange("league", "");
        onFilterChange("market", "1X2");
      }}>Reset Filters</Button>
    </div>
  );
}
