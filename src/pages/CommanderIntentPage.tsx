import { useState } from "react";
import { useCommanderIntents, useCreateIntent, useToggleIntent, useDeleteIntent } from "@/hooks/useCommanderIntents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Crosshair, Plus, Trash2, ToggleLeft, ToggleRight, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const CATEGORIES = ["vessel", "person", "weapon", "cargo", "activity", "location", "general"] as const;

export default function CommanderIntentPage() {
  const { data: intents, isLoading } = useCommanderIntents();
  const createIntent = useCreateIntent();
  const toggleIntent = useToggleIntent();
  const deleteIntent = useDeleteIntent();

  const [term, setTerm] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("general");

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim()) return;
    createIntent.mutate(
      { term: term.trim(), description: description.trim() || undefined, category },
      {
        onSuccess: () => {
          toast.success(`Intent added: ${term}`);
          setTerm("");
          setDescription("");
        },
        onError: (err) => toast.error("Failed: " + err.message),
      }
    );
  };

  const activeCount = intents?.filter((i) => i.is_active).length ?? 0;

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Commander's Intent</h2>
        <p className="text-sm text-muted-foreground font-mono">
          Define objects of interest for automated detection and correlation alerts
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Add Intent Form */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-mono uppercase tracking-wider text-muted-foreground">
            <Crosshair className="h-4 w-4" /> Add Object of Interest
          </h3>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Term / Keyword</label>
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="e.g., submarine, speedboat, weapon..."
                className="bg-secondary border-border"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Description (optional)</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Context or details..."
                className="bg-secondary border-border"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={createIntent.isPending || !term.trim()} className="w-full">
              {createIntent.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add to Watch List
            </Button>
          </form>
        </div>

        {/* Active Intents */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-mono uppercase tracking-wider text-muted-foreground">
              <Crosshair className="h-4 w-4" /> Watch List
            </h3>
            <span className="rounded bg-primary/20 px-2 py-0.5 text-xs font-mono text-primary">
              {activeCount} active
            </span>
          </div>
          <ScrollArea className="h-[380px]">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !intents?.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground font-mono">
                No objects of interest defined yet
              </p>
            ) : (
              <div className="space-y-2">
                {intents.map((intent) => (
                  <div
                    key={intent.id}
                    className={`flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors ${
                      intent.is_active
                        ? "border-primary/30 bg-primary/5"
                        : "border-border bg-secondary/30 opacity-60"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{intent.term}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono uppercase text-muted-foreground">
                          {intent.category}
                        </span>
                        {intent.description && (
                          <span className="truncate text-[10px] text-muted-foreground">{intent.description}</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleIntent.mutate({ id: intent.id, is_active: !intent.is_active })}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title={intent.is_active ? "Deactivate" : "Activate"}
                    >
                      {intent.is_active ? (
                        <ToggleRight className="h-5 w-5 text-primary" />
                      ) : (
                        <ToggleLeft className="h-5 w-5" />
                      )}
                    </button>
                    <button
                      onClick={() =>
                        deleteIntent.mutate(intent.id, {
                          onSuccess: () => toast.success("Removed: " + intent.term),
                        })
                      }
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
