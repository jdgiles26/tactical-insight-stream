import { useState } from "react";
import { useSearchDataProducts } from "@/hooks/useDataProducts";
import { DataProductTable } from "@/components/DataProductTable";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export default function DiscoveryPage() {
  const [query, setQuery] = useState("");
  const { data = [], isLoading } = useSearchDataProducts(query);

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Data Discovery</h2>
        <p className="text-sm text-muted-foreground font-mono">Search and discover tactical data products</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search data products by title... (e.g., 'recon', 'thermal', 'intercept')"
          className="bg-card border-border pl-10 text-sm"
        />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-5 py-3">
          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            {data.length} results {query && `for "${query}"`}
          </span>
        </div>
        <DataProductTable data={data} isLoading={isLoading} />
      </div>
    </div>
  );
}
