/**
 * Local in-memory data store that implements the Supabase client interface.
 * Falls back gracefully when the Supabase backend is unavailable.
 * Data persists in localStorage across page reloads.
 */

type Row = Record<string, any>;
type Listener = (payload: { eventType: string; new: Row; old: Row | null }) => void;

const STORAGE_KEY = "mdg_local_store";

class Store {
  private tables: Record<string, Row[]> = {};
  private listeners: Record<string, Listener[]> = {};

  constructor() {
    this.load();
  }

  private load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.tables = JSON.parse(raw);
    } catch {}
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tables));
    } catch {}
  }

  getTable(name: string): Row[] {
    if (!this.tables[name]) this.tables[name] = [];
    return this.tables[name];
  }

  insert(table: string, rows: Row[]): Row[] {
    const t = this.getTable(table);
    const inserted: Row[] = [];
    for (const row of rows) {
      const newRow = {
        id: row.id || crypto.randomUUID(),
        created_at: row.created_at || new Date().toISOString(),
        updated_at: row.updated_at || new Date().toISOString(),
        ...row,
      };
      t.push(newRow);
      inserted.push(newRow);
      this.emit(table, "INSERT", newRow, null);
    }
    this.save();
    return inserted;
  }

  update(table: string, updates: Row, filter: (row: Row) => boolean): Row[] {
    const t = this.getTable(table);
    const updated: Row[] = [];
    for (let i = 0; i < t.length; i++) {
      if (filter(t[i])) {
        const old = { ...t[i] };
        t[i] = { ...t[i], ...updates, updated_at: new Date().toISOString() };
        updated.push(t[i]);
        this.emit(table, "UPDATE", t[i], old);
      }
    }
    this.save();
    return updated;
  }

  delete(table: string, filter: (row: Row) => boolean): Row[] {
    const t = this.getTable(table);
    const deleted: Row[] = [];
    const remaining: Row[] = [];
    for (const row of t) {
      if (filter(row)) {
        deleted.push(row);
        this.emit(table, "DELETE", row, row);
      } else {
        remaining.push(row);
      }
    }
    this.tables[table] = remaining;
    this.save();
    return deleted;
  }

  subscribe(table: string, listener: Listener) {
    if (!this.listeners[table]) this.listeners[table] = [];
    this.listeners[table].push(listener);
  }

  unsubscribe(table: string, listener: Listener) {
    if (this.listeners[table]) {
      this.listeners[table] = this.listeners[table].filter((l) => l !== listener);
    }
  }

  private emit(table: string, eventType: string, newRow: Row, oldRow: Row | null) {
    for (const l of this.listeners[table] || []) {
      try { l({ eventType, new: newRow, old: oldRow }); } catch {}
    }
  }
}

const store = new Store();

// ── Query Builder ──────────────────────────────────────────────────

class QueryBuilder {
  private _table: string;
  private _filters: Array<(row: Row) => boolean> = [];
  private _orderBy: { col: string; asc: boolean }[] = [];
  private _limitN: number | null = null;
  private _selectCols: string | null = null;
  private _returnSingle = false;
  private _returnMaybeSingle = false;
  private _mode: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private _insertData: Row[] = [];
  private _updateData: Row = {};
  private _doSelect = false;
  private _headOnly = false;
  private _countMode: string | null = null;

  constructor(table: string) {
    this._table = table;
  }

  // ── SELECT ──
  select(cols?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.head) {
      this._headOnly = true;
      this._countMode = opts.count || null;
    }
    if (this._mode !== "insert" && this._mode !== "update" && this._mode !== "upsert") {
      this._mode = "select";
    }
    this._selectCols = cols || "*";
    this._doSelect = true;
    return this;
  }

  // ── INSERT ──
  insertOp(data: Row | Row[]) {
    this._mode = "insert";
    this._insertData = Array.isArray(data) ? data : [data];
    return this;
  }

  // ── UPDATE ──
  updateOp(data: Row) {
    this._mode = "update";
    this._updateData = data;
    return this;
  }

  // ── DELETE ──
  deleteOp() {
    this._mode = "delete";
    return this;
  }

  // ── UPSERT ──
  upsertOp(data: Row | Row[]) {
    this._mode = "upsert";
    this._insertData = Array.isArray(data) ? data : [data];
    return this;
  }

  // ── FILTERS ──
  eq(col: string, val: any) {
    this._filters.push((r) => r[col] === val);
    return this;
  }

  neq(col: string, val: any) {
    this._filters.push((r) => r[col] !== val);
    return this;
  }

  in(col: string, vals: any[]) {
    this._filters.push((r) => vals.includes(r[col]));
    return this;
  }

  not(col: string, op: string, val: any) {
    if (op === "is" && val === null) {
      this._filters.push((r) => r[col] != null);
    } else {
      this._filters.push((r) => r[col] !== val);
    }
    return this;
  }

  ilike(col: string, pattern: string) {
    const regex = new RegExp(
      pattern.replace(/%/g, ".*").replace(/_/g, "."),
      "i"
    );
    this._filters.push((r) => regex.test(String(r[col] ?? "")));
    return this;
  }

  gte(col: string, val: any) {
    this._filters.push((r) => r[col] >= val);
    return this;
  }

  lte(col: string, val: any) {
    this._filters.push((r) => r[col] <= val);
    return this;
  }

  gt(col: string, val: any) {
    this._filters.push((r) => r[col] > val);
    return this;
  }

  lt(col: string, val: any) {
    this._filters.push((r) => r[col] < val);
    return this;
  }

  is(col: string, val: any) {
    if (val === null) {
      this._filters.push((r) => r[col] == null);
    } else {
      this._filters.push((r) => r[col] === val);
    }
    return this;
  }

  // ── OR FILTER ──
  or(filterStr: string) {
    const parts = filterStr.split(",");
    const orFilters = parts.map((part) => {
      const [col, op, ...rest] = part.split(".");
      const val = rest.join(".");
      return (row: Row) => {
        const cellVal = row[col];
        switch (op) {
          case "eq":
            return String(cellVal) === val;
          case "neq":
            return String(cellVal) !== val;
          case "gt":
            return cellVal > val;
          case "gte":
            return cellVal >= val;
          case "lt":
            return cellVal < val;
          case "lte":
            return cellVal <= val;
          case "ilike": {
            const regex = new RegExp(
              val.replace(/%/g, ".*").replace(/_/g, "."),
              "i"
            );
            return regex.test(String(cellVal ?? ""));
          }
          case "like": {
            const regex = new RegExp(
              val.replace(/%/g, ".*").replace(/_/g, "."),
            );
            return regex.test(String(cellVal ?? ""));
          }
          case "is":
            if (val === "null") return cellVal == null;
            if (val === "true") return cellVal === true;
            if (val === "false") return cellVal === false;
            return cellVal === val;
          default:
            return String(cellVal) === val;
        }
      };
    });
    this._filters.push((row) => orFilters.some((f) => f(row)));
    return this;
  }

  // ── ORDERING ──
  order(col: string, opts?: { ascending?: boolean }) {
    this._orderBy.push({ col, asc: opts?.ascending ?? true });
    return this;
  }

  // ── LIMIT ──
  limit(n: number) {
    this._limitN = n;
    return this;
  }

  // ── SINGLE / MAYBE SINGLE ──
  single() {
    this._returnSingle = true;
    return this as any;
  }

  maybeSingle() {
    this._returnMaybeSingle = true;
    return this as any;
  }

  // ── Promise-compatible thenable ──
  then(resolve: (val: any) => any, reject?: (err: any) => any) {
    return Promise.resolve().then(() => this.execute()).then(resolve, reject);
  }

  catch(handler: any) {
    return Promise.resolve().then(() => this.execute()).catch(handler);
  }

  finally(handler: any) {
    return Promise.resolve().then(() => this.execute()).finally(handler);
  }

  private execute(): { data: any; error: any; count?: number } {
    try {
      if (this._mode === "insert") {
        const inserted = store.insert(this._table, this._insertData);
        if (this._returnSingle) {
          return { data: inserted[0] ?? null, error: null };
        }
        return { data: inserted, error: null };
      }

      if (this._mode === "update") {
        const filterFn = this.buildFilter();
        const updated = store.update(this._table, this._updateData, filterFn);
        if (this._returnSingle) {
          return { data: updated[0] ?? null, error: null };
        }
        return { data: updated, error: null };
      }

      if (this._mode === "delete") {
        const filterFn = this.buildFilter();
        const deleted = store.delete(this._table, filterFn);
        return { data: deleted, error: null };
      }

      if (this._mode === "upsert") {
        const results: Row[] = [];
        for (const row of this._insertData) {
          const existing = store.getTable(this._table).find((r) => r.id === row.id);
          if (existing) {
            store.update(this._table, row, (r) => r.id === row.id);
            results.push({ ...existing, ...row });
          } else {
            const inserted = store.insert(this._table, [row]);
            results.push(inserted[0]);
          }
        }
        if (this._returnSingle) return { data: results[0] ?? null, error: null };
        return { data: results, error: null };
      }

      // SELECT
      let rows = [...store.getTable(this._table)];
      const filterFn = this.buildFilter();
      rows = rows.filter(filterFn);

      // Apply ordering
      for (const { col, asc } of [...this._orderBy].reverse()) {
        rows.sort((a, b) => {
          const av = a[col], bv = b[col];
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          if (av < bv) return asc ? -1 : 1;
          if (av > bv) return asc ? 1 : -1;
          return 0;
        });
      }

      // HEAD-only mode: return count without data
      if (this._headOnly) {
        return { data: null, error: null, count: rows.length };
      }

      // Apply limit
      if (this._limitN != null) rows = rows.slice(0, this._limitN);

      // Column projection
      if (this._selectCols && this._selectCols !== "*") {
        const cols = this._selectCols.split(",").map((c) => c.trim());
        rows = rows.map((r) => {
          const projected: Row = {};
          for (const c of cols) projected[c] = r[c];
          return projected;
        });
      }

      if (this._returnSingle) {
        return { data: rows[0] ?? null, error: rows.length === 0 ? null : null };
      }
      if (this._returnMaybeSingle) {
        return { data: rows[0] ?? null, error: null };
      }

      return { data: rows, error: null };
    } catch (e: any) {
      return { data: null, error: { message: e.message } };
    }
  }

  private buildFilter(): (row: Row) => boolean {
    if (this._filters.length === 0) return () => true;
    return (row: Row) => this._filters.every((f) => f(row));
  }
}

// ── Insert/Update Builder (chainable after insert/update, supporting .select().single()) ──

class InsertBuilder {
  private qb: QueryBuilder;

  constructor(table: string, data: Row | Row[]) {
    this.qb = new QueryBuilder(table);
    (this.qb as any)._mode = "insert";
    (this.qb as any)._insertData = Array.isArray(data) ? data : [data];
  }

  select(cols?: string) {
    this.qb.select(cols);
    return this;
  }

  single() {
    this.qb.single();
    return this;
  }

  then(resolve: any, reject?: any) {
    return this.qb.then(resolve, reject);
  }

  catch(handler: any) {
    return this.qb.catch(handler);
  }

  finally(handler: any) {
    return this.qb.finally(handler);
  }
}

class UpdateBuilder {
  private qb: QueryBuilder;

  constructor(table: string, data: Row) {
    this.qb = new QueryBuilder(table);
    (this.qb as any)._mode = "update";
    (this.qb as any)._updateData = data;
  }

  eq(col: string, val: any) { this.qb.eq(col, val); return this; }
  neq(col: string, val: any) { this.qb.neq(col, val); return this; }
  in(col: string, vals: any[]) { this.qb.in(col, vals); return this; }
  select(cols?: string) { this.qb.select(cols); return this; }
  single() { this.qb.single(); return this; }

  then(resolve: any, reject?: any) {
    return this.qb.then(resolve, reject);
  }

  catch(handler: any) {
    return this.qb.catch(handler);
  }

  finally(handler: any) {
    return this.qb.finally(handler);
  }
}

class DeleteBuilder {
  private qb: QueryBuilder;

  constructor(table: string) {
    this.qb = new QueryBuilder(table);
    (this.qb as any)._mode = "delete";
  }

  eq(col: string, val: any) { this.qb.eq(col, val); return this; }
  neq(col: string, val: any) { this.qb.neq(col, val); return this; }
  in(col: string, vals: any[]) { this.qb.in(col, vals); return this; }

  then(resolve: any, reject?: any) {
    return this.qb.then(resolve, reject);
  }

  catch(handler: any) {
    return this.qb.catch(handler);
  }

  finally(handler: any) {
    return this.qb.finally(handler);
  }
}

class UpsertBuilder {
  private qb: QueryBuilder;

  constructor(table: string, data: Row | Row[]) {
    this.qb = new QueryBuilder(table);
    (this.qb as any)._mode = "upsert";
    (this.qb as any)._insertData = Array.isArray(data) ? data : [data];
  }

  select(cols?: string) { this.qb.select(cols); return this; }
  single() { this.qb.single(); return this; }

  then(resolve: any, reject?: any) {
    return this.qb.then(resolve, reject);
  }

  catch(handler: any) {
    return this.qb.catch(handler);
  }

  finally(handler: any) {
    return this.qb.finally(handler);
  }
}

// ── Table proxy ──────────────────────────────────────────────────

class TableRef {
  constructor(private table: string) {}

  select(cols?: string, opts?: { count?: string; head?: boolean }) {
    const qb = new QueryBuilder(this.table);
    return qb.select(cols, opts);
  }

  insert(data: Row | Row[]) {
    return new InsertBuilder(this.table, data);
  }

  update(data: Row) {
    return new UpdateBuilder(this.table, data);
  }

  delete() {
    return new DeleteBuilder(this.table);
  }

  upsert(data: Row | Row[]) {
    return new UpsertBuilder(this.table, data);
  }
}

// ── Channel mock ─────────────────────────────────────────────────

class ChannelMock {
  private handlers: Array<{ table: string; event: string; callback: Listener }> = [];

  on(event: string, opts: any, callback: Listener) {
    if (typeof opts === "object" && opts.table) {
      this.handlers.push({ table: opts.table, event: opts.event || "*", callback });
    }
    return this;
  }

  subscribe(callback?: (status: string) => void) {
    for (const h of this.handlers) {
      store.subscribe(h.table, (payload) => {
        if (h.event === "*" || h.event === payload.eventType) {
          h.callback(payload as any);
        }
      });
    }
    if (callback) callback("SUBSCRIBED");
    return this;
  }

  unsubscribe() {
    // Clean up listeners
    return Promise.resolve();
  }
}

// ── Functions mock ───────────────────────────────────────────────

class FunctionsMock {
  async invoke(name: string, opts?: { body?: any }) {
    // Return empty success for all function calls
    console.log(`[localStore] functions.invoke("${name}") — returning mock response`);
    return { data: { success: true }, error: null };
  }
}

// ── Storage mock ─────────────────────────────────────────────────

class StorageBucketMock {
  constructor(private bucket: string) {}

  async upload(path: string, file: File | Blob) {
    console.log(`[localStore] storage.upload("${this.bucket}/${path}") — skipped (local mode)`);
    return { data: { path }, error: null };
  }

  async download(path: string) {
    return { data: null, error: { message: "Not available in local mode" } };
  }

  getPublicUrl(path: string) {
    return { data: { publicUrl: `local://${this.bucket}/${path}` } };
  }
}

class StorageMock {
  from(bucket: string) {
    return new StorageBucketMock(bucket);
  }
}

// ── Main export ──────────────────────────────────────────────────

export const localSupabase = {
  from(table: string) {
    return new TableRef(table);
  },

  channel(name: string) {
    return new ChannelMock();
  },

  removeChannel(channel: any) {
    return Promise.resolve();
  },

  functions: new FunctionsMock(),
  storage: new StorageMock(),

  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: (callback: any) => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
};

export default localSupabase;
