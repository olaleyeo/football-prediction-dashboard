import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PredictionResult } from "@/lib/services/predictionEngine";

export function PredictionTable({ predictions }: { predictions: PredictionResult[] }) {
  // Custom recommendation badges and prediction icons are styled in globals.css

  const getConfColor = (conf: number) => {
    if (conf >= 80) return "text-green-600 dark:text-green-400 font-bold";
    if (conf >= 60) return "text-yellow-600 dark:text-yellow-500 font-bold";
    return "text-slate-600 dark:text-slate-400";
  };

  const sortedPredictions = [...predictions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="rounded-md border bg-white dark:bg-black overflow-hidden">
      <Table className="pred-table">
        <TableHeader>
          <TableRow className="bg-slate-50 dark:bg-slate-900">
            <TableHead>Date</TableHead>
            <TableHead>Time</TableHead>
            <TableHead className="w-[120px] league">League</TableHead>
            <TableHead className="w-[320px] fixture">Fixture</TableHead>
            <TableHead className="w-[140px] prediction">Prediction</TableHead>
            <TableHead className="w-[90px] text-center rec">Recommendation</TableHead>
            <TableHead className="text-right">BT</TableHead>
            <TableHead className="text-right">OI</TableHead>
            <TableHead className="text-right">Confidence</TableHead>
            <TableHead className="text-right">Edge</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {predictions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                No predictions found. Adjust filters to load live data.
              </TableCell>
            </TableRow>
          ) : (
            sortedPredictions.map((p, idx) => {
              const matchDate = new Date(p.date);
              const matchTime = matchDate.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
              });

              let displayStatus = "";
              let badgeColor = "";
              const st = p.status?.toUpperCase() || "";

              if (["1H", "2H", "ET", "LIVE"].includes(st)) {
                displayStatus = "LIVE";
                badgeColor = "bg-red-500 text-white border-red-500";
              } else if (st === "HT") {
                displayStatus = "HT";
                badgeColor = "bg-yellow-500 text-white border-yellow-500";
              } else if (st === "FT") {
                displayStatus = "FT";
                badgeColor = "bg-slate-400 text-white border-slate-400";
              }

              const predLower = p.prediction.toLowerCase();
              const iconClass = predLower.includes("over") ? "over" : predLower.includes("under") ? "under" : "";

              return (
                <TableRow key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground" data-label="Date">
                    {format(matchDate, "MMM dd, yyyy")}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm" data-label="Time">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-slate-700 dark:text-slate-300">{matchTime}</span>
                      {displayStatus && (
                        <Badge variant="outline" className={`w-max text-[10px] px-1.5 py-0 leading-tight ${badgeColor}`}>
                          {displayStatus}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                <TableCell className="w-[120px] font-medium text-sm text-slate-600 dark:text-slate-300 league" title={p.league} data-label="League">
                  {p.league}
                </TableCell>
                <TableCell className="w-[320px] min-w-[320px] font-bold text-sm fixture" title={p.fixture} data-label="Fixture">{p.fixture}</TableCell>
                <TableCell className="w-[140px] text-sm font-medium text-blue-600 dark:text-blue-400 prediction" title={p.prediction} data-label="Prediction">
                  {iconClass && <span className={`pred-icon ${iconClass}`}></span>}
                  {p.prediction}
                </TableCell>
                <TableCell className="w-[90px] text-center rec" data-label="Rec">
                  <span className={`badge ${p.recommendation?.toLowerCase() || "pass"}`}>
                    {p.recommendation || "PASS"}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono text-sm" data-label="BT">{p.bt}</TableCell>
                <TableCell className="text-right font-mono text-sm" data-label="OI">{p.oi}</TableCell>
                <TableCell className={`text-right ${getConfColor(p.confidence)}`} data-label="Confidence">
                  {p.confidence}%
                </TableCell>
                <TableCell className="text-right font-bold text-slate-700 dark:text-slate-200" data-label="Edge">
                  {(p.edge * 100).toFixed(1)}%
                </TableCell>
              </TableRow>
            );
          })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
