import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { WikiContrib, WikiUser } from '../types';

interface StoredDataset {
    id: string; // username@lang
    username: string;
    lang: string;
    lastUpdated: string; // ISO Date of save
    timestamp: number;   // Timestamp for sorting
    rangeStart: string;
    rangeEnd: string;
    user: WikiUser;
    contributions: WikiContrib[];
}

// One page's categories as cached. The store is keyed by page id rather than
// title so a page move does not orphan the entry, and it is shared by every
// report: two editors working the same article pay for the lookup once.
export interface CachedPageCategories {
    id: string;           // `${lang}:${pageid}`
    lang: string;
    pageid: number;
    title: string;
    categories: string[]; // An empty array is a real answer: no visible categories
    missing?: boolean;    // Page id no longer resolves — cached so we stop asking
    fetchedAt: number;
}

interface WikiAnalyticsDB extends DBSchema {
    datasets: {
        key: string;
        value: StoredDataset;
        indexes: { 'timestamp': number };
    };
    pageCategories: {
        key: string;
        value: CachedPageCategories;
    };
}

const DB_NAME = 'wiki-analytics-v1';
const DB_VERSION = 2;

export class WikiStorage {
    private dbPromise: Promise<IDBPDatabase<WikiAnalyticsDB>>;

    constructor() {
        this.dbPromise = openDB<WikiAnalyticsDB>(DB_NAME, DB_VERSION, {
            // Each step is guarded on oldVersion so an existing database keeps
            // its saved reports when a new store is introduced.
            upgrade(db, oldVersion) {
                if (oldVersion < 1) {
                    const store = db.createObjectStore('datasets', { keyPath: 'id' });
                    store.createIndex('timestamp', 'timestamp');
                }
                if (oldVersion < 2) {
                    db.createObjectStore('pageCategories', { keyPath: 'id' });
                }
            },
        });
    }

    async save(username: string, lang: string, user: WikiUser, contibs: WikiContrib[], rangeStart: string, rangeEnd: string) {
        const db = await this.dbPromise;
        const id = `${username}@${lang}`;
        const now = new Date();

        const dataset: StoredDataset = {
            id,
            username,
            lang,
            lastUpdated: now.toISOString(),
            timestamp: now.getTime(),
            rangeStart,
            rangeEnd,
            user,
            contributions: contibs
        };

        await db.put('datasets', dataset);
    }

    async load(username: string, lang: string): Promise<StoredDataset | undefined> {
        const db = await this.dbPromise;
        const id = `${username}@${lang}`;
        return db.get('datasets', id);
    }

    async listUsers(): Promise<Omit<StoredDataset, 'contributions' | 'user'>[]> {
        const db = await this.dbPromise;
        const datasets = await db.getAllFromIndex('datasets', 'timestamp');
        // Return newest first
        return datasets.reverse().map(({ contributions, user, ...meta }) => meta);
    }

    async delete(username: string, lang: string) {
        const db = await this.dbPromise;
        const id = `${username}@${lang}`;
        await db.delete('datasets', id);
    }

    // Reads whatever of the requested page ids the cache already holds. Pages
    // that were never looked up are simply absent from the result.
    async getCachedCategories(lang: string, pageids: number[]): Promise<Map<number, CachedPageCategories>> {
        const found = new Map<number, CachedPageCategories>();
        if (pageids.length === 0) return found;

        const db = await this.dbPromise;
        const tx = db.transaction('pageCategories', 'readonly');
        const results = await Promise.all(
            pageids.map(pageid => tx.store.get(`${lang}:${pageid}`))
        );
        await tx.done;

        results.forEach(entry => {
            if (entry) found.set(entry.pageid, entry);
        });
        return found;
    }

    async putCachedCategories(entries: CachedPageCategories[]) {
        if (entries.length === 0) return;

        const db = await this.dbPromise;
        const tx = db.transaction('pageCategories', 'readwrite');
        await Promise.all(entries.map(entry => tx.store.put(entry)));
        await tx.done;
    }
}

export const storage = new WikiStorage();
