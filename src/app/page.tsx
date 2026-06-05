"use client";

import { useState, useEffect } from "react";
import { PredictionResult } from "@/lib/services/predictionEngine";
import { FilterBar } from "@/components/FilterBar";
import { PredictionTable } from "@/components/PredictionTable";
import { Loader2 } from "lucide-react";

export default function Dashboard() {
  const [predictions, setPredictions] = useState<PredictionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    date: new Date().toISOString().split("T")[0],
    league: "",
    market: "1X2",
  });

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.date) params.append("date", filters.date);
      if (filters.league) params.append("league", filters.league);
      if (filters.market) params.append("market", filters.market);

      const res = await fetch(`/api/predictions?${params.toString()}`);
      if (res.ok) {
        setPredictions(await res.json());
      } else {
        const data = await res.json();
        setError(data.error || "An unexpected error occurred");
      }
    } catch (error: any) {
      console.error("Failed to fetch predictions", error);
      setError(error.message || "Failed to fetch predictions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filters]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        <div className="mb-8">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
            Dudu Odds Intelligence
          </h1>
          <p className="text-muted-foreground mt-1">Live data, smart predictions, and real-time edge calculations.</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 mb-8">
          <div className="mb-2">
            <h2 className="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-200">Markets & Filters</h2>
            <FilterBar filters={filters} onFilterChange={handleFilterChange} />
          </div>

          {loading ? (
            <div className="py-24 flex justify-center items-center flex-col">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-4" />
              <p className="text-muted-foreground font-medium">Fetching live odds and running prediction engine...</p>
            </div>
          ) : error ? (
            <div className="py-12 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900 rounded-xl flex justify-center items-center flex-col text-center px-4">
              <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded-full mb-4">
                <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-red-800 dark:text-red-300 mb-2">Failed to load predictions</h3>
              <p className="text-red-600 dark:text-red-400 max-w-lg">{error}</p>
            </div>
          ) : (
            <PredictionTable predictions={predictions} />
          )}
        </div>

      </div>
    </div>
  );
}
