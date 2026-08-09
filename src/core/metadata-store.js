import fs from 'fs';
import path from 'path';
import { LineageDAG } from './lineage-dag.js';

const DATA_FILE = path.join(process.cwd(), 'metadata-db.json');

export class MetadataStore {
  constructor() {
    this.dag = new LineageDAG();
    this.tableSchemas = new Map();
    this.loadFromDisk();
  }

  addSchema(tableName, columns) {
    this.tableSchemas.set(tableName, columns);
    this.saveToDisk();
  }

  getSchema(tableName) {
    return this.tableSchemas.get(tableName) || [];
  }

  saveToDisk() {
    try {
      const payload = {
        graph: Array.from(this.dag.graph.entries()).map(([k, v]) => [k, Array.from(v)]),
        schemas: Array.from(this.tableSchemas.entries())
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2));
    } catch (err) {
      console.error('[MetadataStore] Save error:', err.message);
    }
  }

  loadFromDisk() {
    if (!fs.existsSync(DATA_FILE)) return;
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const data = JSON.parse(raw);
      
      if (data.schemas) {
        this.tableSchemas = new Map(data.schemas);
      }
      if (data.graph) {
        data.graph.forEach(([target, sources]) => {
          sources.forEach(src => this.dag.addEdge(target, src));
        });
      }
    } catch (err) {
      console.error('[MetadataStore] Load error:', err.message);
    }
  }
}

export const store = new MetadataStore();